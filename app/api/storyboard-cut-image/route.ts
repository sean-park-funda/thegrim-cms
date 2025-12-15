import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000;

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as {
    title?: string;
    background?: string;
    description?: string;
    dialogue?: string;
    storyboardId?: string;
    cutIndex?: number;
    selectedCharacterSheets?: Record<string, number>; // 캐릭터 이름 -> 선택된 시트 인덱스
  } | null;

  const description = body?.description?.trim();
  if (!description) {
    return NextResponse.json({ error: 'description이 필요합니다.' }, { status: 400 });
  }

  const title = body?.title?.trim() || '컷';
  const background = body?.background?.trim();
  const dialogue = body?.dialogue?.trim();
  const storyboardId = body?.storyboardId;
  const cutIndex = typeof body?.cutIndex === 'number' ? body.cutIndex : undefined;

  if (!storyboardId || cutIndex === undefined) {
    console.error('[storyboard-cut-image] storyboardId/cutIndex 누락', { storyboardId, cutIndex });
    return NextResponse.json({ error: 'storyboardId와 cutIndex가 필요합니다.' }, { status: 400 });
  }

  // 스토리보드 조회하여 등장인물 목록 가져오기
  const { data: storyboard, error: storyboardError } = await supabase
    .from('episode_script_storyboards')
    .select('response_json, script_id')
    .eq('id', storyboardId)
    .single();

  if (storyboardError || !storyboard) {
    console.error('[storyboard-cut-image] 스토리보드 조회 실패:', storyboardError);
    return NextResponse.json({ error: '스토리보드를 찾을 수 없습니다.' }, { status: 404 });
  }

  // episode_id로 webtoon_id 조회
  const { data: script } = await supabase
    .from('episode_scripts')
    .select('episode_id')
    .eq('id', storyboard.script_id)
    .single();

  let webtoonId: string | null = null;
  if (script) {
    const { data: episode } = await supabase
      .from('episodes')
      .select('webtoon_id')
      .eq('id', script.episode_id)
      .single();
    webtoonId = episode?.webtoon_id || null;
  }

  // 현재 컷의 대사에서 캐릭터 이름 추출
  const characterSheetImages: Array<{ base64: string; mimeType: string; characterName: string }> = [];
  const responseJson = storyboard.response_json as { 
    cuts?: Array<{ cutNumber?: number; dialogue?: string; charactersInCut?: string[] }>; 
    characters?: Array<{ name?: string; description?: string }> 
  };

  // 현재 컷 정보 가져오기
  const currentCut = responseJson.cuts?.[cutIndex];
  const cutDialogue = currentCut?.dialogue || dialogue || '';
  
  // 캐릭터 이름 추출을 위한 Set 초기화
  const characterNamesInDialogue = new Set<string>();
  
  // 0단계: 글콘티에서 컷마다 명시한 등장인물 배열(charactersInCut)이 있으면 우선 사용
  if (currentCut?.charactersInCut && Array.isArray(currentCut.charactersInCut)) {
    for (const name of currentCut.charactersInCut) {
      const trimmed = (name || '').trim();
      if (trimmed) {
        characterNamesInDialogue.add(trimmed);
      }
    }
  }

  // 1단계: 대사에서 캐릭터 이름 추출 (패턴: "캐릭터이름:", "캐릭터이름(OFF):", "N박스: 캐릭터이름" 등)
  
  // 패턴 1: "캐릭터이름:" 또는 "캐릭터이름(OFF):"
  const nameColonPattern = /^([가-힣a-zA-Z\s]+?)(?:\([^)]+\))?\s*:/gm;
  let match;
  while ((match = nameColonPattern.exec(cutDialogue)) !== null) {
    const name = match[1].trim();
    if (name && name !== 'N박스') {
      characterNamesInDialogue.add(name);
    }
  }
  
  // 패턴 2: "N박스: 캐릭터이름(정보)"
  const nboxPattern = /N박스:\s*([가-힣a-zA-Z\s]+?)(?:\([^)]+\))?/g;
  while ((match = nboxPattern.exec(cutDialogue)) !== null) {
    const name = match[1].trim();
    if (name) {
      characterNamesInDialogue.add(name);
    }
  }

  // description에서도 캐릭터 이름 추출 (예: "원도진(12세)")
  const descriptionPattern = /([가-힣a-zA-Z\s]+?)(?:\(\d+[세]\))?/g;
  while ((match = descriptionPattern.exec(description)) !== null) {
    const name = match[1].trim();
    // 일반적인 단어는 제외
    if (name && name.length > 1 && !['미디엄', '클로즈업', '풀', '샷', '투', '배경', '연출', '구도'].includes(name)) {
      characterNamesInDialogue.add(name);
    }
  }

  console.log('[storyboard-cut-image] 추출된 캐릭터 이름:', Array.from(characterNamesInDialogue));

  if (webtoonId && characterNamesInDialogue.size > 0) {
    console.log('[storyboard-cut-image] 캐릭터시트 이미지 다운로드 시작...', { 
      cutIndex, 
      characterNames: Array.from(characterNamesInDialogue) 
    });

    for (const charName of characterNamesInDialogue) {
      try {
        // 캐릭터 조회
        const { data: characters } = await supabase
          .from('characters')
          .select('id')
          .eq('webtoon_id', webtoonId)
          .ilike('name', charName.trim())
          .limit(1);

        if (!characters || characters.length === 0) {
          console.log('[storyboard-cut-image] 캐릭터를 찾을 수 없음:', charName);
          continue;
        }

        const characterId = characters[0].id;

        // 캐릭터시트 조회 (선택된 시트 또는 첫 번째 시트)
        const { data: sheets } = await supabase
          .from('character_sheets')
          .select('file_path')
          .eq('character_id', characterId)
          .order('created_at', { ascending: true });

        if (!sheets || sheets.length === 0) {
          console.log('[storyboard-cut-image] 캐릭터시트를 찾을 수 없음:', charName);
          continue;
        }

        // 선택된 시트 인덱스 확인 (없으면 0 사용)
        const selectedSheetIndex = body?.selectedCharacterSheets?.[charName] ?? 0;
        const sheetIndex = Math.min(selectedSheetIndex, sheets.length - 1);
        const sheet = sheets[sheetIndex];
        
        console.log('[storyboard-cut-image] 선택된 캐릭터시트 사용:', {
          characterName: charName,
          selectedIndex: selectedSheetIndex,
          totalSheets: sheets.length,
          usingIndex: sheetIndex,
        });
        console.log('[storyboard-cut-image] 캐릭터시트 이미지 다운로드 시작...', { characterName: charName, filePath: sheet.file_path });
        const sheetResponse = await fetch(sheet.file_path);

        if (!sheetResponse.ok) {
          console.error('[storyboard-cut-image] 캐릭터시트 이미지 다운로드 실패:', {
            characterName: charName,
            status: sheetResponse.status,
            statusText: sheetResponse.statusText,
          });
          continue;
        }

        const sheetArrayBuffer = await sheetResponse.arrayBuffer();
        const sheetBuffer = Buffer.from(sheetArrayBuffer);
        const sheetBase64 = sheetBuffer.toString('base64');
        const sheetMimeType = sheetResponse.headers.get('content-type') || 'image/jpeg';

        characterSheetImages.push({
          base64: sheetBase64,
          mimeType: sheetMimeType,
          characterName: charName,
        });

        console.log('[storyboard-cut-image] 캐릭터시트 이미지 다운로드 완료:', {
          characterName: charName,
          size: sheetBuffer.length,
          mimeType: sheetMimeType,
        });
      } catch (error) {
        console.error('[storyboard-cut-image] 캐릭터시트 이미지 다운로드 중 오류:', {
          characterName: charName,
          error: error instanceof Error ? error.message : String(error),
        });
        // 개별 실패해도 계속 진행
      }
    }

    console.log('[storyboard-cut-image] 캐릭터시트 이미지 다운로드 완료:', {
      cutIndex,
      total: characterNamesInDialogue.size,
      success: characterSheetImages.length,
      characterNames: characterSheetImages.map(c => c.characterName),
    });
  }

  // 등장인물 목록 생성
  const characterNamesList = characterSheetImages.length > 0 
    ? characterSheetImages.map(c => c.characterName).join(', ')
    : '없음';

  // 기본 프롬프트 생성
  let prompt = `웹툰 콘티 스케치를 생성하세요.
- 흑백 스케치 스타일, 잉크 느낌
- 명확한 구도/카메라 시점/인물 포즈 표현
- 과도한 채색 없이 라인 드로잉 강조
- **중요: 배경 설명을 정확히 반영하여 배경을 상세히 그려주세요. 배경의 일관성을 유지하는 것이 중요합니다.**
${characterSheetImages.length > 0 ? '- **중요: 아래 제공된 캐릭터 레퍼런스 이미지를 정확히 참고하여 각 캐릭터의 디자인을 일관성 있게 그려주세요. 각 레퍼런스 이미지 앞에 해당 캐릭터 이름이 명시되어 있습니다.**' : ''}

컷 제목: ${title}
${background ? `배경: ${background}\n` : ''}등장인물: ${characterNamesList}
연출/구도: ${description}
${dialogue ? `대사/내레이션: ${dialogue}` : ''}`;

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const config = {
    responseModalities: ['IMAGE'],
    imageConfig: {
      imageSize: '1K',
    },
    temperature: 0.6,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 32768,
  };

  // 캐릭터시트 이미지가 있으면 contentParts에 추가
  // 각 이미지 앞에 해당 캐릭터 이름을 명시하는 텍스트를 추가
  const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];

  // 캐릭터시트 이미지들을 레퍼런스 이미지로 추가
  // 각 이미지 앞에 해당 캐릭터 이름을 명시
  for (const sheetImage of characterSheetImages) {
    // 각 이미지 앞에 해당 캐릭터 이름을 명시하는 텍스트 추가
    contentParts.push({
      text: `\n[캐릭터 레퍼런스 이미지: ${sheetImage.characterName}]\n이 이미지는 "${sheetImage.characterName}" 캐릭터의 디자인 레퍼런스입니다. 이 캐릭터를 그릴 때는 이 레퍼런스 이미지의 디자인을 정확히 반영해주세요.`,
    });
    contentParts.push({
      inlineData: {
        mimeType: sheetImage.mimeType,
        data: sheetImage.base64,
      },
    });
  }

  const contents = [
    {
      role: 'user' as const,
      parts: contentParts,
    },
  ];

  const maxRetries = 2;
  let lastError: unknown = null;
  let response: Awaited<ReturnType<typeof ai.models.generateContentStream>> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Gemini API 타임아웃: ${GEMINI_API_TIMEOUT}ms 초과`)), GEMINI_API_TIMEOUT);
      });

      const apiPromise = ai.models.generateContentStream({
        model: 'gemini-3-pro-image-preview',
        config,
        contents,
      });

      console.log('[storyboard-cut-image] Gemini 호출', { attempt, model: 'gemini-3-pro-image-preview' });
      response = await Promise.race([apiPromise, timeoutPromise]);
      break;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) {
        console.error('[storyboard-cut-image] Gemini 호출 실패:', error);
        return NextResponse.json({ error: '콘티 생성에 실패했습니다.' }, { status: 500 });
      }
    }
  }

  if (!response) {
    console.error('[storyboard-cut-image] 응답 없음:', lastError);
    return NextResponse.json({ error: '콘티 생성에 실패했습니다.' }, { status: 500 });
  }

  for await (const chunk of response) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData) {
        const { data, mimeType } = part.inlineData;
        const safeMime = mimeType || 'image/png';

        // DB 저장
        const { error: insertError } = await supabase
          .from('episode_script_storyboard_images')
          .insert({
            storyboard_id: storyboardId,
            cut_index: cutIndex,
            mime_type: safeMime,
            image_base64: data,
          });

        if (insertError) {
          console.error('[storyboard-cut-image] DB 저장 실패:', insertError);
          return NextResponse.json({ error: '이미지 저장에 실패했습니다.' }, { status: 500 });
        }

        const dataUrl = `data:${safeMime};base64,${data}`;
        console.log('[storyboard-cut-image] 생성 및 저장 완료', { storyboardId, cutIndex });
        return NextResponse.json({ imageUrl: dataUrl, mimeType: safeMime });
      }
    }
  }

  console.error('[storyboard-cut-image] 이미지 파트 없음');
  return NextResponse.json({ error: '이미지 생성에 실패했습니다.' }, { status: 500 });
}

