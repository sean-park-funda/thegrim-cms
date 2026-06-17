/**
 * 모두싸인 계약서 PDF 다운로드 → Supabase Storage 업로드 배치
 *
 * 흐름:
 *  1) Supabase에서 pdf_storage_path IS NULL인 COMPLETED 계약 전체 조회 (페이지네이션)
 *  2) Playwright로 Modusign 로그인 후 페이지별 PDF URL 수집
 *  3) PDF 다운로드 → Supabase Storage contract-pdfs/{document_id}.pdf 업로드
 *  4) modusign_contracts.pdf_storage_path 업데이트
 *
 * 실행:
 *   node scripts/modusign-pdf-download.mjs
 *
 * 옵션:
 *   MAX_COUNT=50     최대 처리 건수
 *   DRY_RUN=1        Storage 업로드/DB 업데이트 없이 로그만
 *   START_PAGE=0     시작 Modusign 페이지
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
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET    = 'contract-pdfs';
const PDF_DIR           = '/tmp/modusign-pdfs-download';
const MAX_COUNT         = parseInt(process.env.MAX_COUNT || '9999');
const DRY_RUN           = process.env.DRY_RUN === '1';
const START_PAGE        = parseInt(process.env.START_PAGE || '0');
const PAGE_SIZE         = 100;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Supabase 환경변수 없음'); process.exit(1); }

fs.mkdirSync(PDF_DIR, { recursive: true });

const log = (msg) => console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`);
let processed = 0, succeeded = 0, failed = 0;

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

async function getTargetIds() {
  const all = new Map();
  let offset = 0;
  const limit = 1000;
  while (true) {
    const rows = await supabaseGet(
      `/modusign_contracts?status=eq.COMPLETED&pdf_storage_path=is.null&select=document_id,title&limit=${limit}&offset=${offset}&order=document_id.asc`
    );
    if (!rows.length) break;
    for (const r of rows) all.set(r.document_id, r.title);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
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

// ── Supabase Storage 업로드 ───────────────────────
async function uploadToStorage(documentId, filepath) {
  if (DRY_RUN) return `${documentId}.pdf`;
  const fileData = fs.readFileSync(filepath);
  const storagePath = `${documentId}.pdf`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: fileData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storage 업로드 실패: ${res.status} ${text}`);
  }
  return storagePath;
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
    } catch {}

    await new Promise(r => setTimeout(r, 8000));
    page.off('response', handler);
    try { await page.unrouteAll(); } catch {}
    done(null);
  });
}

// ── 단일 계약 처리 ────────────────────────────────
async function processContract(id, title, filepath) {
  try {
    const sizeKB = Math.round(fs.statSync(filepath).size / 1024);
    const storagePath = await uploadToStorage(id, filepath);
    await supabasePatch('modusign_contracts', { document_id: id }, {
      pdf_storage_path: storagePath,
    });
    log(`  ✅ [${processed+1}] ${title?.slice(0,40)} | ${sizeKB}KB → ${storagePath}`);
    succeeded++;
  } catch (e) {
    log(`  ❌ ${title?.slice(0,40)} | ${e.message.slice(0,80)}`);
    failed++;
  } finally {
    try { fs.unlinkSync(filepath); } catch {}
    processed++;
  }
}

// ── 메인 ─────────────────────────────────────────
async function main() {
  log('=== 모두싸인 PDF 다운로드 배치 시작 ===');
  if (DRY_RUN) log('🔵 DRY_RUN 모드');

  log('\n[1단계] pdf_storage_path 없는 계약 목록 조회...');
  const targetMap = await getTargetIds();
  const totalTarget = Math.min(targetMap.size, MAX_COUNT);
  log(`대상: ${targetMap.size}건 (처리 예정: ${totalTarget}건)`);

  if (targetMap.size === 0) {
    log('처리할 계약 없음. 종료.');
    return;
  }

  log('\n[2단계] Playwright 시작 + Modusign 로그인...');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    await loginModusign(page);
    await page.goto('https://app.modusign.co.kr/esign/documents/documents', {
      waitUntil: 'load', timeout: 60000,
    });
    await new Promise(r => setTimeout(r, 2000));

    const remaining = new Set(targetMap.keys());
    let modusignPage = START_PAGE;
    const MAX_PAGES = 30;

    while (remaining.size > 0 && modusignPage < MAX_PAGES && processed < MAX_COUNT) {
      const offset = modusignPage * PAGE_SIZE;
      log(`\n📄 페이지 ${modusignPage + 1} (offset=${offset}) | 남은: ${remaining.size}건`);

      const data = await scrapeModusignPage(page, offset);

      if (!data?.documents || data.documents.length === 0) {
        log('  문서 없음 — 마지막 페이지');
        break;
      }
      log(`  → ${data.documents.length}건 수신`);

      const matches = data.documents.filter(doc => remaining.has(doc.id) && doc.file?.url);
      log(`  → 타겟 매칭: ${matches.length}건`);

      if (matches.length === 0) { modusignPage++; continue; }
      if (processed + matches.length > MAX_COUNT) {
        matches.splice(MAX_COUNT - processed);
      }

      // 다운로드 + 업로드 (순차 처리 — Storage 부하 조절)
      for (const doc of matches) {
        const filepath = `${PDF_DIR}/${doc.id}.pdf`;
        try {
          await downloadFile(doc.file.url, filepath);
          remaining.delete(doc.id);
          await processContract(doc.id, doc.title || targetMap.get(doc.id), filepath);
        } catch (e) {
          log(`  ❌ 다운로드 실패 ${doc.title?.slice(0,30)}: ${e.message.slice(0,60)}`);
          remaining.delete(doc.id);
          failed++; processed++;
        }
      }

      const pct = ((processed / totalTarget) * 100).toFixed(1);
      log(`  📊 누적: ${processed}/${totalTarget} (${pct}%) | ✅${succeeded} ❌${failed}`);
      modusignPage++;
    }
  } finally {
    await browser.close();
  }

  log(`\n=== 완료 ===`);
  log(`총: ${processed}건 | 성공: ${succeeded}건 | 실패: ${failed}건`);
  if (processed < totalTarget) {
    log(`남은: ${totalTarget - processed}건 → 재실행하면 이어서 처리 (pdf_storage_path IS NULL 기준)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
