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

interface GeminiPromptResponse {
  aspect_ratio: string;
  cuts: CutPromptResult[];
}

function createLabelSvg(cutNumber: number, width: number): Buffer {
  const svg = `<svg width="${width}" height="${LABEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${LABEL_HEIGHT}" fill="#222"/>
    <text x="${width / 2}" y="${LABEL_HEIGHT / 2 + 6}" text-anchor="middle" fill="white" font-size="20" font-family="sans-serif" font-weight="bold">Cut ${cutNumber}</text>
  </svg>`;
  return Buffer.from(svg);
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const body = await request.json();
    const { projectId, rangeStart, rangeEnd, pace } = body;
    const paceValue: 'slow' | 'normal' | 'fast' = pace || 'normal';

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

    console.log(`[generate-prompt] ${cuts.length}개 컷 이미지 합치기 시작 (${rangeStart}~${rangeEnd})`);

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

    // 5. Gemini API 호출 (@google/genai 라이브러리)
    const imageBase64 = combinedImage.toString('base64');

    const paceGuide = {
      slow: 'This is a SLOW-PACED scene. Each cut should have long, lingering descriptions with subtle movements and emotional beats. Suggest longer durations (6-12 seconds).',
      normal: 'This is a NORMAL-PACED scene. Balance between action and atmosphere. Use moderate durations (2-6 seconds).',
      fast: 'This is a FAST-PACED, action-heavy scene. Each cut should be short and punchy with rapid, dynamic movements. Suggest very short durations (0.5-2 seconds). Emphasize explosive motion, impact, and speed.',
    }[paceValue];

    const systemPrompt = `You are an expert video prompt engineer. You are analyzing a webtoon storyboard image. Each panel is labeled with a cut number at the top.

For each cut, generate video production parameters for a video generation AI.

PACING: ${paceGuide}

=== PROMPT WRITING RULES ===

Write vivid, motion-focused descriptions that convey physical energy and dynamics.

STRUCTURE:
1. Lead with a concise action phrase that sets the kinetic tone (e.g. "Sudden halt!", "Quick stride forward", "Powerful overhead swing")
2. Describe the primary action with clear motion details — direction, speed, body mechanics
3. Add secondary physics: cloth/hair movement, dust, debris, wind, light changes
4. Even calm scenes should have subtle motion: breathing, wind, flickering light

IMPORTANT — CONTENT SAFETY:
- NEVER use graphic violence words: "violent", "viciously", "bone-crushing", "blood", "gore", "gruesome", "brutal", "terrifying", "horrifying"
- NEVER describe injury details, bodily harm, or graphic physical damage to characters
- Instead of graphic terms, use NEUTRAL MOTION descriptors:
  - "forceful impact" instead of "violent slam"
  - "powerful strike" instead of "bone-crushing punch"
  - "strong momentum" instead of "terrifying speed"
  - "red particles scatter" instead of "blood splatters"
  - "heavy collision" instead of "brutal crash"
- Describe the PHYSICS and MOTION, not the pain or damage
- Think of it as describing choreography or animation keyframes, not depicting harm
- The tone should be like a storyboard artist's notes: technical, precise, motion-focused

GOOD EXAMPLES:
- "Powerful forward stride! A foot in a dark shoe steps onto cracked stone. Dust rises from the surface, pant leg swaying with momentum."
- "Swift punch connects! A large fist meets the man's face with strong impact. Sunglasses shatter into fragments, motion blur emphasizing the speed."
- "Forceful ground strike! The creature drives its fist downward with immense weight. The stone surface cracks outward, dust and debris launching into the air."
- "The creature lifts the man upside down by his ankles. Suit jacket and tie hang with gravity, body swinging with residual momentum."

BAD EXAMPLES (DO NOT USE):
- "Violently slams with bone-crushing force" (too graphic)
- "Blood erupts from the impact" (graphic injury)
- "Terrifying speed, brutal impact" (triggering words)

ADDITIONAL RULES:
- Must be in English
- Focus ENTIRELY on character actions, movements, and physical interactions — NOT camera work
- Describe body mechanics: which limb moves, in what direction, with what speed
- Use strong but safe action verbs: strikes, connects, collides, launches, swings, hurls, sweeps, dashes, leaps

=== OTHER FIELDS ===
- "reference_image": each cut gets a reference image tag in order: "@cut01" for cut_index 0, "@cut02" for cut_index 1, etc. This tells the video AI which source image file to use for that cut.
- "camera" describes camera work and lens SEPARATELY from the action (e.g. "low angle, rapid zoom in with shake", "dramatic dolly push", "whip pan following motion")
- "continuity" must be "new scene" or "continues from cut N" (referencing the cut number shown in the image)
- "duration" is a number in seconds (can be decimal, e.g. 0.5, 1, 2, 4, 8). Based on the pacing guidance above, analyze each cut's action and suggest how many seconds it would naturally take to play out as video. A quick punch might be 0.5s, a slow emotional gaze might be 8s.
- "aspect_ratio" is a shared value for all cuts

Respond ONLY with valid JSON in this exact format:
{
  "aspect_ratio": "16:9",
  "cuts": [
    {
      "cut_index": 0,
      "reference_image": "@cut01",
      "prompt": "...",
      "camera": "...",
      "continuity": "new scene",
      "duration": 1.5
    }
  ]
}`;

    console.log(`[generate-prompt] Gemini API 호출 시작 (pace: ${paceValue})...`);

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const model = 'gemini-3.1-pro-preview';

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

    let result: GeminiPromptResponse;
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
      duration: (cut.duration > 0 && cut.duration <= 12) ? cut.duration : 4,
    }));

    const { data: savedPrompts, error: promptsError } = await supabase
      .from('webtoonanimation_cut_prompts')
      .insert(cutPrompts)
      .select();

    if (promptsError) throw promptsError;

    console.log(`[generate-prompt] 완료: ${savedPrompts?.length}개 컷 프롬프트 저장`);

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
