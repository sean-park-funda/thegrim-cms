import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateGeminiImage } from '@/lib/image-generation/providers/gemini';
import sharp from 'sharp';

export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DEFAULT_BEFORE_PROMPT = `This webtoon/manhwa panel shows the RESULT of an action (impact, landing, collision, etc.).
Generate what this scene looked like exactly 0.5 seconds BEFORE this moment.

Rules:
- Show the anticipation/wind-up pose right before the action happens
- Use a front-facing camera angle
- Keep the EXACT same art style, line work, coloring, and character design
- Keep similar composition and framing
- No text, no speech bubbles, no sound effects
- The image should flow naturally into the given panel as an animation sequence`;

const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';

export async function POST(request: NextRequest) {
  try {
    const { projectId, cutIndex, model, prompt: userPrompt, imageCutIndices, prevCutIndex } = await request.json();

    if (!projectId || cutIndex === undefined) {
      return NextResponse.json({ error: 'projectId, cutIndex 필요' }, { status: 400 });
    }

    // 1. 첨부할 컷 이미지 결정 (imageCutIndices 우선, 없으면 레거시 prevCutIndex 호환)
    let attachIndices: number[];
    if (imageCutIndices?.length) {
      attachIndices = imageCutIndices;
    } else if (prevCutIndex !== undefined) {
      attachIndices = [prevCutIndex, cutIndex];
    } else {
      attachIndices = [cutIndex];
    }

    const { data: fetchedCuts, error: cutError } = await supabase
      .from('webtoonanimation_cuts')
      .select('order_index, file_path')
      .eq('project_id', projectId)
      .in('order_index', attachIndices)
      .order('order_index');

    if (cutError || !fetchedCuts?.length) {
      return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });
    }

    // imageCutIndices 순서 유지 (order_index ASC가 아닌, 사용자가 지정한 순서)
    const orderedCuts = attachIndices
      .map(idx => fetchedCuts.find(c => c.order_index === idx))
      .filter(Boolean) as typeof fetchedCuts;

    // 2. 이미지 다운로드 + 리사이즈
    const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
    for (const c of orderedCuts) {
      const imgRes = await fetch(c.file_path);
      if (!imgRes.ok) throw new Error(`컷 ${c.order_index} 이미지 다운로드 실패`);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const resized = await sharp(imgBuffer)
        .resize(800, undefined, { fit: 'inside' })
        .png()
        .toBuffer();
      imageParts.push({ inlineData: { mimeType: 'image/png', data: resized.toString('base64') } });
    }

    // 3. Gemini로 직전 프레임 생성
    const selectedModel = model || DEFAULT_MODEL;
    const selectedPrompt = userPrompt || DEFAULT_BEFORE_PROMPT;
    console.log(`[generate-before-frame] 컷 ${cutIndex} 직전 프레임 생성 시작 (model: ${selectedModel}, images: [${attachIndices.join(',')}])`);

    const result = await generateGeminiImage({
      provider: 'gemini',
      model: selectedModel,
      contents: [{
        role: 'user',
        parts: [
          ...imageParts,
          { text: selectedPrompt },
        ],
      }],
      config: {
        responseModalities: ['IMAGE'],
        temperature: 1.0,
      },
      timeoutMs: 90000,
      retries: 2,
    });

    // 4. Supabase Storage 업로드
    const timestamp = Date.now();
    const storagePath = `webtoonanimation/${projectId}/before-frame-${cutIndex}-${timestamp}.png`;
    const uploadBuffer = Buffer.from(result.base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('webtoon-files')
      .upload(storagePath, uploadBuffer, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(storagePath);

    console.log(`[generate-before-frame] 완료 (컷 ${cutIndex}, ${result.elapsedMs}ms)`);

    return NextResponse.json({ imageUrl: publicUrl });
  } catch (error) {
    console.error('[generate-before-frame] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '직전 프레임 생성 실패' },
      { status: 500 }
    );
  }
}
