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
- Maintain the exact same structure: Header → Time segments → Style → Sound
- Keep all @Image references and their order
- Keep "one-take" language and dynamic motion emphasis
- First segment must keep "as the first frame", last must keep "as the last frame"
- Use transition language between segments: "Motion flows into", "Momentum carries forward", "Energy shifts as"
- Emphasize DYNAMIC MOTION — characters should move expressively, not pose statically
- Camera movement should amplify the action in each segment
- Keep timing segments unless user specifically asks to change them

CONTENT SAFETY:
- NEVER use: "violent", "viciously", "bone-crushing", "blood", "gore", "brutal", "terrifying", "horrifying"
- Use neutral motion descriptors: "forceful impact", "powerful strike", "strong momentum"

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
