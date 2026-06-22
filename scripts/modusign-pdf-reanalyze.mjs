/**
 * 분석 실패 계약 재분석 스크립트
 * 에이전트(피터보이스)가 [modusign-analysis-failed] 릴레이 수신 시 실행
 *
 * - pdf_error IS NOT NULL인 COMPLETED 계약 대상
 * - Supabase Storage에서 PDF 직접 다운로드 → gpt-4.1 재분석
 * - 성공: DB 업데이트 (pdf_error=null, pdf_analyzed=true)
 * - 실패: pdf_error 갱신 + 원인 분류 반환
 *
 * 실행: node scripts/modusign-pdf-reanalyze.mjs
 * 옵션: MAX_COUNT=10, DRY_RUN=1
 */

import fs from 'fs';
import https from 'https';
import http from 'http';

const envPath = new URL('../.env.local', import.meta.url).pathname;
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY    = process.env.OPENAI_API_KEY;
const STORAGE_BUCKET = 'contract-pdfs';
const PDF_DIR       = '/tmp/modusign-pdfs-reanalyze';
const MAX_COUNT     = parseInt(process.env.MAX_COUNT || '9999');
const DRY_RUN       = process.env.DRY_RUN === '1';
const CONCURRENT    = parseInt(process.env.CONCURRENT || '3');

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Supabase 환경변수 없음'); process.exit(1); }
if (!OPENAI_KEY) { console.error('OPENAI_API_KEY 없음'); process.exit(1); }

fs.mkdirSync(PDF_DIR, { recursive: true });

const log = (msg) => console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`);
const SB_HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`GET 실패: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(table, match, data) {
  if (DRY_RUN) return;
  const params = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PATCH 실패: ${res.status} ${await res.text()}`);
}

// 실패 유형 분류
function classifyError(errMsg) {
  if (!errMsg) return 'unknown';
  const e = errMsg.toLowerCase();
  if (e.includes('corrupted') || e.includes('badly formatted')) return 'corrupted_pdf';
  if (e.includes('quota') || e.includes('rate limit') || e.includes('429')) return 'api_quota';
  if (e.includes('timeout') || e.includes('timed out')) return 'timeout';
  if (e.includes('22007') || e.includes('22008') || e.includes('invalid_datetime')) return 'date_parse';
  if (e.includes('storage') || e.includes('pdf_storage_path')) return 'no_storage';
  return 'other';
}

// Supabase Storage에서 PDF 다운로드
async function downloadFromStorage(storagePath, filepath) {
  const { data: signed } = await (async () => {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${storagePath}`,
      { method: 'POST', headers: { ...SB_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) }
    );
    return res.json();
  })();
  const signedUrl = signed?.signedURL ? `${SUPABASE_URL}/storage/v1${signed.signedURL}` : null;
  if (!signedUrl) throw new Error('Storage 서명 URL 생성 실패');
  return downloadFile(signedUrl, filepath);
}

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    proto.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlink(filepath, () => {});
        return downloadFile(res.headers.location, filepath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlink(filepath, () => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(filepath); });
    }).on('error', err => { file.close(); fs.unlink(filepath, () => {}); reject(err); });
  });
}

const ANALYSIS_PROMPT = `다음은 더그림엔터테인먼트의 전자계약서 PDF입니다.
아래 항목들을 한국어로 추출해주세요. 해당 항목이 없으면 null로 표시하세요.

추출 항목:
- category: 카테고리 추정 (웹툰/굿즈/카페/인사/총무/자금/기타 중 하나)
- classification: 매출 또는 매입 (해당 없으면 null)
- counterparty: 거래 상대방 이름 (더그림엔터테인먼트가 아닌 상대방)
- contract_start: 계약 시작일 (YYYY-MM-DD)
- contract_end: 계약 종료일 (YYYY-MM-DD, 없으면 null)
- total_amount: 총 계약금액 (숫자만, 원 단위, 없으면 null)
- prepayment: 선금/계약금 (숫자만, 없으면 null)
- prepayment_due: 선금 지급일 (YYYY-MM-DD, 없으면 null)
- interim_payment: 중도금 (숫자만, 없으면 null)
- interim_due: 중도금 지급일 (YYYY-MM-DD, 없으면 null)
- balance_payment: 잔금 (숫자만, 없으면 null)
- balance_due: 잔금 지급일 (YYYY-MM-DD, 없으면 null)
- settlement_ratio: 정산비율 (소수점, 예: 0.15, 없으면 null)
- settlement_method: 정산방식 (예: RS, MG+RS 등, 없으면 null)
- settlement_date: 정산일/지급일 주기 설명 (없으면 null)
- summary: 계약 주요 내용 1~2줄 요약
- special_terms: 특약 사항 요약 (있으면 기술, 없으면 null)

반드시 JSON 형식으로만 응답하세요.`;

function safeDate(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  const y = parseInt(trimmed.slice(0, 4));
  return (y >= 1900 && y <= 2100) ? trimmed : null;
}
function safeNum(val) {
  if (val == null || val === '') return null;
  const n = Number(val); return (isFinite(n) && n >= 0) ? n : null;
}
function safeRatio(val) {
  if (val == null || val === '') return null;
  const n = Number(val); return (isFinite(n) && n >= 0 && n <= 1) ? n : null;
}

