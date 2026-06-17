import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

export const maxDuration = 60;

const WORKSPACE_ID = 'a8ded7d0-d506-11ed-af69-1b7a0b609f55';
const MODUSIGN_EMAIL = 'jstudio@ptjcomics.com';
const MODUSIGN_PASSWORD = 'qkrxowns1!';

// 8분 캐시 (pre-signed URL 만료 전)
const urlCache = new Map<string, { url: string; expires: number }>();

async function getFreshPdfUrl(documentId: string): Promise<string | null> {
  const cached = urlCache.get(documentId);
  if (cached && cached.expires > Date.now()) return cached.url;

  let playwright: typeof import('playwright') | null = null;
  try {
    playwright = await import('playwright');
  } catch {
    return null; // Vercel 등 Playwright 미설치 환경
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 로그인
    await page.goto('https://app.modusign.co.kr', { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));

    const dismissPopup = async () => {
      const btn = page.locator('text=그래도 로그인하기');
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await new Promise(r => setTimeout(r, 1500));
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
      await new Promise(r => setTimeout(r, 1500));
      await dismissPopup();
    }

    // BFF API로 단일 문서 직접 조회
    const bffUrl = `https://bff-web.api.modusign.co.kr/document/workspaces/${WORKSPACE_ID}/documents/${documentId}`;
    const res = await context.request.get(bffUrl);

    if (res.ok()) {
      const doc = await res.json();
      const pdfUrl = doc.file?.url;
      if (pdfUrl) {
        urlCache.set(documentId, { url: pdfUrl, expires: Date.now() + 8 * 60 * 1000 });
        return pdfUrl;
      }
    }

    return null;
  } finally {
    await browser.close();
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await getAuthenticatedClient(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { supabase } = auth;
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', auth.userId)
    .single();

  if (!profile || !canViewAccounting(profile.role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    const pdfUrl = await getFreshPdfUrl(id);
    if (!pdfUrl) {
      return NextResponse.json({ error: 'PDF를 가져올 수 없습니다. Modusign에서 직접 확인해주세요.' }, { status: 404 });
    }
    return NextResponse.redirect(pdfUrl);
  } catch (e) {
    console.error('PDF 조회 실패:', e);
    return NextResponse.json({ error: 'PDF 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
