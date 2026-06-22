/**
 * 모두싸인 전체 계약서 PDF 분석 — gpt-4.1 배치
 *
 * 흐름:
 *  1) Supabase에서 COMPLETED & pdf_analyzed!=true 목록 전부 가져옴 (페이지네이션)
 *  2) Playwright로 Modusign 페이지를 순회하며 PDF URL 수집
 *  3) 페이지별로 PDF 즉시 다운로드 (pre-signed URL 만료 전)
 *  4) gpt-4.1로 분석 (CONCURRENT 수만큼 병렬)
 *  5) Supabase 업데이트 → pdf_analyzed=true
 *
 * 실행:
 *   node scripts/modusign-pdf-analyze.mjs
 *
 * 옵션:
 *   MAX_COUNT=50     최대 처리 건수 (테스트용)
 *   CONCURRENT=5     동시 분석 수 (기본 5)
 *   DRY_RUN=1        Supabase 업데이트 없이 로그만
 *   START_PAGE=0     시작 Modusign 페이지 번호
 */

import { chromium } from 'playwright';
import fs from 'fs';
import https from 'https';
import http from 'http';

// ── .env.local 로드 ───────────────────────────────
const envPath = new URL('../.env.local', import.meta.url).pathname;
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── 설정 ─────────────────────────────────────────
const MODUSIGN_EMAIL    = 'jstudio@ptjcomics.com';
const MODUSIGN_PASSWORD = 'qkrxowns1!';
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PDF_DIR           = '/tmp/modusign-pdfs-batch';
const MAX_COUNT         = parseInt(process.env.MAX_COUNT || '9999');
const CONCURRENT        = parseInt(process.env.CONCURRENT || '5');
const DRY_RUN           = process.env.DRY_RUN === '1';
const START_PAGE        = parseInt(process.env.START_PAGE || '0');
const PAGE_SIZE         = 100;

if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY 없음'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Supabase 환경변수 없음'); process.exit(1); }

fs.mkdirSync(PDF_DIR, { recursive: true });

const log = (msg) => console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`);
let processed = 0, succeeded = 0, failed = 0;

// ── 분석 프롬프트 ─────────────────────────────────
const ANALYSIS_PROMPT = `다음은 더그림엔터테인먼트의 전자계약서 PDF입니다.
아래 항목들을 한국어로 추출해주세요. 해당 항목이 없으면 null로 표시하세요.

추출 항목:
- contract_type: 계약 종류 (예: 어시스턴스 계약, 비밀유지 계약, 외주용역 계약, 상품공급 계약, 매매계약 등)
- category: 카테고리 추정 (웹툰/굿즈/카페/인사/총무/자금/기타 중 하나)
- classification: 매출 또는 매입 (해당 없으면 null)
- counterparty: 거래 상대방 이름 (더그림엔터테인먼트가 아닌 상대방, 개인 또는 법인명)
- contract_start: 계약 시작일 (YYYY-MM-DD)
- contract_end: 계약 종료일 (YYYY-MM-DD, 없으면 null)
- total_amount: 총 계약금액 (숫자만, 원 단위, 없으면 null)
- prepayment: 선금/계약금 (숫자만, 없으면 null)
- prepayment_due: 선금 지급일 (YYYY-MM-DD, 없으면 null)
- interim_payment: 중도금 (숫자만, 없으면 null)
- interim_due: 중도금 지급일 (YYYY-MM-DD, 없으면 null)
- balance_payment: 잔금 (숫자만, 없으면 null)
- balance_due: 잔금 지급일 또는 조건 (문자열, 없으면 null)
- settlement_ratio: 정산비율 (소수점, 예: 0.15 = 15%, 없으면 null)
- settlement_method: 정산방식 (예: RS, MG+RS 등, 없으면 null)
- settlement_date: 정산일/지급일 주기 설명 (없으면 null)
- summary: 계약 주요 내용 1~2줄 요약
- special_terms: 특약 사항 요약 (있으면 기술, 없으면 null)

