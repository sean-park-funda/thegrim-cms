/**
 * 모두싸인 → Supabase 전체 동기화
 * 실행: node scripts/modusign-sync.mjs
 *
 * - Playwright로 모두싸인 로그인 후 내부 API 응답 캡처 (response intercept + route rewrite)
 * - 전체 계약 목록 페이지네이션으로 수집
 * - Supabase modusign_contracts 테이블에 upsert (document_id 기준)
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// ── 설정 ──────────────────────────────────────────
const MODUSIGN_EMAIL    = 'jstudio@ptjcomics.com';
const MODUSIGN_PASSWORD = 'qkrxowns1!';
const PAGE_SIZE         = 100;
// MAX_PAGES: 테스트 시 제한. 0 = 전체 수집
const MAX_PAGES    = parseInt(process.env.MAX_PAGES    || '0');
// START_OFFSET: 중간부터 이어서 시작
const START_OFFSET = parseInt(process.env.START_OFFSET || '0');

// .env.local에서 Supabase 설정 읽기
function loadEnv() {
  try {
    const raw = readFileSync('/Users/sean/Projects/thegrim-cms/.env.local', 'utf-8');
    const env = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Supabase 환경변수 없음 (.env.local 확인)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 유틸 ──────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ── 모두싸인 로그인 ────────────────────────────────
async function login(page) {
  log('로그인 시도...');
  await page.goto('https://app.modusign.co.kr', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);

  const popup = page.locator('text=그래도 로그인하기');
  if (await popup.isVisible({ timeout: 3000 }).catch(() => false)) {
    await popup.click();
    await page.waitForTimeout(3000);
  }

  if (page.url().includes('/authentication/signin')) {
    await page.fill('input[type="email"], input[placeholder*="이메일"]', MODUSIGN_EMAIL);
    await page.fill('input[type="password"], input[placeholder*="비밀번호"]', MODUSIGN_PASSWORD);
    await page.click('button:has-text("이메일로 로그인")');
    await Promise.race([
      page.waitForURL('**/esign/**', { timeout: 30000 }),
      page.waitForSelector('text=그래도 로그인하기', { timeout: 30000 }),
    ]).catch(() => {});
    await page.waitForTimeout(2000);

    const popup2 = page.locator('text=그래도 로그인하기');
    if (await popup2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await popup2.click();
      await page.waitForTimeout(2000);
    }
  }

  log(`로그인 완료: ${page.url()}`);
}

// ── 한 페이지 수집 (route 인터셉트로 limit/offset 강제) ──
async function fetchPage(page, offset) {
  return new Promise(async (resolve) => {
    let resolved = false;

    const responseHandler = async (response) => {
      const url = response.url();
      if (
        url.includes('bff-web.api.modusign.co.kr/document/workspaces') &&
        url.includes('/documents?') &&
        url.includes(`offset=${offset}`) &&
        url.includes(`limit=${PAGE_SIZE}`)
      ) {
        try {
          const data = await response.json();
          if (!resolved) {
            resolved = true;
            page.off('response', responseHandler);
            resolve(data);
          }
        } catch { /* 응답 파싱 실패 무시 */ }
      }
    };

    page.on('response', responseHandler);

    await page.route('**bff-web.api.modusign.co.kr/document/workspaces**', async (route) => {
      const req = route.request();
      if (req.url().includes('/documents?')) {
        const u = new URL(req.url());
        u.searchParams.set('limit', String(PAGE_SIZE));
        u.searchParams.set('offset', String(offset));
        await route.continue({ url: u.toString() });
      } else {
        await route.continue();
      }
    });

    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    } catch {
      // 타임아웃이어도 응답이 먼저 왔을 수 있음 — 계속
    }
    await new Promise(r => setTimeout(r, 4000));
    try { await page.unrouteAll(); } catch {}

    // 타임아웃 처리
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { page.off('response', responseHandler); } catch {}
        resolve(null);
      }
    }, 3000);
  });
}

