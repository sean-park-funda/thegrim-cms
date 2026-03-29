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
    const { cutId, step, instruction, startFrameBgRefUrl } = await request.json();
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

    const runColorize = step === 'colorize';
    const runAnchor = !step || step === 'anchor';
    const runOther = (!step || step === 'other') && frameRole !== 'middle' && !cut.use_prev_cut_as_start;

    const result: Record<string, string | null> = {
      color_image_url: null,
      start_frame_url: null,
      end_frame_url: null,
    };

    // ── COLORIZE 단계 (컬러화만 단독 재생성) ──
    if (runColorize) {
      if (!useColorize || !cut.gemini_colorize_prompt) {
        return NextResponse.json({ error: '컬러화 프롬프트가 없거나 컬러화가 비활성화되어 있습니다' }, { status: 400 });
      }
      console.log(`[generate-frames] colorize 단독 시작`);
      const lineartImg = await downloadToBase64(cut.file_path);
      const colorizeParts: object[] = [{ text: cut.gemini_colorize_prompt + instrSuffix }];
      if (project?.character_ref_url) {
        const refImg = await downloadToBase64(project.character_ref_url);
        colorizeParts.push({ text: '[Character reference sheet — use for character appearance only, do NOT colorize this image:]' });
        colorizeParts.push({ inlineData: { mimeType: refImg.mimeType, data: refImg.data } });
      }
      if (cut.colorize_reference_url) {
        const bgRef = await downloadToBase64(cut.colorize_reference_url);
        colorizeParts.push({ text: '[Color & style reference — match the background, environment, lighting, and character colors from this image:]' });
        colorizeParts.push({ inlineData: { mimeType: bgRef.mimeType, data: bgRef.data } });
      }
      colorizeParts.push({ text: '[This is the black and white webtoon lineart to colorize — apply colors to THIS image:]' });
      colorizeParts.push({ inlineData: { mimeType: lineartImg.mimeType, data: lineartImg.data } });
      const colorizeContents: object[] = [{ role: 'user', parts: colorizeParts }];
      const colorResult = await generateGeminiImage({ provider: 'gemini', model: MODEL, contents: colorizeContents as never });
      const colorUrl = await uploadToStorage(colorResult.base64, colorResult.mimeType, `${prefix}/color_${ts}.png`);
      result.color_image_url = colorUrl;
      console.log(`[generate-frames] colorize 단독 완료: ${colorUrl}`);
    }

    // ── ANCHOR 단계 ──
    // anchor = 이 컷 자체를 16:9로 준비한 프레임 (colorize 포함 or 생략)
    if (runAnchor) {
      let anchorBase: { data: string; mimeType: string };

      // step='anchor' 단독 실행이고 이미 컬러화 이미지가 있으면 재사용 (STEP1 재생성 방지)
      const reuseExistingColor = step === 'anchor' && useColorize && !!cut.color_image_url;

      if (useColorize && cut.gemini_colorize_prompt && !reuseExistingColor) {
        console.log(`[generate-frames] anchor/colorize 시작`);
        const lineartImg = await downloadToBase64(cut.file_path);
        const anchorColorizeParts: object[] = [{ text: cut.gemini_colorize_prompt + instrSuffix }];
        if (project?.character_ref_url) {
          const refImg = await downloadToBase64(project.character_ref_url);
          anchorColorizeParts.push({ text: '[Character reference sheet — use for character appearance only, do NOT colorize this image:]' });
          anchorColorizeParts.push({ inlineData: { mimeType: refImg.mimeType, data: refImg.data } });
        }
        if (cut.colorize_reference_url) {
          const bgRef = await downloadToBase64(cut.colorize_reference_url);
          anchorColorizeParts.push({ text: '[Color & style reference — match the background, environment, lighting, and character colors from this image:]' });
          anchorColorizeParts.push({ inlineData: { mimeType: bgRef.mimeType, data: bgRef.data } });
        }
        anchorColorizeParts.push({ text: '[This is the black and white webtoon lineart to colorize — apply colors to THIS image:]' });
        anchorColorizeParts.push({ inlineData: { mimeType: lineartImg.mimeType, data: lineartImg.data } });
        const colorizeContents: object[] = [{ role: 'user', parts: anchorColorizeParts }];

        const colorResult = await generateGeminiImage({ provider: 'gemini', model: MODEL, contents: colorizeContents as never });
        const colorUrl = await uploadToStorage(colorResult.base64, colorResult.mimeType, `${prefix}/color_${ts}.png`);
        result.color_image_url = colorUrl;
        anchorBase = { data: colorResult.base64, mimeType: colorResult.mimeType };
        console.log(`[generate-frames] colorize 완료: ${colorUrl}`);
      } else if (reuseExistingColor) {
        // 기존 컬러화 이미지 재사용 — 다운로드만
        console.log(`[generate-frames] 기존 컬러 이미지 재사용: ${cut.color_image_url}`);
        anchorBase = await downloadToBase64(cut.color_image_url!);
      } else {
        // 컬러화 스킵 — 원본 이미지 직접 사용
        console.log(`[generate-frames] colorize 스킵, 원본 사용`);
        anchorBase = await downloadToBase64(cut.file_path);
      }

      // expand → anchor frame
      console.log(`[generate-frames] anchor/expand 시작`);
      const expandParts: object[] = [
        { text: cut.gemini_expand_prompt + instrSuffix },
        { inlineData: { mimeType: anchorBase.mimeType, data: anchorBase.data } },
      ];
      if (cut.colorize_reference_url) {
        // 이전 컷 레퍼런스 — 배경 일관성 유지
        const bgRef = await downloadToBase64(cut.colorize_reference_url);
        expandParts.push({ inlineData: { mimeType: bgRef.mimeType, data: bgRef.data } });
      }
      if (startFrameBgRefUrl) {
        // 시작프레임 배경 일치 옵션 — 시작프레임(이전 컷)을 배경 레퍼런스로 추가
        const startRef = await downloadToBase64(startFrameBgRefUrl);
        expandParts.push({ text: '[Background reference — match the background, environment, and lighting exactly from this image. Only the character poses and expressions should differ:]' });
        expandParts.push({ inlineData: { mimeType: startRef.mimeType, data: startRef.data } });
      }
      const expandResult = await generateGeminiImage({
        provider: 'gemini',
        model: MODEL,
        contents: [{ role: 'user', parts: expandParts }] as never,
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