async function analyzeWithGpt(filepath) {
  const base64 = fs.readFileSync(filepath).toString('base64');
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4.1',
      input: [{ role: 'user', content: [
        { type: 'input_file', filename: 'contract.pdf', file_data: `data:application/pdf;base64,${base64}` },
        { type: 'input_text', text: ANALYSIS_PROMPT },
      ]}],
      text: { format: { type: 'json_object' } },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
  const content = data.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text;
  if (!content) throw new Error('응답 content 없음');
  return JSON.parse(content);
}

async function reanalyzeContract(row) {
  const { document_id, title, pdf_storage_path, pdf_error } = row;
  const errType = classifyError(pdf_error);
  const shortTitle = (title || document_id).slice(0, 40);

  // 손상 PDF는 재시도 불가
  if (errType === 'corrupted_pdf') {
    log(`  ⛔ [${shortTitle}] 손상 PDF — 스킵`);
    return { document_id, title, status: 'skip', reason: 'corrupted_pdf' };
  }

  // Storage에 PDF 없으면 스킵
  if (!pdf_storage_path) {
    log(`  ⛔ [${shortTitle}] Storage PDF 없음 — 스킵`);
    return { document_id, title, status: 'skip', reason: 'no_storage' };
  }

  const filepath = `${PDF_DIR}/${document_id}.pdf`;
  try {
    await downloadFromStorage(pdf_storage_path, filepath);
    const result = await analyzeWithGpt(filepath);

    const update = {
      counterparty:      result.counterparty      || null,
      contract_start:    safeDate(result.contract_start),
      contract_end:      safeDate(result.contract_end),
      total_amount:      safeNum(result.total_amount),
      prepayment:        safeNum(result.prepayment),
      prepayment_due:    safeDate(result.prepayment_due),
      interim_payment:   safeNum(result.interim_payment),
      interim_due:       safeDate(result.interim_due),
      balance_payment:   safeNum(result.balance_payment),
      balance_due:       safeDate(result.balance_due),
      settlement_ratio:  safeRatio(result.settlement_ratio),
      settlement_method: result.settlement_method  || null,
      settlement_date:   result.settlement_date    || null,
      category:          result.category           || null,
      classification:    result.classification     || null,
      summary:           result.summary            || null,
      special_terms:     result.special_terms      || null,
      pdf_analyzed:      true,
      pdf_analyzed_at:   new Date().toISOString(),
      pdf_model:         'gpt-4.1',
      pdf_error:         null,
    };

    await sbPatch('modusign_contracts', { document_id }, update);
    log(`  ✅ [${shortTitle}] 재분석 성공 (이전 오류: ${errType})`);
    return { document_id, title, status: 'success', prev_error: errType };
  } catch (e) {
    const newErrType = classifyError(e.message);
    log(`  ❌ [${shortTitle}] 재분석 실패: ${e.message.slice(0, 80)}`);
    await sbPatch('modusign_contracts', { document_id }, {
      pdf_error: `[재분석 실패 ${new Date().toISOString().slice(0,10)}] ${e.message.slice(0, 200)}`,
      pdf_analyzed: false,
    }).catch(() => {});
    return { document_id, title, status: 'fail', reason: newErrType, error: e.message.slice(0, 100) };
  } finally {
    try { fs.unlinkSync(filepath); } catch {}
  }
}

async function runConcurrent(tasks, concurrency) {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) { const t = queue.shift(); if (t) await t(); }
  });
  await Promise.all(workers);
}

async function main() {
  log('=== 모두싸인 분석 실패 재분석 시작 ===');
  if (DRY_RUN) log('🔵 DRY_RUN 모드');

  const rows = await sbGet(
    `/modusign_contracts?status=eq.COMPLETED&pdf_error=not.is.null&select=document_id,title,pdf_storage_path,pdf_error&limit=${MAX_COUNT}&order=document_id.asc`
  );
  log(`재분석 대상: ${rows.length}건`);
  if (!rows.length) { log('재분석할 건 없음'); return { total: 0 }; }

  const results = [];
  const tasks = rows.map(row => async () => { results.push(await reanalyzeContract(row)); });
  await runConcurrent(tasks, CONCURRENT);

  const success = results.filter(r => r.status === 'success');
  const skipped = results.filter(r => r.status === 'skip');
  const failed  = results.filter(r => r.status === 'fail');

  log(`\n=== 재분석 완료 ===`);
  log(`✅ 성공: ${success.length}건 | ⛔ 스킵: ${skipped.length}건 | ❌ 실패: ${failed.length}건`);

  if (skipped.length > 0) {
    log('\n스킵 목록 (수동 확인 필요):');
    skipped.forEach(r => log(`  - ${r.title?.slice(0, 40)} (${r.reason})`));
  }
  if (failed.length > 0) {
    log('\n재시도 실패 목록:');
    failed.forEach(r => log(`  - ${r.title?.slice(0, 40)}: ${r.error}`));
  }

  return { total: rows.length, success: success.length, skipped, failed };
}

// 외부에서 import해서 결과를 받아 쓸 수 있도록 export
export { main as reanalyze };

// 직접 실행 시
main().then(result => {
  if (result) console.log('\n[RESULT]', JSON.stringify(result, null, 2));
}).catch(e => { console.error(e); process.exit(1); });