// ── Supabase upsert ────────────────────────────────
function docToRow(doc) {
  const signers = (doc.participants || []).filter(p => p.type === 'SIGNER');
  return {
    document_id:   doc.id,
    title:         doc.title || null,
    status:        doc.status || null,
    sent_at:       doc.createdAt || null,
    completed_at:  doc.finishedAt || null,
    participants:  doc.participants || null,
    labels:        doc.labels || null,
    raw_modusign:  doc,
  };
}

async function upsertBatch(rows) {
  const { error } = await supabase
    .from('modusign_contracts')
    .upsert(rows, { onConflict: 'document_id' });
  if (error) throw new Error(`upsert 실패: ${error.message}`);
}

// ── 메인 ──────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  log('=== 모두싸인 동기화 시작 ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page    = await context.newPage();

  let totalSynced = 0;
  let totalCount  = 0;
  let errors      = 0;

  try {
    // 1. 로그인
    await login(page);

    // 2. 문서 목록 페이지로 이동 → 첫 응답으로 총 건수 확인
    log('문서 목록 페이지 이동 중...');
    await page.goto('https://app.modusign.co.kr/esign/documents/documents', {
      waitUntil: 'load', timeout: 60000
    });

    let firstData = null;
    const initHandler = async (response) => {
      const url = response.url();
      if (url.includes('bff-web.api.modusign.co.kr/document/workspaces') &&
          url.includes('/documents?') && !firstData) {
        try { firstData = await response.json(); } catch {}
      }
    };
    page.on('response', initHandler);
    // SPA 라우팅이라 API가 안 뜰 수 있으므로 reload로 강제
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
    page.off('response', initHandler);

    if (!firstData) throw new Error('초기 문서 목록 캡처 실패');
    totalCount = firstData.count || 0;
    log(`전체 계약 ${totalCount}건 확인`);

    // 3. 페이지네이션으로 전체 수집 + Supabase upsert
    const totalPages = MAX_PAGES > 0
      ? Math.min(Math.ceil(totalCount / PAGE_SIZE), MAX_PAGES)
      : Math.ceil(totalCount / PAGE_SIZE);
    log(`${PAGE_SIZE}건씩 ${totalPages}페이지 처리 시작${MAX_PAGES > 0 ? ` (MAX_PAGES=${MAX_PAGES})` : ''}`);

    const startPage = Math.floor(START_OFFSET / PAGE_SIZE);
    if (startPage > 0) log(`offset=${START_OFFSET}(페이지 ${startPage + 1})부터 이어서 시작`);

    for (let pageNum = startPage; pageNum < totalPages; pageNum++) {
      const offset = pageNum * PAGE_SIZE;
      log(`  [${pageNum + 1}/${totalPages}] offset=${offset} 수집 중...`);

      let data = null;
      for (let retry = 0; retry < 3; retry++) {
        data = await fetchPage(page, offset);
        if (data?.documents) break;
        if (retry < 2) {
          log(`    재시도 (${retry + 1}/3)...`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      if (!data?.documents) {
        log(`    ⚠️ 페이지 ${pageNum + 1} 실패, 건너뜀`);
        errors++;
        continue;
      }

      const rows = data.documents.map(docToRow);
      try {
        await upsertBatch(rows);
        totalSynced += rows.length;
        log(`    ✅ ${rows.length}건 upsert (누적 ${totalSynced}건)`);
      } catch (e) {
        log(`    ❌ upsert 오류: ${e.message}`);
        errors++;
      }

      // 요청 간격 (서버 부하 방지, 마지막 페이지 제외)
      if (pageNum < totalPages - 1) await new Promise(r => setTimeout(r, 800));
    }

  } catch (err) {
    log(`오류: ${err.message}`);
    console.error(err);
  } finally {
    await browser.close();
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log('');
  log('=== 동기화 완료 ===');
  log(`총 ${totalCount}건 중 ${totalSynced}건 upsert, 오류 ${errors}건, 소요시간 ${elapsed}초`);
}

main();