반드시 JSON 형식으로만 응답하세요:
{
  "contract_type": "...",
  "category": "...",
  "classification": null,
  "counterparty": "...",
  "contract_start": "...",
  "contract_end": null,
  "total_amount": null,
  "prepayment": null,
  "prepayment_due": null,
  "interim_payment": null,
  "interim_due": null,
  "balance_payment": null,
  "balance_due": null,
  "settlement_ratio": null,
  "settlement_method": null,
  "settlement_date": null,
  "summary": "...",
  "special_terms": null
}`;

// ── Supabase REST ─────────────────────────────────
const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`Supabase GET 실패: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabasePatch(table, match, data) {
  if (DRY_RUN) return;
  const params = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH 실패: ${res.status} ${await res.text()}`);
}

// Supabase 기본 1,000행 제한 → 페이지네이션으로 전체 수집
async function getAllUnanalyzedIds() {
  const all = new Map();
  let offset = 0;
  const limit = 1000;
  while (true) {
    const rows = await supabaseGet(
      `/modusign_contracts?status=eq.COMPLETED&or=(pdf_analyzed.is.null,pdf_analyzed.eq.false)&select=document_id,title,pdf_storage_path&limit=${limit}&offset=${offset}&order=document_id.asc`
    );
    if (!rows.length) break;
    for (const r of rows) all.set(r.document_id, { title: r.title, storagePath: r.pdf_storage_path });
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

// ── Supabase Storage에서 PDF 다운로드 (service key 인증) ──
const STORAGE_BUCKET = 'contract-pdfs';
async function downloadFromStorage(storagePath, filepath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Storage 다운로드 실패: ${res.status}`);
  fs.writeFileSync(filepath, Buffer.from(await res.arrayBuffer()));
  return filepath;
}

// ── PDF 다운로드 ──────────────────────────────────
async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    const req = proto.get(url, res => {
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
    });
    req.on('error', err => { file.close(); fs.unlink(filepath, () => {}); reject(err); });
  });
}

// ── OpenAI 분석 ──────────────────────────────────
async function analyzeWithGpt41(filepath) {
  const base64 = fs.readFileSync(filepath).toString('base64');
  const body = JSON.stringify({
    model: 'gpt-4.1',
    input: [{
      role: 'user',
      content: [
        { type: 'input_file', filename: 'contract.pdf', file_data: `data:application/pdf;base64,${base64}` },
        { type: 'input_text', text: ANALYSIS_PROMPT },
      ],
    }],
    text: { format: { type: 'json_object' } },
  });

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
  const content = data.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text;
  if (!content) throw new Error('응답 content 없음');
  return { result: JSON.parse(content), usage: data.usage };
}

// ── 동시성 제어 ───────────────────────────────────
async function runConcurrent(tasks, concurrency) {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) await task();
    }
  });
  await Promise.all(workers);
}

