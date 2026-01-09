import { NextRequest, NextResponse } from 'next/server';
import { generateGeminiImage } from '@/lib/image-generation';
import { supabase } from '@/lib/supabase';
import { saveCharacterSheetFromBase64 } from '@/lib/api/characterSheets';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ characterId?: string }> | { characterId?: string } }
) {
  const resolvedParams = await Promise.resolve(params);
  const characterId = resolvedParams.characterId;

  if (!characterId) {
    console.error('[generate-character-image][POST] characterId 누락', { params: resolvedParams });
    return NextResponse.json({ error: 'characterId가 필요합니다.' }, { status: 400 });
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  // 캐릭터 정보 조회
  const { data: character, error: characterError } = await supabase
    .from('characters')
    .select('name, description')
    .eq('id', characterId)
    .single();

  if (characterError || !character) {
    console.error('[generate-character-image][POST] 캐릭터 조회 실패:', characterError);
    return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 프롬프트 생성
  const prompt = `웹툰 캐릭터 이미지를 생성하세요.

캐릭터 이름: ${character.name}
${character.description ? `캐릭터 설명: ${character.description}` : ''}

요구사항:
- 웹툰 스타일의 캐릭터 일러스트
- 전신 이미지 (머리부터 발끝까지)
- 중립적인 포즈, 정면 또는 약간의 3/4 각도
- 깔끔한 배경 또는 투명 배경
- 캐릭터의 특징을 잘 드러내는 디자인`;

  try {
    const { base64, mimeType } = await generateGeminiImage({
      provider: 'gemini',
      model: 'gemini-3-pro-image-preview',
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: { imageSize: '1K' },
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32768,
      },
      timeoutMs: GEMINI_API_TIMEOUT,
      retries: 3,
    });

    const sheet = await saveCharacterSheetFromBase64(
      base64,
      mimeType || 'image/png',
      characterId,
      `${character.name}-generated`,
      `AI로 생성된 캐릭터 이미지`
    );

    console.log('[generate-character-image][POST] 캐릭터 이미지 생성 및 저장 완료', { characterId, sheetId: sheet.id });

    return NextResponse.json({
      success: true,
      sheetId: sheet.id,
      imageUrl: sheet.file_path,
    });
  } catch (error) {
    console.error('[generate-character-image][POST] 이미지 생성/저장 실패:', error);
    return NextResponse.json({ error: '캐릭터 이미지 생성에 실패했습니다.' }, { status: 500 });
  }
}











