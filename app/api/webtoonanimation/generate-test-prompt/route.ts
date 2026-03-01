import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * POST: 선택된 컷 이미지로 영상 프롬프트 생성
 * { projectId, cutIndices, inputMode, provider, duration }
 */
export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY 필요' }, { status: 500 });
    }

    const { projectId, cutIndices, inputMode, provider, duration } = await request.json();

    if (!projectId || !cutIndices?.length) {
      return NextResponse.json({ error: 'projectId, cutIndices 필요' }, { status: 400 });
    }

    // 1. 컷 이미지 다운로드 및 합치기
    const { data: cuts, error: cutsError } = await supabase
      .from('webtoonanimation_cuts')
      .select('order_index, file_path')
      .eq('project_id', projectId)
      .in('order_index', cutIndices)
      .order('order_index');

    if (cutsError) throw cutsError;
    if (!cuts?.length) throw new Error('컷을 찾을 수 없습니다');

    // 이미지를 가로로 합쳐서 Gemini에 전달
    const imageBuffers: Buffer[] = [];
    for (const cut of cuts) {
      const res = await fetch(cut.file_path);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const resized = await sharp(buf).resize(400, undefined, { fit: 'inside' }).png().toBuffer();
      imageBuffers.push(resized);
    }

    if (!imageBuffers.length) throw new Error('이미지 처리 실패');

    // 합친 이미지를 base64로
    const metas = await Promise.all(imageBuffers.map((b) => sharp(b).metadata()));
    const totalWidth = metas.reduce((sum, m) => sum + (m.width || 400), 0);
    const maxHeight = Math.max(...metas.map((m) => m.height || 400));

    let x = 0;
    const composites: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < imageBuffers.length; i++) {
      composites.push({ input: imageBuffers[i], left: x, top: 0 });
      x += metas[i].width || 400;
    }

    const combined = await sharp({
      create: { width: totalWidth, height: maxHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite(composites)
      .png()
      .toBuffer();

    const imageBase64 = combined.toString('base64');

    // 2. Gemini 프롬프트 생성
    const modeDesc = inputMode === 'start_end_frame'
      ? `The first image is the START frame and the last image is the END frame. Generate a prompt that describes the smooth transition/animation between these frames.`
      : inputMode === 'multi_reference'
        ? `These are reference images. Generate a prompt that creates a cinematic video incorporating elements from all reference images.`
        : `This is a single image. Generate a prompt that animates this scene with cinematic camera movement and subtle motion.`;

    const providerTips = provider === 'ltx2'
      ? `Tips for LTX-2: Focus on camera movements (dolly, pan, zoom). Describe motion physics. Keep it as a single flowing paragraph. Use present tense.`
      : provider === 'veo'
        ? `Tips for Veo: Use cinematic production language. Describe choreography and physics, not narrative. Use shot types and lens terminology.`
        : `Use cinematic, descriptive language focusing on motion and camera work.`;

    const systemPrompt = `You are an expert video generation prompt writer.

Given ${cuts.length} webtoon cut image(s), write a SHORT, effective English prompt for AI video generation.

${modeDesc}

${providerTips}

Target duration: ${duration || 4} seconds.

RULES:
- Write a single paragraph, 2-4 sentences max
- Focus on MOTION and CAMERA, not image description (the model already sees the image)
- Use present tense
- Include one camera movement (dolly, pan, zoom, track, orbit)
- Include subtle environmental motion (hair, cloth, dust, light)
- NO character names, NO narrative, NO emotional description
- Keep it under 200 words

Respond with ONLY the prompt text, no JSON, no explanation.`;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { temperature: 0.8 },
      contents: [{
        role: 'user' as const,
        parts: [
          { text: systemPrompt },
          { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        ],
      }],
    });

    const prompt = response.text?.trim();
    if (!prompt) {
      return NextResponse.json({ error: 'Gemini 응답이 비어 있습니다' }, { status: 500 });
    }

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('[generate-test-prompt] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프롬프트 생성 실패' },
      { status: 500 }
    );
  }
}