// ── Modusign 로그인 ───────────────────────────────
async function loginModusign(page) {
  await page.goto('https://app.modusign.co.kr', { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  const dismissPopup = async () => {
    const btn = page.locator('text=그래도 로그인하기');
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await new Promise(r => setTimeout(r, 2000));
    }
  };
  await dismissPopup();

  if (page.url().includes('/authentication/signin')) {
    await page.fill('input[type="email"]', MODUSIGN_EMAIL);
    await page.fill('input[type="password"]', MODUSIGN_PASSWORD);
    await page.click('button:has-text("이메일로 로그인")');
    await Promise.race([
      page.waitForURL('**/esign/**', { timeout: 30000 }),
      page.waitForSelector('text=그래도 로그인하기', { timeout: 30000 }),
    ]).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await dismissPopup();
  }
  log('Modusign 로그인 완료');
}

// ── Modusign 페이지 스크랩 ─────────────────────────
// BFF 응답의 response URL이 rewrite된 URL인지 확실하지 않으므로
// offset 필터 없이 모든 /documents 응답을 캐치하고, 맨 처음 온 걸 씀.
async function scrapeModusignPage(page, offset) {
  return new Promise(async (resolveOuter) => {
    let resolved = false;
    const done = (val) => {
      if (!resolved) { resolved = true; resolveOuter(val); }
    };

    const handler = async (response) => {
      if (resolved) return;
      const url = response.url();
      if (!url.includes('/document/workspaces') || !url.includes('/documents')) return;
      try {
        const data = await response.json();
        if (data?.documents) done(data);
      } catch {}
    };
    page.on('response', handler);

    await page.route('**bff-web.api.modusign.co.kr/document/workspaces**', async (route) => {
      const req = route.request();
      if (req.url().includes('/documents')) {
        const u = new URL(req.url());
        u.searchParams.set('limit', String(PAGE_SIZE));
        u.searchParams.set('offset', String(offset));
        await route.continue({ url: u.toString() });
      } else {
        await route.continue();
      }
    });

    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch {
      // timeout 무시하고 계속
    }

    // 최대 8초 대기
    await new Promise(r => setTimeout(r, 8000));
    page.off('response', handler);
    try { await page.unrouteAll(); } catch {}
    done(null);
  });
}

// YYYY-MM-DD 형식인지 검증, 아니면 null
function safeDate(val) {
  if (!val || typeof val !== 'string') return null;
  const s = val.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  // 형식은 맞아도 실제 유효한 날짜인지 검증 (예: 2026-13-45, 0000-00-00 → null)
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

// 숫자로 변환 가능한지 검증
function safeNum(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isFinite(n) && n >= 0 ? n : null;
}

// 0~1 사이 비율
function safeRatio(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

// ── 단일 계약 처리 ────────────────────────────────
async function processContractFromFile(id, title, filepath, totalTarget) {
  try {
    const sizeKB = Math.round(fs.statSync(filepath).size / 1024);
    const start = Date.now();
    const { result, usage } = await analyzeWithGpt41(filepath);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    const update = {
      counterparty:      result.counterparty      || null,
      contract_start:    safeDate(result.contract_start),
      contract_end:      safeDate(result.contract_end),
      total_amount:      safeNum(result.total_amount),
      prepayment:        safeNum(result.prepayment),
      balance_payment:   safeNum(result.balance_payment),
      balance_due:       safeDate(result.balance_due),
      interim_payment:   safeNum(result.interim_payment),
      interim_due:       safeDate(result.interim_due),
      prepayment_due:    safeDate(result.prepayment_due),
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

    await supabasePatch('modusign_contracts', { document_id: id }, update);

    const tokens = usage ? `in:${usage.input_tokens}/out:${usage.output_tokens}` : '';
    const pct = totalTarget ? ` [${processed+1}/${totalTarget}]` : '';
    log(`    ✅${pct} ${title?.slice(0,36)} | ${elapsed}s ${sizeKB}KB ${tokens}`);
    succeeded++;
  } catch (e) {
    log(`    ❌ ${title?.slice(0,36)} | ${e.message.slice(0,80)}`);
    failed++;
    try {
      await supabasePatch('modusign_contracts', { document_id: id }, {
        pdf_error: e.message.slice(0, 200),
        pdf_analyzed: false,
      });
    } catch {}
  } finally {
    try { fs.unlinkSync(filepath); } catch {}
    processed++;
  }
}

// ── 메인 ─────────────────────────────────────────
async function main() {
  log('=== 모두싸인 PDF 분석 배치 시작 ===');
  if (DRY_RUN) log('🔵 DRY_RUN 모드 — Supabase 업데이트 없음');

  // 1. Supabase에서 미분석 목록 전체 가져오기 (페이지네이션)
  log('\n[1단계] 미분석 계약 목록 조회 (페이지네이션)...');
  const targetMap = await getAllUnanalyzedIds();
  const totalTarget = Math.min(targetMap.size, MAX_COUNT);
  log(`미분석 COMPLETED: ${targetMap.size}건 (처리 예정: ${totalTarget}건)`);

  if (targetMap.size === 0) {
    log('처리할 계약 없음. 종료.');
    return;
  }

  // 2. Storage에 PDF가 있는 타겟은 모두싸인 거치지 않고 바로 분석
  const storageTargets = [...targetMap.entries()].filter(([, v]) => v.storagePath);
  const noStorageTargets = [...targetMap.entries()].filter(([, v]) => !v.storagePath);

  if (storageTargets.length > 0) {
    log(`\n[2단계] Storage PDF 직접 분석: ${storageTargets.length}건 (동시 ${CONCURRENT})...`);
    const tasks = storageTargets
      .slice(0, MAX_COUNT)
      .map(([id, v]) => async () => {
        const filepath = `${PDF_DIR}/${id}.pdf`;
        try {
          await downloadFromStorage(v.storagePath, filepath);
        } catch (e) {
          log(`    ❌ Storage 다운로드 실패 ${v.title?.slice(0,30)}: ${e.message.slice(0,60)}`);
          try {
            await supabasePatch('modusign_contracts', { document_id: id }, {
              pdf_error: e.message.slice(0, 200), pdf_analyzed: false,
            });
          } catch {}
          failed++; processed++;
          return;
        }
        await processContractFromFile(id, v.title, filepath, totalTarget);
      });
    await runConcurrent(tasks, CONCURRENT);
    log(`  📊 Storage 분석 후: ${processed}/${totalTarget} | ✅${succeeded} ❌${failed}`);
  }

  // 3. Storage에 PDF가 없는 타겟만 Modusign 스크랩으로 폴백
  if (noStorageTargets.length === 0 || processed >= MAX_COUNT) {
    log(`\n=== 완료 ===`);
    log(`총 처리: ${processed}건 | 성공: ${succeeded}건 | 실패: ${failed}건`);
    return;
  }

  log(`\n[3단계] Storage 없는 ${noStorageTargets.length}건 — Modusign 스크랩 폴백...`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    await loginModusign(page);
    await page.goto('https://app.modusign.co.kr/esign/documents/documents', {
      waitUntil: 'load', timeout: 60000,
    });
    await new Promise(r => setTimeout(r, 2000));

    const remaining = new Set(noStorageTargets.map(([id]) => id));
    let modusignPage = START_PAGE;
    const MAX_PAGES = 25;

    while (remaining.size > 0 && modusignPage < MAX_PAGES && processed < MAX_COUNT) {
      const offset = modusignPage * PAGE_SIZE;
      log(`\n📄 Modusign 페이지 ${modusignPage + 1} (offset=${offset}) | 남은 타겟: ${remaining.size}건`);

      const data = await scrapeModusignPage(page, offset);

      if (!data?.documents || data.documents.length === 0) {
        log('  문서 없음 — 마지막 페이지');
        break;
      }
      log(`  → ${data.documents.length}건 수신`);

      // 타겟 필터링
      const matches = data.documents.filter(doc => remaining.has(doc.id) && doc.file?.url);
      log(`  → 타겟 매칭: ${matches.length}건`);

      if (matches.length === 0) { modusignPage++; continue; }
      if (processed + matches.length > MAX_COUNT) {
        matches.splice(MAX_COUNT - processed);
      }

      // PDF 즉시 다운로드
      log(`  ⬇️  ${matches.length}건 다운로드 중...`);
      const readyTasks = [];
      await Promise.all(matches.map(async (doc) => {
        const filepath = `${PDF_DIR}/${doc.id}.pdf`;
        try {
          await downloadFile(doc.file.url, filepath);
          remaining.delete(doc.id);
          readyTasks.push(() => processContractFromFile(
            doc.id, doc.title || targetMap.get(doc.id)?.title, filepath, totalTarget
          ));
        } catch (e) {
          log(`    ❌ 다운로드 실패 ${doc.title?.slice(0,30)}: ${e.message.slice(0,60)}`);
          remaining.delete(doc.id);
          failed++; processed++;
        }
      }));

      // 병렬 분석
      if (readyTasks.length > 0) {
        log(`  🤖 ${readyTasks.length}건 gpt-4.1 분석 중 (동시: ${CONCURRENT})...`);
        await runConcurrent(readyTasks, CONCURRENT);
      }

      const pct = ((processed / totalTarget) * 100).toFixed(1);
      log(`  📊 누적: ${processed}/${totalTarget} (${pct}%) | ✅${succeeded} ❌${failed}`);
      modusignPage++;
    }
  } finally {
    await browser.close();
  }

  log(`\n=== 완료 ===`);
  log(`총 처리: ${processed}건 | 성공: ${succeeded}건 | 실패: ${failed}건`);
  if (processed < totalTarget) {
    log(`남은 건수: ${totalTarget - processed}건 → 재실행하면 이어서 처리됩니다 (pdf_analyzed=false 기준)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
