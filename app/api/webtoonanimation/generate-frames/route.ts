import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateGeminiImage } from '@/lib/image-generation/providers/gemini';

export const maxDuration = 180;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MODEL = 'gemini-3.1-flash-image-preview';

async function downloadToBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') || 'image/png';
  return { data: buf.toString('base64'), mimeType };
}

async function uploadToStorage(base64: string, mimeType: string, path: string): Promise<string> {
  const buf = Buffer.from(base64, 'base64');
  const { error } = await supabase.storage
    .from('webtoonanimation')
    .upload(path, buf, { contentType: mimeType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('webtoonanimation').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * POST: 라인아트 → Gemini 3단계 프레임 생성
 * { cutId }
 * 컷에 저장된 3종 Gemini 프롬프트를 순차 실행:
 *   Step 1: 컬러화 (lineart → color)
 *   Step 2: 16:9 확장 (color → end_frame)
 *   Step 3: Start Frame (end_frame → start_frame)
 */
export async function POST(request: NextRequest) {
  try {
    const { cutId, frameInstruction } = await request.json();
    if (!cutId) return NextResponse.json({ error: 'cutId 필요' }, { status: 400 });

    const { data: cut, error: cutError } = await supabase
      .from('webtoonanimation_cuts')
      .select('*')
      .eq('id', cutId)
      .single();

    if (cutError || !cut) return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });

    if (!cut.gemini_colorize_prompt || !cut.gemini_expand_prompt || !cut.gemini_start_frame_prompt) {
      return NextResponse.json({ error: '4종 프롬프트를 먼저 생성해주세요' }, { status: 400 });
    }

    // 프로젝트 캐릭터 레퍼런스 확인
    const { data: project } = await supabase
      .from('webtoonanimation_projects')
      .select('character_ref_url')
      .eq('id', cut.project_id)
      .single();

    const prefix = `${cut.project_id}/${cutId}`;
    const ts = Date.now();

    // 수정 지시사항이 있으면 각 프롬프트에 append
    const instrSuffix = frameInstruction ? `\n\n[REVISION INSTRUCTION: ${frameInstruction}]` : '';

    // ── Step 1: 컬러화 ──
    console.log(`[generate-frames] Step 1: 컬러화 시작`);
    const lineartImg = await downloadToBase64(cut.file_path);

    const colorizeContents: object[] = [];
    // 캐릭터 레퍼런스가 있으면 첫 번째 이미지로 추가
    if (project?.character_ref_url) {
      const refImg = await downloadToBase64(project.character_ref_url);
      colorizeContents.push({
        role: 'user',
        parts: [
          { text: cut.gemini_colorize_prompt + instrSuffix },
          { inlineData: { mimeType: refImg.mimeType, data: refImg.data } },
          { inlineData: { mimeType: lineartImg.mimeType, data: lineartImg.data } },
        ],
      });
    } else {
      colorizeContents.push({
        role: 'user',
        parts: [
          { text: cut.gemini_colorize_prompt + instrSuffix },
          { inlineData: { mimeType: lineartImg.mimeType, data: lineartImg.data } },
        ],
      });
    }

    const colorResult = await generateGeminiImage({ provider: 'gemini', model: MODEL, contents: colorizeContents as never });
    const colorUrl = await uploadToStorage(colorResult.base64, colorResult.mimeType, `${prefix}/color_${ts}.png`);
    console.log(`[generate-frames] Step 1 완료: ${colorUrl}`);

    // ── Step 2: 16:9 확장 → End Frame ──
    console.log(`[generate-frames] Step 2: 16:9 확장 시작`);
    const expandResult = await generateGeminiImage({
      provider: 'gemini',
      model: MODEL,
      contents: [{
        role: 'user',
        parts: [
          { text: cut.gemini_expand_prompt + instrSuffix },
          { inlineData: { mimeType: colorResult.mimeType, data: colorResult.base64 } },
        ],
      }] as never,
    });
    const endFrameUrl = await uploadToStorage(expandResult.base64, expandResult.mimeType, `${prefix}/end_frame_${ts}.png`);
    console.log(`[generate-frames] Step 2 완료: ${endFrameUrl}`);

    // ── Step 3: Start Frame ──
    console.log(`[generate-frames] Step 3: Start Frame 시작`);
    const startResult = await generateGeminiImage({
      provider: 'gemini',
      model: MODEL,
      contents: [{
        role: 'user',
        parts: [
          { text: cut.gemini_start_frame_prompt + instrSuffix },
          { inlineData: { mimeType: expandResult.mimeType, data: expandResult.base64 } },
        ],
      }] as never,
    });
    const startFrameUrl = await uploadToStorage(startResult.base64, startResult.mimeType, `${prefix}/start_frame_${ts}.png`);
    console.log(`[generate-frames] Step 3 완료: ${startFrameUrl}`);

    // frame_strategy가 'exit'이면 start/end 역할 반전
    const isExitCut = cut.frame_strategy === 'exit';
    const finalStartUrl = isExitCut ? endFrameUrl : startFrameUrl;
    const finalEndUrl = isExitCut ? startFrameUrl : endFrameUrl;

    // DB 저장
    await supabase
      .from('webtoonanimation_cuts')
      .update({
        color_image_url: colorUrl,
        end_frame_url: finalEndUrl,
        start_frame_url: finalStartUrl,
      })
      .eq('id', cutId);

    return NextResponse.json({
      color_image_url: colorUrl,
      end_frame_url: finalEndUrl,
      start_frame_url: finalStartUrl,
      swapped: isExitCut,
    });
  } catch (error) {
    console.error('[generate-frames] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프레임 생성 실패' },
      { status: 500 }
    );
  }
}
