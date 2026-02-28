import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const PANEL_WIDTH = 600;
const LABEL_HEIGHT = 40;

interface CutPromptResult {
  cut_index: number;
  prompt: string;
  camera: string;
  continuity: string;
  duration: number;
}

interface GeminiSeedanceResponse {
  aspect_ratio: string;
  cuts: CutPromptResult[];
  seedance_prompt: string;
}

function createLabelSvg(cutNumber: number, width: number): Buffer {
  const svg = `<svg width="${width}" height="${LABEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${LABEL_HEIGHT}" fill="#222"/>
    <text x="${width / 2}" y="${LABEL_HEIGHT / 2 + 6}" text-anchor="middle" fill="white" font-size="20" font-family="sans-serif" font-weight="bold">Cut ${cutNumber}</text>
  </svg>`;
  return Buffer.from(svg);
}

function calculateTimeSegments(numCuts: number, totalDuration: number): { start: number; end: number }[] {
  const segDuration = totalDuration / numCuts;
  return Array.from({ length: numCuts }, (_, i) => ({
    start: parseFloat((i * segDuration).toFixed(1)),
    end: parseFloat(((i + 1) * segDuration).toFixed(1)),
  }));
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const body = await request.json();
    const { projectId, rangeStart, rangeEnd, pace, videoDuration } = body;
    const paceValue: 'slow' | 'normal' | 'fast' = pace || 'normal';
    const duration: number = videoDuration || 10;

    if (!projectId || rangeStart === undefined || rangeEnd === undefined) {
      return NextResponse.json(
        { error: 'projectId, rangeStart, rangeEnd가 필요합니다.' },
        { status: 400 }
      );
    }

    // 1. 해당 범위의 컷 이미지 조회
    const { data: cuts, error: cutsError } = await supabase
      .from('webtoonanimation_cuts')
      .select('*')
      .eq('project_id', projectId)
      .gte('order_index', rangeStart)
      .lte('order_index', rangeEnd)
      .order('order_index', { ascending: true });

    if (cutsError) throw cutsError;
    if (!cuts || cuts.length === 0) {
      return NextResponse.json({ error: '해당 범위에 컷이 없습니다.' }, { status: 400 });
    }

    const numCuts = cuts.length;
    console.log(`[generate-prompt] ${numCuts}개 컷 이미지 합치기 시작 (${rangeStart}~${rangeEnd}, ${duration}초)`);

    // 2. 이미지 다운로드 및 리사이즈
    const panelBuffers: { buffer: Buffer; height: number }[] = [];

    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i];
      const imgResponse = await fetch(cut.file_path);
      if (!imgResponse.ok) {
        console.error(`[generate-prompt] 이미지 다운로드 실패: ${cut.file_path}`);
        continue;
      }
      const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());

      const resized = await sharp(imgBuffer)
        .resize(PANEL_WIDTH, undefined, { fit: 'inside' })
        .png()
        .toBuffer();

      const meta = await sharp(resized).metadata();
      const imgHeight = meta.height || 400;

      const labelSvg = createLabelSvg(rangeStart + i, PANEL_WIDTH);

      const panelWithLabel = await sharp({
        create: {
          width: PANEL_WIDTH,
          height: LABEL_HEIGHT + imgHeight,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .composite([
          { input: labelSvg, top: 0, left: 0 },
          { input: resized, top: LABEL_HEIGHT, left: 0 },
        ])
        .png()
        .toBuffer();

      panelBuffers.push({ buffer: panelWithLabel, height: LABEL_HEIGHT + imgHeight });
    }

    if (panelBuffers.length === 0) {
      return NextResponse.json({ error: '처리할 이미지가 없습니다.' }, { status: 400 });
    }

    // 3. 세로로 합치기
    const totalHeight = panelBuffers.reduce((sum, p) => sum + p.height, 0);
    const compositeInputs: { input: Buffer; top: number; left: number }[] = [];
    let currentY = 0;
    for (const panel of panelBuffers) {
      compositeInputs.push({ input: panel.buffer, top: currentY, left: 0 });
      currentY += panel.height;
    }

    const combinedImage = await sharp({
      create: {
        width: PANEL_WIDTH,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(compositeInputs)
      .png()
      .toBuffer();

    // 4. Supabase Storage에 스토리보드 이미지 저장
    const storyboardPath = `webtoonanimation/${projectId}/storyboard-${rangeStart}-${rangeEnd}-${Date.now()}.png`;
    const { error: storeError } = await supabase.storage
      .from('webtoon-files')
      .upload(storyboardPath, combinedImage, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false,
      });

    let storyboardUrl: string | null = null;
    if (!storeError) {
      const { data: { publicUrl } } = supabase.storage
        .from('webtoon-files')
        .getPublicUrl(storyboardPath);
      storyboardUrl = publicUrl;
    }

    // 5. Gemini API 호출
    const imageBase64 = combinedImage.toString('base64');
    const timeSegments = calculateTimeSegments(numCuts, duration);

    const paceGuide = {
      slow: 'SLOW-PACED: Lingering, emotional beats with subtle movements. Weight toward longer per-cut durations.',
      normal: 'NORMAL-PACED: Balanced action and atmosphere. Moderate timing per cut.',
      fast: 'FAST-PACED: Rapid, explosive action. Short punchy cuts with maximum kinetic energy.',
    }[paceValue];

    const timeSegmentGuide = timeSegments
      .map((seg, i) => `  Cut ${i}: ${seg.start}s ~ ${seg.end}s`)
      .join('\n');

    const imageRefs = Array.from({ length: numCuts }, (_, i) => `@Image${i + 1}`).join(' ');

    const systemPrompt = `You are an expert prompt engineer for Seedance 2.0, ByteDance's multimodal AI video generation model.

You are analyzing a webtoon storyboard image with ${numCuts} panels (labeled Cut ${rangeStart} through Cut ${rangeEnd}).

Your task: Generate TWO outputs:
1. Per-cut structured analysis (JSON "cuts" array)
2. A SINGLE unified Seedance 2.0 prompt that treats ALL cuts as keyframes in ONE continuous video

=== PACING ===
${paceGuide}

Total video duration: ${duration} seconds.
Suggested time distribution (you may adjust based on scene analysis):
${timeSegmentGuide}

=== OUTPUT 1: PER-CUT ANALYSIS ===

For each cut, analyze:
- "prompt": Motion description in English using CINEMATIC PRODUCTION language. Describe body mechanics, physics, cloth/hair movement. Even calm scenes need subtle motion.
- "camera": Camera work using film terminology (e.g. "low angle, dolly push in", "whip pan right", "tracking shot, handheld")
- "continuity": "new scene" or "continues from previous cut"
- "duration": seconds allocated to this cut

=== OUTPUT 2: SEEDANCE PROMPT ===

Write a SINGLE unified Seedance 2.0 prompt following this EXACT structure:

LINE 1 (Header — list ALL @ role assignments first):
"${imageRefs} as keyframe positions for a one-take [genre] sequence."

BODY (Time segments — one line per cut):
Each line: "{start}-{end}s: @ImageN as [role]. [Shot type], [visual action description], [camera movement]. [Lens/lighting detail].—"

CRITICAL RULES for the Seedance prompt:
- First cut MUST say "as the first frame"
- Last cut MUST say "as the last frame"
- Between cuts, use TRANSITION language: "Tracking shot follows into", "Dolly reveals", "Camera cranes up to reveal"
- Describe what the CAMERA SEES, not narrative or character motivations
- Apply the film shoot test: if this sentence wouldn't appear on a shot list, remove it
- Include camera movement in each segment (push in, track, whip pan, orbit, dolly, crane, etc.)
- Each line must end with an em-dash (—) except the last line
- Include 2-3 production terms per segment (shot type, lens, lighting, color grade)

FINAL LINES:
"Style: [visual style + production format, e.g. cel-shaded anime, 2.39:1 anamorphic, shallow depth of field, high contrast]"
"Sound: [environmental sounds, foley, music style]"

=== CONTENT SAFETY (CRITICAL — platform uses LLM-based context evaluation) ===
Seedance 2.0 does NOT match keywords — it uses an LLM to evaluate the overall INTENT and CONTEXT of your prompt.
A violent or threatening context will be rejected even with safe words. A cinematic production context can describe intense scenes safely.

RULES:
1. WRITE AS A FILM DIRECTOR, NOT A STORYTELLER. Every sentence must describe what the camera captures, not narrative or emotional context.
2. Use PRODUCTION LANGUAGE throughout — shot types (wide shot, medium close-up, over-the-shoulder), camera movements (dolly, tracking, crane, pan, tilt), lens/format (35mm grain, anamorphic, shallow DOF), lighting (rim light, volumetric, diffused overcast).
3. Describe CHOREOGRAPHY AND PHYSICS — weight shifts, momentum arcs, cloth dynamics, hair physics, dust particles — not violence or harm.
4. NEVER describe intent to harm, pain, injury, or damage to people. Frame action scenes as athletic choreography or stunt coordination.
5. Refer to characters by their ROLE IN THE SCENE (figure in dark coat, silhouetted figure, tall figure) — NEVER use age words like "boy", "girl", "child", "kid", "young".
6. For action/fight scenes, describe the MOTION AND KINEMATICS: "figure's arm sweeps in a wide arc, coat trailing", not "figure punches/strikes/attacks".
7. No backstory, emotional narration, political references, or character motivations — only what the lens sees.

EXAMPLE — turning violent context into safe cinematic production:
BAD: "A soldier shoots someone in the street"
GOOD: "Wide shot, war-torn Eastern European street, 1940s. Uniformed figure fires toward off-screen position, smoke drifts from collapsed structures, overcast flat light, 35mm grain, documentary-style handheld framing."

BAD: "A muscular figure delivers a devastating punch, sending the man flying backward"
GOOD: "Medium close-up, anamorphic lens. Large figure's arm extends in a broad sweeping arc, coat fabric rippling with the motion. Tracking shot follows the momentum as the suited figure steps backward, jacket flaring, dust particles catching rim light. Handheld shake emphasizes the kinetic energy."

=== RESPONSE FORMAT ===

Respond ONLY with valid JSON:
{
  "aspect_ratio": "16:9",
  "cuts": [
    {
      "cut_index": 0,
      "prompt": "...",
      "camera": "...",
      "continuity": "new scene",
      "duration": 1.5
    }
  ],
  "seedance_prompt": "The full unified Seedance 2.0 prompt as a single string with newlines"
}`;

    console.log(`[generate-prompt] Gemini API 호출 시작 (pace: ${paceValue}, duration: ${duration}s)...`);

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const model = 'gemini-2.5-flash';

    const response = await ai.models.generateContent({
      model,
      config: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
      contents: [{
        role: 'user' as const,
        parts: [
          { text: systemPrompt },
          { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        ],
      }],
    });

    const responseText = response.text;

    if (!responseText) {
      return NextResponse.json({ error: 'Gemini 응답이 비어 있습니다.' }, { status: 500 });
    }

    let result: GeminiSeedanceResponse;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch {
      console.error('[generate-prompt] JSON 파싱 실패:', responseText);
      return NextResponse.json(
        { error: 'Gemini 응답 JSON 파싱 실패', raw: responseText.substring(0, 1000) },
        { status: 500 }
      );
    }

    // 6. DB에 저장
    const { data: group, error: groupError } = await supabase
      .from('webtoonanimation_prompt_groups')
      .insert({
        project_id: projectId,
        range_start: rangeStart,
        range_end: rangeEnd,
        storyboard_image_path: storyboardUrl,
        aspect_ratio: result.aspect_ratio || '16:9',
        seedance_prompt: result.seedance_prompt || null,
        video_duration: duration,
      })
      .select()
      .single();

    if (groupError) throw groupError;

    const cutPrompts = result.cuts.map((cut) => ({
      group_id: group.id,
      cut_index: cut.cut_index,
      prompt: cut.prompt,
      camera: cut.camera || null,
      continuity: cut.continuity || 'new scene',
      duration: (cut.duration > 0 && cut.duration <= 15) ? cut.duration : 4,
    }));

    const { data: savedPrompts, error: promptsError } = await supabase
      .from('webtoonanimation_cut_prompts')
      .insert(cutPrompts)
      .select();

    if (promptsError) throw promptsError;

    console.log(`[generate-prompt] 완료: ${savedPrompts?.length}개 컷 프롬프트 + Seedance 프롬프트 저장`);

    return NextResponse.json({
      group: { ...group, cut_prompts: savedPrompts },
    });
  } catch (error) {
    console.error('[generate-prompt] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프롬프트 생성 실패' },
      { status: 500 }
    );
  }
}
