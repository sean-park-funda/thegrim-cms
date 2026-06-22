/**
 * 모두싸인 PDF 분석 모델 비교 실험
 * - 10개 샘플 계약서 PDF 다운로드
 * - GPT-4o, GPT-4o-mini, Gemini 1.5 Pro, Gemini 2.0 Flash로 분석
 * - 결과를 JSON + Markdown 문서로 저장
 *
 * 실행: node scripts/modusign-pdf-experiment.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';

// ── 설정 ──────────────────────────────────────────
const MODUSIGN_EMAIL    = 'jstudio@ptjcomics.com';
const MODUSIGN_PASSWORD = 'qkrxowns1!';
const OUTPUT_DIR        = '/tmp/modusign-experiment';
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;

// 실험 대상 10개 document_id
const TARGET_IDS = [
  'f9652010-68a6-11f1-bcfe-f94fc8919c4f', // 어시스턴스 계약서(밑색) - 병장팀
  'b842a030-68a6-11f1-9e78-c928e8c36018', // 비밀 유지 서약서 - 병장팀
  '753ef680-68a1-11f1-b609-1f4521c68db6', // 외주 용역 계약서(톤먹) - 잉크드
  'f587db50-68a5-11f1-a033-2d8f553b6df6', // 어시스턴스 계약서(밑색) - 소년법칙
  '6e0148b0-68a0-11f1-a033-2d8f553b6df6', // 비밀 유지 서약서 - 팀유호빈
  'e115ed20-687c-11f1-8e11-0b2ad29a2254', // 외주 용역 계약서(메인 캐릭터) - 메이저
  '01986a90-687e-11f1-9026-43fb6a0442ff', // 비밀 유지 계약서 - 네오스토리
  'aba08130-655e-11f1-8ae1-cf8b1952390c', // 자동차매매계약서(포르쉐)
  'cc9a0690-6563-11f1-ad19-d1d8be9e02c0', // 개짓 3권 세트 상품 공급 계약 - 콘텐츠팀
  'fb96a1e0-63cb-11f1-ac4e-4d6cc5c16b07', // 프론트서울 - 서유진
];

// 분석 프롬프트
const ANALYSIS_PROMPT = `다음은 더그림엔터테인먼트의 전자계약서 PDF입니다.
아래 항목들을 한국어로 추출해주세요. 해당 항목이 없으면 null로 표시하세요.

추출 항목:
- contract_type: 계약 종류 (예: 어시스턴스 계약, 비밀유지 계약, 외주용역 계약, 상품공급 계약, 매매계약 등)
- category: 카테고리 추정 (웹툰/굿즈/카페/인사/총무/자금/기타 중 하나)
- classification: 매출 또는 매입
- counterparty: 거래 상대방 이름 (개인 또는 법인명)
- contract_start: 계약 시작일 (YYYY-MM-DD)
- contract_end: 계약 종료일 (YYYY-MM-DD)
- total_amount: 총 계약금액 (숫자만, 원 단위)
- prepayment: 선금/계약금 (숫자만)
- prepayment_due: 선금 지급일 (YYYY-MM-DD)
- interim_payment: 중도금 (숫자만)
- interim_due: 중도금 지급일 (YYYY-MM-DD)
- balance_payment: 잔금 (숫자만)
- balance_due: 잔금 지급일 (YYYY-MM-DD)
- settlement_ratio: 정산비율 (소수점, 예: 0.15 = 15%)
- settlement_method: 정산방식 (예: RS, MG+RS 등)
- settlement_date: 정산일/지급일 주기 설명
- summary: 계약 주요 내용 1~2줄 요약
- special_terms: 특약 사항 요약 (있으면)

반드시 JSON 형식으로만 응답하세요. 다른 설명 없이 JSON만:
{
  "contract_type": "...",
  "category": "...",
  "classification": "...",
  "counterparty": "...",
  "contract_start": "...",
  "contract_end": "...",
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

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(`${OUTPUT_DIR}/pdfs`, { recursive: true });

function log(msg) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }

// ── PDF 다운로드 ──────────────────────────────────
async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(filepath); });
    }).on('error', err => { fs.unlink(filepath, () => {}); reject(err); });
  });
}

// ── Modusign 로그인 + PDF URL 수집 ───────────────
async function scrapeDocuments() {
  log('Playwright 시작...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const pdfMap = {}; // document_id -> { title, fileUrl, auditUrl }

  try {
    // 로그인
    await page.goto('https://app.modusign.co.kr', { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2000);
    const popup = page.locator('text=그래도 로그인하기');
    if (await popup.isVisible({ timeout: 3000 }).catch(() => false)) {
      await popup.click(); await page.waitForTimeout(2000);
    }
    if (page.url().includes('/authentication/signin')) {
      await page.fill('input[type="email"]', MODUSIGN_EMAIL);
      await page.fill('input[type="password"]', MODUSIGN_PASSWORD);
      await page.click('button:has-text("이메일로 로그인")');
      await Promise.race([
        page.waitForURL('**/esign/**', { timeout: 30000 }),
        page.waitForSelector('text=그래도 로그인하기', { timeout: 30000 }),
      ]).catch(() => {});
      await page.waitForTimeout(2000);
      const popup2 = page.locator('text=그래도 로그인하기');
      if (await popup2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await popup2.click(); await page.waitForTimeout(2000);
      }
    }
    log('로그인 완료');

    // 문서 목록 페이지 → 인터셉트로 전체 수집
    await page.goto('https://app.modusign.co.kr/esign/documents/documents', { waitUntil: 'load', timeout: 60000 });

    const targetSet = new Set(TARGET_IDS);
    let pageNum = 0;
    const PAGE_SIZE = 100;

    while (targetSet.size > 0 && pageNum < 20) {
      const offset = pageNum * PAGE_SIZE;
      log(`  페이지 ${pageNum + 1} 스캔 (남은 타겟: ${targetSet.size}개)...`);

      const data = await new Promise(async (resolve) => {
        let resolved = false;
        const handler = async (response) => {
          const url = response.url();
          if (url.includes('/document/workspaces') && url.includes('/documents?') &&
              url.includes(`offset=${offset}`)) {
            try {
              const d = await response.json();
              if (!resolved) { resolved = true; page.off('response', handler); resolve(d); }
            } catch {}
          }
        };
        page.on('response', handler);
        await page.route('**bff-web.api.modusign.co.kr/document/workspaces**', async (route) => {
          const req = route.request();
          if (req.url().includes('/documents?')) {
            const u = new URL(req.url());
            u.searchParams.set('limit', String(PAGE_SIZE));
            u.searchParams.set('offset', String(offset));
            await route.continue({ url: u.toString() });
          } else { await route.continue(); }
        });
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); } catch {}
        await new Promise(r => setTimeout(r, 4000));
        try { await page.unrouteAll(); } catch {}
        setTimeout(() => { if (!resolved) { resolved = true; try { page.off('response', handler); } catch {} resolve(null); } }, 3000);
      });

      if (!data?.documents) { pageNum++; continue; }

      for (const doc of data.documents) {
        if (targetSet.has(doc.id)) {
          pdfMap[doc.id] = {
            title: doc.title,
            fileUrl: doc.file?.url || null,
            auditUrl: doc.auditTrail?.url || null,
            labels: (doc.labels || []).map(l => l.name),
            participants: (doc.participants || []).filter(p => p.type === 'SIGNER').map(p => p.name),
            completedAt: doc.finishedAt,
          };
          targetSet.delete(doc.id);
          log(`  ✅ 발견: ${doc.title?.slice(0, 40)}`);
        }
      }

      pageNum++;
    }
  } finally {
    await browser.close();
  }

  return pdfMap;
}

// ── PDF → base64 ──────────────────────────────────
function pdfToBase64(filepath) {
  return fs.readFileSync(filepath).toString('base64');
}

// ── OpenAI 분석 (Responses API - PDF 지원) ───────
async function analyzeWithOpenAI(base64Pdf, model) {
  const body = JSON.stringify({
    model,
    input: [{
      role: 'user',
      content: [
        { type: 'input_file', filename: 'contract.pdf', file_data: `data:application/pdf;base64,${base64Pdf}` },
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
  const content = data.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text || '{}';
  return { result: JSON.parse(content), usage: data.usage };
}

// ── Gemini 분석 ──────────────────────────────────
async function analyzeWithGemini(base64Pdf, model) {
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: ANALYSIS_PROMPT },
        { inline_data: { mime_type: 'application/pdf', data: base64Pdf } },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1500 },
  });

  const modelId = model.startsWith('models/') ? model.slice(7) : model;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try {
    return { result: JSON.parse(content), usage: data.usageMetadata };
  } catch {
    // JSON 파싱 실패 시 마크다운 코드블록 제거 후 재시도
    const cleaned = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return { result: JSON.parse(cleaned), usage: data.usageMetadata };
  }
}

// ── 메인 ──────────────────────────────────────────
async function main() {
  log('=== PDF 분석 실험 시작 ===');

  // 1. PDF URL 수집
  log('\n[1단계] Modusign PDF URL 수집...');
  const pdfMap = await scrapeDocuments();
  log(`\n수집 완료: ${Object.keys(pdfMap).length}개`);

  // 2. PDF 다운로드
  log('\n[2단계] PDF 다운로드...');
  const localPdfs = {};
  for (const [id, info] of Object.entries(pdfMap)) {
    if (!info.fileUrl) { log(`  ⚠️ ${id} - URL 없음`); continue; }
    const safeName = (info.title || id).replace(/[/\\?%*:|"<>]/g, '_').slice(0, 60);
    const filepath = `${OUTPUT_DIR}/pdfs/${id}.pdf`;
    try {
      await downloadFile(info.fileUrl, filepath);
      const size = fs.statSync(filepath).size;
      log(`  ✅ ${safeName.slice(0, 40)} (${Math.round(size/1024)}KB)`);
      localPdfs[id] = { ...info, filepath };
    } catch (e) {
      log(`  ❌ ${safeName.slice(0, 40)} - ${e.message}`);
    }
  }

  // 3. 모델별 분석
  const MODELS = [
    { name: 'gpt-4o',           fn: (b64) => analyzeWithOpenAI(b64, 'gpt-4o') },
    { name: 'gpt-4.1',          fn: (b64) => analyzeWithOpenAI(b64, 'gpt-4.1') },
    { name: 'gpt-4.1-mini',     fn: (b64) => analyzeWithOpenAI(b64, 'gpt-4.1-mini') },
    { name: 'gemini-2.5-flash', fn: (b64) => analyzeWithGemini(b64, 'gemini-2.5-flash') },
    { name: 'gemini-2.5-pro',   fn: (b64) => analyzeWithGemini(b64, 'gemini-2.5-pro') },
    { name: 'gemini-2.0-flash-001', fn: (b64) => analyzeWithGemini(b64, 'gemini-2.0-flash-001') },
  ];

  log('\n[3단계] 모델 분석...');
  const allResults = {};

  for (const [id, info] of Object.entries(localPdfs)) {
    log(`\n📄 ${info.title?.slice(0, 50)}`);
    allResults[id] = { info, modelResults: {} };
    const base64 = pdfToBase64(info.filepath);

    for (const model of MODELS) {
      try {
        const start = Date.now();
        const { result, usage } = await model.fn(base64);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        allResults[id].modelResults[model.name] = { result, usage, elapsed_s: parseFloat(elapsed) };
        log(`  [${model.name}] ✅ ${elapsed}s`);
      } catch (e) {
        log(`  [${model.name}] ❌ ${e.message.slice(0, 80)}`);
        allResults[id].modelResults[model.name] = { error: e.message };
      }
      await new Promise(r => setTimeout(r, 500)); // rate limit 방지
    }
  }

  // 4. 결과 저장
  fs.writeFileSync(`${OUTPUT_DIR}/results.json`, JSON.stringify(allResults, null, 2));
  log('\n결과 JSON 저장: ' + OUTPUT_DIR + '/results.json');

  // 5. Markdown 비교 문서 생성
  const mdLines = [
    '# 모두싸인 계약서 PDF 분석 모델 비교 실험',
    '',
    `실험일: ${new Date().toISOString().slice(0, 10)}  `,
    `대상: ${Object.keys(localPdfs).length}개 계약서 샘플  `,
    `모델: ${MODELS.map(m => m.name).join(', ')}`,
    '',
    '---',
    '',
  ];

  const FIELDS = [
    'contract_type', 'category', 'classification', 'counterparty',
    'contract_start', 'contract_end', 'total_amount',
    'prepayment', 'prepayment_due', 'balance_payment', 'balance_due',
    'settlement_ratio', 'settlement_method', 'summary', 'special_terms',
  ];

  let contractNum = 0;
  for (const [id, data] of Object.entries(allResults)) {
    contractNum++;
    mdLines.push(`## ${contractNum}. ${data.info.title || id}`);
    mdLines.push('');
    mdLines.push(`- **라벨**: ${data.info.labels?.join(', ') || '없음'}`);
    mdLines.push(`- **서명자**: ${data.info.participants?.join(', ') || '-'}`);
    mdLines.push(`- **체결일**: ${data.info.completedAt?.slice(0, 10) || '-'}`);
    mdLines.push('');

    if (Object.keys(data.modelResults).length === 0) {
      mdLines.push('> PDF 다운로드 실패');
      mdLines.push('');
      continue;
    }

    // 컬럼별 모델 비교 테이블
    const modelNames = MODELS.map(m => m.name);
    mdLines.push('| 항목 | ' + modelNames.join(' | ') + ' |');
    mdLines.push('|------|' + modelNames.map(() => '------').join('|') + '|');

    for (const field of FIELDS) {
      const cells = modelNames.map(mn => {
        const mr = data.modelResults[mn];
        if (!mr || mr.error) return '❌';
        const val = mr.result?.[field];
        if (val === null || val === undefined) return '-';
        return String(val).replace(/\|/g, '\\|').slice(0, 30);
      });
      mdLines.push(`| ${field} | ${cells.join(' | ')} |`);
    }

    // 속도 비교
    mdLines.push('');
    mdLines.push('**처리 시간:**');
    for (const mn of modelNames) {
      const mr = data.modelResults[mn];
      if (mr?.elapsed_s) mdLines.push(`- ${mn}: ${mr.elapsed_s}s`);
    }
    mdLines.push('');
    mdLines.push('---');
    mdLines.push('');
  }

  // 종합 평가 섹션
  mdLines.push('## 종합 평가');
  mdLines.push('');
  mdLines.push('| 모델 | 평균 처리시간 | 성공률 | 비고 |');
  mdLines.push('|------|-------------|--------|------|');
  for (const model of MODELS) {
    const times = Object.values(allResults)
      .map(d => d.modelResults[model.name]?.elapsed_s)
      .filter(Boolean);
    const errors = Object.values(allResults)
      .filter(d => d.modelResults[model.name]?.error).length;
    const avgTime = times.length ? (times.reduce((a,b)=>a+b,0)/times.length).toFixed(1) : '-';
    const successRate = `${Object.keys(localPdfs).length - errors}/${Object.keys(localPdfs).length}`;
    mdLines.push(`| ${model.name} | ${avgTime}s | ${successRate} | |`);
  }
  mdLines.push('');

  const mdContent = mdLines.join('\n');
  fs.writeFileSync(`${OUTPUT_DIR}/comparison.md`, mdContent);
  log('비교 문서 저장: ' + OUTPUT_DIR + '/comparison.md');
  log('\n=== 실험 완료 ===');
}

main().catch(e => { console.error(e); process.exit(1); });
