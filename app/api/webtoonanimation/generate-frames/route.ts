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
 * POST: 프레임 생성
 * { cutId, step?: 'anchor' | 'other' | null (= all), instruction? }
 *
 * frame_role에 따른 동작:
 *   'end'    : anchor → end_frame_url,  other → start_frame_url  (기존 기본값)
 *   'start'  : anchor → start_frame_url, other → end_frame_url
 *   'middle' : anchor → start_frame_url, other 스킵
 *
 * anchor 단계:
 *   use_colorize=true  → colorize → expand 16:9 → anchor frame
 *   use_colorize=false → (원본 직접) expand 16:9 → anchor frame
 *
 * other 단계:
 *   anchor frame → gemini_start_frame_prompt → other frame
 */
export async function POST(request: NextRequest) {
  try {
    const { cutId, step, instruction } = await request.json();
    if (!cutId) return NextResponse.json({ error: 'cutId 필요' }, { status: 400 });

    const { data: cut, error: cutError } = await supabase
      .from('webtoonanimation_cuts')
      .select('*')
      .eq('id', cutId)
      .single();

    if (cutError || !cut) return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });

    const frameRole: string = cut.frame_role || 'end';
    const useColorize: boolean = cut.use_colorize !== false;

    if (!cut.gemini_expand_prompt) {
      return NextResponse.json({ error: '프롬프트를 먼저 생성해주세요' }, { status: 400 });
    }

    const { data: project } = await supabase
      .from('webtoonanimation_projects')
      .select('character_ref_url')
      .eq('id', cut.project_id)
      .single();

    const prefix = `${cut.project_id}/${cutId}`;
    const ts = Date.now();
    const instrSuffix = instruction ? `\n\n[REVISION INSTRUCTION: ${instruction}]` : '';

    const runAnchor = !step || step === 'anchor';
    const runOther = (!step || step === 'other') && frameRole !== 'middle';

    const result: Record<string, string | null> = {
      color_image_url: null,
      start_frame_url: null,
      end_frame_url: null,
    };

    // ── ANCHOR 단계 ──
    // anchor = 이 컷 자체를 16:9로 준비한 프레임 (colorize 포함 or 생략)
    if (runAnchor) {
      let anchorBase: { data: string; mimeType: string };

      if (useColorize && cut.gemini_colorize_prompt) {
        console.log(`[generate-frames] anchor/colorize 시작`);
        const lineartImg = await downloadToBase64(cut.file_path);
        const colorizeContents: object[] = [];

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
        result.color_image_url = colorUrl;
        anchorBase = { data: colorResult.base64, mimeType: colorResult.mimeType };
        console.log(`[generate-frames] colorize 완료: ${colorUrl}`);
      } else {
        // 컬러화 스킵 — 원본 이미지 직접 사용
        console.log(`[generate-frames] colorize 스킵, 원본 사용`);
        anchorBase = await downloadToBase64(cut.file_path);
      }

      // expand → anchor frame (16:9)
      console.log(`[generate-frames] anchor/expand 시작`);
      const expandResult = await generateGeminiImage({
        provider: 'gemini',
        model: MODEL,
        contents: [{
          role: 'user',
          parts: [
            { text: cut.gemini_expand_prompt + instrSuffix },
            { inlineData: { mimeType: anchorBase.mimeType, data: anchorBase.data } },
          ],
        }] as never,
      });

      const anchorUrl = await uploadToStorage(
        expandResult.base64,
        expandResult.mimeType,
        `${prefix}/anchor_${ts}.png`
      );
      console.log(`[generate-frames] anchor 완료: ${anchorUrl}`);

      // frame_role에 따라 anchor를 start or end에 저장
      if (frameRole === 'start') {
        result.start_frame_url = anchorUrl;
      } else {
        // 'end' or 'middle'
        result.end_frame_url = anchorUrl;
        if (frameRole === 'middle') result.start_frame_url = anchorUrl; // 중간 모드: start=end=ref
      }

      // anchor를 other 단계의 입력으로 재사용
      (cut as Record<string, unknown>).__anchorData = { data: expandResult.base64, mimeType: expandResult.mimeType };
    }

    // ── OTHER 단계 ──
    // other = anchor에서 나머지 프레임 생성
    if (runOther) {
      if (!cut.gemini_start_frame_prompt) {
        return NextResponse.json({ error: '나머지 프레임 프롬프트가 없습니다' }, { status: 400 });
      }

      let anchorImg: { data: string; mimeType: string };

      if ((cut as Record<string, unknown>).__anchorData) {
        // anchor 단계가 방금 실행됨 → 인메모리 재사용
        anchorImg = (cut as Record<string, unknown>).__anchorData as { data: string; mimeType: string };
      } else {
        // step='other' 단독 실행 — DB에서 anchor URL 읽기
        const anchorUrl = frameRole === 'start' ? cut.start_frame_url : cut.end_frame_url;
        if (!anchorUrl) {
          return NextResponse.json({ error: '앵커 프레임을 먼저 생성해주세요' }, { status: 400 });
        }
        anchorImg = await downloadToBase64(anchorUrl);
      }

      console.log(`[generate-frames] other 프레임 생성 시작`);
      const otherResult = await generateGeminiImage({
        provider: 'gemini',
        model: MODEL,
        contents: [{
          role: 'user',
          parts: [
            { text: cut.gemini_start_frame_prompt + instrSuffix },
            { inlineData: { mimeType: anchorImg.mimeType, data: anchorImg.data } },
          ],
        }] as never,
      });

      const otherLabel = frameRole === 'start' ? 'end_frame' : 'start_frame';
      const otherUrl = await uploadToStorage(otherResult.base64, otherResult.mimeType, `${prefix}/${otherLabel}_${ts}.png`);
      console.log(`[generate-frames] other 완료: ${otherUrl}`);

      if (frameRole === 'start') {
        result.end_frame_url = otherUrl;
      } else {
        result.start_frame_url = otherUrl;
      }
    }

    // DB 저장 (null이 아닌 것만)
    const dbUpdate: Record<string, string | null> = {};
    if (result.color_image_url !== null) dbUpdate.color_image_url = result.color_image_url;
    if (result.start_frame_url !== null) dbUpdate.start_frame_url = result.start_frame_url;
    if (result.end_frame_url !== null) dbUpdate.end_frame_url = result.end_frame_url;

    if (Object.keys(dbUpdate).length > 0) {
      await supabase.from('webtoonanimation_cuts').update(dbUpdate).eq('id', cutId);
    }

    return NextResponse.json({ ...result, frame_role: frameRole });
  } catch (error) {
    console.error('[generate-frames] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프레임 생성 실패' },
      { status: 500 }
    );
  }
}
