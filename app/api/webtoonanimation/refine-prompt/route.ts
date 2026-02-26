import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const body = await request.json();
    const { instruction, currentPrompt, currentCamera, currentContinuity, currentDuration, storyboardImageUrl } = body;

    if (!instruction) {
      return NextResponse.json({ error: '수정 지시가 필요합니다.' }, { status: 400 });
    }

    let imagePart: { inlineData: { mimeType: string; data: string } } | null = null;
    if (storyboardImageUrl) {
      try {
        const imgRes = await fetch(storyboardImageUrl);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          imagePart = {
            inlineData: {
              mimeType: imgRes.headers.get('content-type') || 'image/png',
              data: buf.toString('base64'),
            },
          };
        }
      } catch (e) {
        console.error('[refine-prompt] 스토리보드 이미지 로드 실패:', e);
      }
    }

    const systemPrompt = `You are refining a single cut's video production parameters.

CURRENT VALUES:
- prompt: "${currentPrompt || ''}"
- camera: "${currentCamera || ''}"
- continuity: "${currentContinuity || 'new scene'}"
- duration: ${currentDuration || 4}

USER'S REFINEMENT INSTRUCTION:
"${instruction}"

Based on the user's instruction (and the storyboard image if provided), update the cut's parameters.
- "prompt" must be in English, focused on character actions/movements (NOT camera work)
- "camera" describes camera work and lens separately
- "continuity" stays the same unless the user asks to change it
- "duration" should be adjusted if the instruction implies a different pacing

CONTENT SAFETY — MANDATORY:
- NEVER use graphic violence words: "violent", "viciously", "bone-crushing", "blood", "gore", "brutal", "terrifying", "horrifying"
- NEVER describe injury details or bodily harm
- Use neutral motion descriptors: "forceful impact", "powerful strike", "strong momentum", "heavy collision"
- Describe PHYSICS and MOTION, not pain or damage. Think choreography notes, not harm depiction.

Respond ONLY with valid JSON:
{
  "prompt": "...",
  "camera": "...",
  "continuity": "...",
  "duration": 1.5
}`;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: systemPrompt },
    ];
    if (imagePart) parts.push(imagePart);

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      config: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
      contents: [{
        role: 'user' as const,
        parts,
      }],
    });

    const responseText = response.text;
    if (!responseText) {
      return NextResponse.json({ error: 'Gemini 응답이 비어 있습니다.' }, { status: 500 });
    }

    let result: { prompt: string; camera: string; continuity: string; duration: number };
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch {
      return NextResponse.json({ error: 'JSON 파싱 실패', raw: responseText.substring(0, 500) }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[refine-prompt] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI 수정 실패' },
      { status: 500 }
    );
  }
}
