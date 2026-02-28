import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const body = await request.json();
    const { instruction, currentSeedancePrompt, storyboardImageUrl } = body;

    if (!instruction) {
      return NextResponse.json({ error: '수정 지시가 필요합니다.' }, { status: 400 });
    }

    if (!currentSeedancePrompt) {
      return NextResponse.json({ error: 'Seedance 프롬프트가 필요합니다.' }, { status: 400 });
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

    const systemPrompt = `You are refining a Seedance 2.0 video generation prompt.

CURRENT SEEDANCE PROMPT:
"""
${currentSeedancePrompt}
"""

USER'S REFINEMENT INSTRUCTION:
"${instruction}"

Rewrite the ENTIRE Seedance prompt incorporating the user's instruction.

RULES:
- Maintain the exact same structure: Header (@Image role assignments) → Time segments → Style → Sound
- Keep all @Image references and their order
- Keep "one-take" language
- First segment must keep "as the first frame", last must keep "as the last frame"
- Use transition language: "Tracking shot follows into", "Dolly reveals", "Camera cranes up to reveal"
- Include 2-3 production terms per segment (shot type, lens, lighting, color grade)
- Camera movement should amplify the motion in each segment
- Keep timing segments unless user specifically asks to change them

CONTENT SAFETY (CRITICAL — platform uses LLM-based context evaluation, not keyword matching):
Seedance evaluates the overall INTENT and CONTEXT of your prompt, not individual words.

1. WRITE AS A FILM DIRECTOR — every sentence describes what the camera captures, not narrative or emotions.
2. Use PRODUCTION LANGUAGE — shot types, camera movements, lens/format, lighting terms.
3. Describe CHOREOGRAPHY AND PHYSICS — weight shifts, momentum arcs, cloth dynamics, dust particles — not violence or harm.
4. NEVER describe intent to harm, pain, injury, or damage. Frame action as athletic choreography.
5. Refer to characters by ROLE (figure in coat, silhouetted figure) — never use age words (boy, girl, child, kid, young).
6. For action scenes: describe MOTION AND KINEMATICS ("arm sweeps in wide arc, coat trailing"), not combat ("punches/strikes/attacks").
7. No backstory, emotional narration, or character motivations — only what the lens sees.

Example reframe:
BAD: "A muscular figure delivers a devastating punch, sending the man flying backward"
GOOD: "Medium close-up, anamorphic lens. Large figure's arm extends in a broad sweeping arc, coat rippling. Tracking shot follows as suited figure steps backward, jacket flaring, dust particles catching rim light. Handheld shake."

Respond with ONLY the refined Seedance prompt as plain text. No JSON wrapping. No markdown code blocks. Just the prompt text.`;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: systemPrompt },
    ];
    if (imagePart) parts.push(imagePart);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        temperature: 0.7,
      },
      contents: [{
        role: 'user' as const,
        parts,
      }],
    });

    const responseText = response.text?.trim();
    if (!responseText) {
      return NextResponse.json({ error: 'Gemini 응답이 비어 있습니다.' }, { status: 500 });
    }

    return NextResponse.json({ seedance_prompt: responseText });
  } catch (error) {
    console.error('[refine-prompt] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI 수정 실패' },
      { status: 500 }
    );
  }
}
