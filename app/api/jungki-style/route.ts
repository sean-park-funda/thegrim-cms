import { NextRequest, NextResponse } from 'next/server';
import { generateGeminiImage } from '@/lib/image-generation';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'jungki-style';

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function loadReferenceImage(): { data: string; mimeType: string } {
  const refPath = path.join(process.cwd(), 'public', 'jungkistyle.png');
  const buffer = fs.readFileSync(refPath);
  return { data: buffer.toString('base64'), mimeType: 'image/png' };
}

// GET: 히스토리 조회
export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get('mode');
    const supabase = getSupabase();

    let query = supabase
      .from('jungki_style_results')
      .select('id, mode, image_url, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (mode) query = query.eq('mode', mode);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: 이미지 생성
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[중기작가스타일] 요청 시작');

  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const body = await request.json();
    const { sketchBase64, sketchMimeType, mode, prompt } = body;

    if (!sketchBase64) {
      return NextResponse.json({ error: '스케치 이미지가 필요합니다.' }, { status: 400 });
    }
    if (!mode || !['line', 'manga'].includes(mode)) {
      return NextResponse.json({ error: 'mode는 line 또는 manga 이어야 합니다.' }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: '프롬프트가 필요합니다.' }, { status: 400 });
    }

    const ref = loadReferenceImage();

    console.log(`[중기작가스타일] 모드: ${mode}, Gemini 호출 시작`);

    const result = await generateGeminiImage({
      provider: 'gemini',
      model: 'gemini-3-pro-image-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: ref.mimeType, data: ref.data } },
            { inlineData: { mimeType: sketchMimeType || 'image/png', data: sketchBase64 } },
          ],
        },
      ],
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: { imageSize: '1K' },
        temperature: 1.0,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32768,
      },
      retries: 3,
      timeoutMs: 180000,
    });

    // Supabase Storage에 업로드
    const supabase = getSupabase();
    const fileName = `${mode}/${Date.now()}.png`;
    const imageBuffer = Buffer.from(result.base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, imageBuffer, {
        contentType: result.mimeType || 'image/png',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    // DB에 저장
    const { data: record, error: dbError } = await supabase
      .from('jungki_style_results')
      .insert({ mode, image_url: publicUrl, storage_path: fileName })
      .select()
      .single();

    if (dbError) throw dbError;

    const elapsed = Date.now() - startTime;
    console.log(`[중기작가스타일] 완료 (${elapsed}ms) → ${publicUrl}`);

    return NextResponse.json({
      id: record.id,
      imageUrl: publicUrl,
      mode,
      createdAt: record.created_at,
    });
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    console.error(`[중기작가스타일] 오류 (${elapsed}ms):`, error);
    const msg = error instanceof Error ? error.message : '이미지 생성 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
