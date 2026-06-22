/**
 * 모두싸인 스크래핑 테스트
 * - Playwright로 로그인 → 내부 API 응답 캡처 → 문서 목록 + PDF 다운로드
 * 실행: node scripts/modusign-scrape-test.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const MODUSIGN_EMAIL = 'jstudio@ptjcomics.com';
const MODUSIGN_PASSWORD = 'qkrxowns1!';
const OUTPUT_DIR = '/tmp/modusign-test';
const BFF_BASE = 'https://bff-web.api.modusign.co.kr';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function login(page) {
  log('로그인 시도...');
  await page.goto('https://app.modusign.co.kr', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);

  // 다중 로그인 경고 팝업 처리
  const popup = page.locator('text=그래도 로그인하기');
  if (await popup.isVisible({ timeout: 3000 }).catch(() => false)) {
    await popup.click();
    await page.waitForTimeout(3000);
  }

  if (page.url().includes('/authentication/signin')) {
    await page.fill('input[type="email"], input[placeholder*="이메일"]', MODUSIGN_EMAIL);
    await page.fill('input[type="password"], input[placeholder*="비밀번호"]', MODUSIGN_PASSWORD);
    await page.click('button:has-text("이메일로 로그인")');
    // URL 변경 또는 팝업 대기 (다중 로그인 감지 팝업이 뜰 수 있음)
    await Promise.race([
      page.waitForURL('**/esign/**', { timeout: 30000 }),
      page.waitForSelector('text=그래도 로그인하기', { timeout: 30000 }),
    ]).catch(() => {});
    await page.waitForTimeout(2000);

    // 다중 로그인 경고 재처리
    const popup2 = page.locator('text=그래도 로그인하기');
    if (await popup2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await popup2.click();
      await page.waitForTimeout(2000);
    }
  }

  log(`로그인 완료: ${page.url()}`);
}

async function getAccessToken(page) {
  const creds = await page.evaluate(() => {
    const raw = localStorage.getItem('modusign_credential_tokens');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.credentialTokens?.[0]?.tokenSet?.accessToken || null;
  });
  return creds;
}

async function fetchDocuments(page, token, workspaceId, { limit = 10, offset = 0, status = null } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    isHidden: 'false',
    'sort': 'updatedAt:desc',
    timestamp: String(Date.now()),
  });
  if (status) params.set('status', status);

  const url = `${BFF_BASE}/document/workspaces/${workspaceId}/documents?${params}`;

  const result = await page.evaluate(async ({ url, token }) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => resolve({ status: 0, body: 'error' });
      xhr.send();
    });
  }, { url, token });

  if (result.status !== 200) {
    // XHR 실패 시 Playwright response 인터셉트 방식으로 fallback
    return null;
  }
  return JSON.parse(result.body);
}

async function getWorkspaceId(page, token) {
  const result = await page.evaluate(async ({ url, token }) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => resolve({ status: 0, body: 'error' });
      xhr.send();
    });
  }, { url: `${BFF_BASE}/user/workspaces?timestamp=${Date.now()}`, token });

  if (result.status !== 200) return null;
  const data = JSON.parse(result.body);
  // 첫 번째 워크스페이스 ID 반환
  return data?.workspaces?.[0]?.id || data?.[0]?.id || null;
}

async function getDocumentDetail(page, token, workspaceId, documentId) {
  const url = `${BFF_BASE}/document/workspaces/${workspaceId}/documents/${documentId}?timestamp=${Date.now()}`;
  const result = await page.evaluate(async ({ url, token }) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => resolve({ status: 0, body: 'xhr error' });
      xhr.send();
    });
  }, { url, token });

  if (result.status !== 200) return null;
  return JSON.parse(result.body);
}

async function getDownloadUrl(page, token, workspaceId, documentId) {
  const url = `${BFF_BASE}/document/workspaces/${workspaceId}/documents/${documentId}/download-url?timestamp=${Date.now()}`;
  const result = await page.evaluate(async ({ url, token }) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => resolve({ status: 0, body: 'xhr error' });
      xhr.send();
    });
  }, { url, token });

  if (result.status !== 200) return null;
  const data = JSON.parse(result.body);
  return data?.downloadUrl || data?.url || null;
}

async function downloadPdf(downloadUrl, filename) {
  const res = await fetch(downloadUrl);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(buf));
  return filepath;
}

// Playwright response 인터셉트 방식 (XHR 차단 시 fallback)
async function fetchViaIntercept(page, targetUrl) {
  return new Promise(async (resolve) => {
    const handler = async (response) => {
      if (response.url().includes(targetUrl.split('?')[0])) {
        try {
          const body = await response.json();
          page.off('response', handler);
          resolve(body);
        } catch {}
      }
    };
    page.on('response', handler);
    // 문서 목록 페이지 리로드로 API 자동 호출 트리거
    await page.reload({ waitUntil: 'networkidle' });
    setTimeout(() => { page.off('response', handler); resolve(null); }, 10000);
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    // 1. 로그인
    await login(page);

    // 2. 토큰 획득
    const token = await getAccessToken(page);
    if (!token) throw new Error('토큰 획득 실패');
    log(`토큰 획득 성공 (앞 30자): ${token.slice(0, 30)}...`);

    // 3. 워크스페이스 ID 확인
    await page.goto('https://app.modusign.co.kr/esign/documents/documents', { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Playwright response 인터셉트로 실제 API 응답 캡처
    log('문서 목록 API 캡처 중...');
    let capturedDocs = null;

    const responseHandler = async (response) => {
      const url = response.url();
      if (url.includes('bff-web.api.modusign.co.kr/document/workspaces') && url.includes('/documents?')) {
        try {
          const data = await response.json();
          if (!capturedDocs) capturedDocs = data;
          log(`API 캡처 성공: ${JSON.stringify(Object.keys(data))}`);
        } catch {}
      }
    };
    page.on('response', responseHandler);
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);
    page.off('response', responseHandler);

    if (!capturedDocs) {
      log('인터셉트 실패 - XHR 방식 시도');
      // 워크스페이스 ID는 URL에서 추출
      const workspaceId = 'a8ded7d0-d506-11ed-af69-1b7a0b609f55';
      capturedDocs = await fetchDocuments(page, token, workspaceId, { limit: 10 });
    }

    if (!capturedDocs) throw new Error('문서 목록 조회 실패');

    log(`\n=== 문서 목록 (총 ${capturedDocs.totalCount || capturedDocs.total || '?'}건) ===`);
    const docs = capturedDocs.documents || capturedDocs.data || capturedDocs.items || [];
    log(`현재 페이지: ${docs.length}건`);

    // 문서 구조 출력 (첫 번째)
    if (docs.length > 0) {
      log('\n[첫 번째 문서 전체 구조]');
      console.log(JSON.stringify(docs[0], null, 2));
    }

    const workspaceId = 'a8ded7d0-d506-11ed-af69-1b7a0b609f55';

    // 4. 전체 문서 페이지네이션으로 수집 (page.route로 limit=100 강제)
    log('\n전체 문서 목록 수집 시작...');
    const totalCount = capturedDocs?.count || 0;
    const PAGE_SIZE = 100;
    const MAX_PAGES = 3; // 테스트용: 최대 3페이지(300건)
    const totalPages = Math.min(Math.ceil(totalCount / PAGE_SIZE), MAX_PAGES);
    log(`전체 ${totalCount}건, ${PAGE_SIZE}개씩 ${totalPages}페이지 수집 (MAX_PAGES=${MAX_PAGES})`);

    const allDocsList = [];
    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
      const offset = pageNum * PAGE_SIZE;
      log(`  페이지 ${pageNum + 1}/${totalPages} (offset=${offset})...`);

      // page.route로 limit/offset 강제 수정
      let pageData = null;
      const interceptedDocs = await new Promise(async (resolve) => {
        const handler = async (response) => {
          const url = response.url();
          if (url.includes('bff-web.api.modusign.co.kr/document/workspaces') &&
              url.includes('/documents?') && url.includes(`offset=${offset}`)) {
            try {
              const data = await response.json();
              page.off('response', handler);
              resolve(data);
            } catch { resolve(null); }
          }
        };
        page.on('response', handler);

        // 라우트 인터셉트: API 요청의 limit/offset 파라미터 덮어쓰기
        await page.route('**bff-web.api.modusign.co.kr/document/workspaces**', async (route) => {
          const req = route.request();
          if (req.url().includes('/documents?')) {
            const url = new URL(req.url());
            url.searchParams.set('limit', String(PAGE_SIZE));
            url.searchParams.set('offset', String(offset));
            await route.continue({ url: url.toString() });
          } else {
            await route.continue();
          }
        });

        await page.reload({ waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(4000);
        await page.unrouteAll();
        page.off('response', handler);
        resolve(null);
      });

      if (interceptedDocs?.documents) {
        allDocsList.push(...interceptedDocs.documents);
        log(`  → ${interceptedDocs.documents.length}건 수집 (누적 ${allDocsList.length}건)`);
      } else {
        log(`  → 페이지 ${pageNum + 1} 실패, 건너뜀`);
      }

      // 너무 빠른 연속 요청 방지
      if (pageNum < totalPages - 1) await page.waitForTimeout(1000);
    }

    const finalDocs = allDocsList.length > 0 ? allDocsList : docs;

    // 5. 문서 목록 요약 출력
    log(`\n=== 문서 목록 요약 (${finalDocs.length}건 / 전체 ${totalCount}건) ===`);
    const summary = finalDocs.map((doc, i) => ({
      순번: i + 1,
      제목: (doc.title || '').slice(0, 40),
      상태: doc.status,
      요청일: doc.createdAt?.slice(0, 10),
      체결일: doc.finishedAt?.slice(0, 10) || '-',
      서명자: doc.participants
        ?.filter(p => p.type === 'SIGNER')
        ?.map(p => p.name)
        ?.join(', '),
    }));
    console.table(summary);

    // 6. 완료 문서 PDF 다운로드 (처음 3건)
    const completedDocs = finalDocs.filter(d => d.status === 'COMPLETED').slice(0, 3);
    log(`\n=== PDF 다운로드 테스트 (완료 문서 ${completedDocs.length}건) ===`);

    for (const doc of completedDocs) {
      const safeTitle = doc.title?.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 60) || doc.id;
      log(`\n처리: ${doc.title?.slice(0, 50)}`);

      // file.url이 응답에 직접 포함되어 있음 (pre-signed S3 URL)
      if (doc.file?.url) {
        log('  계약서 PDF URL 발견 (file.url)');
        const pdfPath = await downloadPdf(doc.file.url, `${safeTitle}.pdf`);
        if (pdfPath) {
          const size = fs.statSync(pdfPath).size;
          log(`  ✅ 계약서 PDF 저장: ${Math.round(size/1024)}KB → ${pdfPath}`);
        }
      }

      if (doc.auditTrail?.url) {
        log('  감사추적 PDF URL 발견 (auditTrail.url)');
        const auditPath = await downloadPdf(doc.auditTrail.url, `${safeTitle}_감사추적.pdf`);
        if (auditPath) {
          const size = fs.statSync(auditPath).size;
          log(`  ✅ 감사추적 PDF 저장: ${Math.round(size/1024)}KB → ${auditPath}`);
        }
      }
    }

    // 6. 결과 저장
    const saveData = { count: totalCount, documents: finalDocs };
    fs.writeFileSync(`${OUTPUT_DIR}/documents.json`, JSON.stringify(saveData, null, 2));
    log(`\n전체 결과 저장: ${OUTPUT_DIR}/documents.json`);
    log('=== 테스트 완료 ===');

  } catch (err) {
    log(`오류: ${err.message}`);
    console.error(err);
    await page.screenshot({ path: `${OUTPUT_DIR}/error.png` });
  } finally {
    await browser.close();
  }
}

main();
