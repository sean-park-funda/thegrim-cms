import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scriptId?: string }> | { scriptId?: string } }
) {
  // Next.js 15+에서는 params가 Promise일 수 있음
  const resolvedParams = await Promise.resolve(params);
  const body = await request.json().catch(() => null) as { scriptId?: string } | null;
  const scriptId = resolvedParams.scriptId || body?.scriptId;
  
  if (!scriptId) {
    console.error('[analyze-characters][POST] scriptId 누락', { params: resolvedParams, body });
    return NextResponse.json({ error: 'scriptId가 필요합니다.' }, { status: 400 });
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  // 스크립트 조회
  const { data: script, error: scriptError } = await supabase
    .from('episode_scripts')
    .select('content, title, episode_id')
    .eq('id', scriptId)
    .single();

  if (scriptError || !script) {
    console.error('[analyze-characters][POST] 스크립트 조회 실패:', scriptError);
    return NextResponse.json({ error: '스크립트를 찾을 수 없습니다.' }, { status: 404 });
  }

  // episode_id로 webtoon_id 조회
  const { data: episode, error: episodeError } = await supabase
    .from('episodes')
    .select('webtoon_id')
    .eq('id', script.episode_id)
    .single();

  if (episodeError || !episode) {
    console.error('[analyze-characters][POST] 회차 조회 실패:', episodeError);
    return NextResponse.json({ error: '회차를 찾을 수 없습니다.' }, { status: 404 });
  }

  const webtoonId = episode.webtoon_id;

  const prompt = `당신은 웹툰 제작회사의 프로 작가입니다. 대본을 분석하여 등장하는 모든 캐릭터의 이름과 기본 형상(외모, 복장, 특징)을 추출해주세요.

**매우 중요: 응답은 반드시 완전한(완성된) 순수 JSON으로만 반환하세요.**
- 마크다운 코드블록 사용 금지
- 설명 텍스트나 주석 포함 금지
- JSON 객체는 반드시 완전히 닫혀야 함 (모든 문자열 필드는 따옴표로 닫혀야 함, 모든 배열과 객체는 닫는 괄호가 있어야 함)
- 응답의 마지막은 반드시 }로 끝나야 함
- description 필드의 문자열은 반드시 닫는 따옴표로 끝나야 함

**description 필드 작성 규칙 (매우 중요):**
- 캐릭터의 **기본 형상**만 묘사하세요: 외모, 복장, 신체적 특징, 기본적인 스타일
- **각 캐릭터마다 구체적이고 상세하게 묘사하세요** - 모호한 표현 지양
- **각 캐릭터마다 독특한 특징을 부여하세요** - 다른 캐릭터와 구별되는 특징적인 요소를 명시
- **제외해야 할 것들:**
  * 특정 상황이나 장면 정보 (예: "다리 기둥 뒤에 숨어서", "폭주족들을 지켜봄")
  * 특정 포즈나 행동 (예: "주먹을 쥐고 부르르 떨며")
  * 스토리 전개 정보 (예: "나중에 헬멧을 착용함")
  * 감정이나 심리 상태 (예: "두근거리는 마음으로", "공포와 동경이 섞인")
- **포함해야 할 것들 (구체적으로):**
  * 나이, 성별, 체형 등 기본 정보 (예: "만 12세 남자 초등학생, 작고 마른 체형")
  * 머리카락 색상, 길이, 스타일 (예: "검은색 짧은 포마드 스타일", "갈색 중간 길이 자연스러운 웨이브")
  * 얼굴 특징을 구체적으로 (예: "큰 둥근 눈, 작고 뾰족한 코, 얇은 입술", "작은 눈, 넓은 코, 두꺼운 입술")
  * 기본 복장을 상세히 (예: "흰색 반팔 티셔츠에 작은 로고, 회색 반바지, 검은색 운동화", "검은색 후드티, 청바지, 화이트 운동화")
  * 특징적인 액세서리나 소품 (항상 착용하는 것만, 예: "검은색 모자 항상 착용", "은색 귀걸이")
  * 키, 체격 등 신체적 특징 (예: "작은 키, 마른 체형", "평균 키, 근육질 체형")
  * **각 캐릭터를 구별할 수 있는 독특한 특징** (예: "왼쪽 볼에 작은 점", "눈썹이 매우 진함", "앞니가 약간 튀어나옴")

**캐릭터 차별화 원칙:**
- 각 캐릭터마다 최소 3개 이상의 구별되는 특징을 명시하세요
- 머리카락, 얼굴형, 복장 스타일 등에서 차이를 두세요
- 비슷한 나이대나 성별이라도 외모나 스타일에서 명확한 차이를 만들어주세요

각 캐릭터의 필드 설명:
- name (캐릭터 이름, 필수): 대본에서 등장하는 캐릭터의 이름
- description (기본 형상 묘사, 필수): 캐릭터의 외모, 복장, 신체적 특징을 **구체적이고 상세하게** 묘사하며, **다른 캐릭터와 구별되는 독특한 특징**을 포함 (상황/스토리 정보 제외, 문자열은 반드시 닫는 따옴표로 끝나야 함)

응답 형식 (반드시 이 형식을 정확히 따르세요):
{
  "characters": [
    {
      "name": "캐릭터 이름",
      "description": "나이, 성별, 체형, 머리카락 색상/길이/스타일, 얼굴 특징(눈/코/입), 기본 복장(상의/하의/신발), 특징적인 액세서리, 신체적 특징, 독특한 특징 등 (상황/스토리 정보 제외, 구체적이고 상세하게)"
    }
  ]
}

예시:
- 좋은 description: "만 12세 남자 초등학생. 작고 마른 체형. 검은색 짧은 포마드 스타일 머리. 큰 둥근 눈, 작고 뾰족한 코, 얇은 입술. 흰색 반팔 티셔츠에 작은 로고, 회색 반바지, 검은색 운동화 착용. 왼쪽 볼에 작은 점이 있음. 눈썹이 매우 진함."
- 나쁜 description: "만 12세의 초등학생. 뚝섬 다리 기둥 뒤에 숨어서 두근거리는 마음으로 폭주족들을 지켜봄. 주먹을 쥐고 부르르 떨며 공포와 동경이 섞인 표정을 지음."

제목: ${script.title || '씬'}
대본:
${script.content}`;

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const config = {
    responseModalities: ['TEXT'],
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 16384, // 토큰 수 증가 (응답이 잘리는 문제 방지)
  };

  const contents = [
    {
      role: 'user' as const,
      parts: [{ text: prompt }],
    },
  ];

  // 타임아웃과 재시도
  const maxRetries = 3;
  let lastError: unknown = null;
  let response: Awaited<ReturnType<typeof ai.models.generateContentStream>> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Gemini API 타임아웃: ${GEMINI_API_TIMEOUT}ms 초과`)), GEMINI_API_TIMEOUT);
      });

      const apiPromise = ai.models.generateContentStream({ model: 'gemini-3-pro-preview', config, contents });

      response = await Promise.race([apiPromise, timeoutPromise]);
      break;
    } catch (error: unknown) {
      lastError = error;
      if (attempt >= maxRetries) {
        console.error('[analyze-characters][POST] Gemini 호출 실패:', error);
        return NextResponse.json({ error: '캐릭터 분석에 실패했습니다.' }, { status: 500 });
      }
    }
  }

  if (!response) {
    console.error('[analyze-characters][POST] Gemini 응답 없음:', lastError);
    return NextResponse.json({ error: '캐릭터 분석에 실패했습니다.' }, { status: 500 });
  }

  let responseText = '';
  let chunkCount = 0;
  for await (const chunk of response) {
    chunkCount++;
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.text) responseText += part.text;
    }
  }

  console.log('[analyze-characters][POST] Gemini 응답 수신 완료:', {
    chunkCount,
    totalLength: responseText.length,
    preview: responseText.substring(0, 300),
    lastChars: responseText.substring(Math.max(0, responseText.length - 100)),
    endsWithBrace: responseText.trim().endsWith('}'),
    endsWithQuote: responseText.trim().endsWith('"'),
  });

  // 응답이 완전한지 확인
  if (!responseText.trim().endsWith('}')) {
    console.warn('[analyze-characters][POST] 응답이 불완전할 수 있음 (마지막이 }로 끝나지 않음)');
  }

  // JSON 파싱
  let parsed: { characters?: Array<{ name?: string; description?: string }> };
  try {
    let cleaned = responseText.trim();
    
    // 마크다운 코드 블록 제거
    if (cleaned.includes('```')) {
      const start = cleaned.indexOf('```');
      const end = cleaned.lastIndexOf('```');
      if (start !== -1 && end !== -1 && end > start) {
        cleaned = cleaned.substring(start + 3, end);
        // json, json:json 등의 언어 태그 제거
        cleaned = cleaned.replace(/^json:?json?\s*/i, '').replace(/```/g, '').trim();
      }
    }

    // JSON 객체 시작과 끝 찾기
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error('JSON 객체를 찾을 수 없습니다.');
    }
    
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

    // JSON 파싱 (불완전한 문자열 복구 포함)
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError: any) {
      // "Unterminated string" 오류인 경우 복구 시도
      if (parseError.message && parseError.message.includes('Unterminated string')) {
        console.warn('[analyze-characters][POST] 불완전한 JSON 감지, 복구 시도...');
        
        // 닫히지 않은 문자열 필드 찾기 및 복구
        // "description": "로 시작하지만 닫히지 않은 경우
        // 마지막 "description": " 부분 찾기
        const lastDescMatch = cleaned.match(/"description"\s*:\s*"[^"]*$/);
        if (lastDescMatch) {
          // 닫히지 않은 description 필드 복구
          const matchIndex = cleaned.lastIndexOf('"description"');
          if (matchIndex !== -1) {
            const beforeDesc = cleaned.substring(0, matchIndex);
            const descPart = cleaned.substring(matchIndex);
            const colonIndex = descPart.indexOf(':');
            const firstQuoteIndex = descPart.indexOf('"', colonIndex);
            
            if (colonIndex !== -1 && firstQuoteIndex !== -1) {
              // description: " 이후의 내용 (닫히지 않은 부분)
              const contentStart = matchIndex + firstQuoteIndex + 1;
              const incompleteContent = cleaned.substring(contentStart);
              
              // 공백, 줄바꿈, 중괄호 등 제거
              const trimmedContent = incompleteContent.trim().replace(/[\s,}\]]+$/, '');
              
              // 복구: description 필드 닫기
              cleaned = beforeDesc + descPart.substring(0, firstQuoteIndex + 1) + trimmedContent + '"';
              
              // 마지막 중괄호 확인
              if (!cleaned.endsWith('}')) {
                cleaned += '}';
              }
              
              // 다시 파싱 시도
              try {
                parsed = JSON.parse(cleaned);
                console.log('[analyze-characters][POST] JSON 복구 성공');
              } catch (secondError) {
                console.error('[analyze-characters][POST] JSON 복구 실패:', secondError);
                throw parseError;
              }
            } else {
              throw parseError;
            }
          } else {
            throw parseError;
          }
        } else {
          throw parseError;
        }
      } else {
        throw parseError;
      }
    }
  } catch (error) {
    console.error('[analyze-characters][POST] JSON 파싱 실패:', error);
    console.error('[analyze-characters][POST] 응답 텍스트 (처음 500자):', responseText.substring(0, 500));
    console.error('[analyze-characters][POST] 응답 텍스트 (마지막 500자):', responseText.substring(Math.max(0, responseText.length - 500)));
    return NextResponse.json({ 
      error: 'Gemini 응답 파싱에 실패했습니다. 응답 형식을 확인해주세요.' 
    }, { status: 500 });
  }

  if (!parsed.characters || !Array.isArray(parsed.characters)) {
    console.error('[analyze-characters][POST] 잘못된 응답 형식:', parsed);
    console.error('[analyze-characters][POST] 원본 응답:', responseText);
    return NextResponse.json({ error: '캐릭터 목록을 찾을 수 없습니다.' }, { status: 500 });
  }

  // 유효한 캐릭터만 필터링 (name이 있는 것만)
  const validParsedCharacters = parsed.characters.filter(
    (char): char is { name: string; description?: string } => 
      !!char && typeof char === 'object' && !!char.name && typeof char.name === 'string'
  );

  if (validParsedCharacters.length === 0) {
    console.error('[analyze-characters][POST] 유효한 캐릭터가 없음:', parsed);
    return NextResponse.json({ error: '분석된 캐릭터가 없습니다.' }, { status: 500 });
  }

  // 각 캐릭터에 대해 DB 조회하여 존재 여부 확인
  const charactersWithStatus = await Promise.all(
    validParsedCharacters.map(async (char) => {
      if (!char.name) return null;

      // 웹툰의 캐릭터 중 이름이 일치하는 것 찾기
      const { data: existingCharacters, error: charError } = await supabase
        .from('characters')
        .select('id, name, character_sheets(id, file_path, thumbnail_path)')
        .eq('webtoon_id', webtoonId)
        .ilike('name', char.name.trim());

      if (charError) {
        console.error(`[analyze-characters][POST] 캐릭터 조회 실패 (${char.name}):`, charError);
      }

      const existingCharacter = existingCharacters && existingCharacters.length > 0 ? existingCharacters[0] : null;

      // character_sheets가 배열인지 확인하고, 배열이 아니면 빈 배열로 처리
      let characterSheets: Array<{ id: string; file_path: string; thumbnail_path?: string | null }> = [];
      if (existingCharacter?.character_sheets) {
        if (Array.isArray(existingCharacter.character_sheets)) {
          characterSheets = existingCharacter.character_sheets;
        } else {
          // 배열이 아닌 경우 (단일 객체인 경우) 배열로 변환
          characterSheets = [existingCharacter.character_sheets];
        }
      }

      console.log(`[analyze-characters][POST] 캐릭터 매칭 결과 (${char.name}):`, {
        existsInDb: !!existingCharacter,
        characterId: existingCharacter?.id || null,
        characterSheetsCount: characterSheets.length,
        characterSheets: characterSheets,
      });

      return {
        name: char.name.trim(),
        description: char.description?.trim() || '',
        existsInDb: !!existingCharacter,
        characterId: existingCharacter?.id || null,
        characterSheets: characterSheets,
      };
    })
  );

  const validCharacters = charactersWithStatus.filter((char): char is NonNullable<typeof char> => char !== null);

  // 분석 결과를 DB에 저장
  const analysisData = {
    characters: validCharacters,
    webtoonId,
    analyzedAt: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from('episode_scripts')
    .update({ character_analysis: analysisData })
    .eq('id', scriptId);

  if (updateError) {
    console.error('[analyze-characters][POST] 분석 결과 저장 실패:', updateError);
    // 저장 실패해도 응답은 반환 (사용자는 결과를 볼 수 있음)
  }

  return NextResponse.json({
    characters: validCharacters,
    webtoonId,
  });
}

