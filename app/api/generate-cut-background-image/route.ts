import { NextRequest, NextResponse } from 'next/server';
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';
import { supabase } from '@/lib/supabase';

const GEMINI_API_TIMEOUT = 60000;
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY;
const SEEDREAM_API_BASE_URL = process.env.SEEDREAM_API_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';
const SEEDREAM_API_ENDPOINT = `${SEEDREAM_API_BASE_URL}/images/generations`;
const SEEDREAM_API_TIMEOUT = 120000;

interface RelatedBackground {
  cutNumber: number;
  background: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    storyboardId?: string;
    cutIndex?: number;
    background?: string;
    relatedBackgrounds?: RelatedBackground[];
    apiProvider?: 'gemini' | 'seedream' | 'auto';
  } | null;

  if (!body?.storyboardId || typeof body.cutIndex !== 'number' || !body.background) {
    return NextResponse.json(
      { error: 'storyboardId, cutIndex, background가 필요합니다.' },
      { status: 400 }
    );
  }

  const { storyboardId, cutIndex, background, relatedBackgrounds = [], apiProvider = 'auto' } = body;

  try {
    // 관련배경 중 이미지가 생성된 컷 최대 2개 조회
    const relatedBackgroundImages: Array<{ base64: string; mimeType: string; cutNumber: number }> = [];

    if (relatedBackgrounds.length > 0) {
      // 관련배경 컷들의 인덱스 찾기
      const { data: storyboard } = await supabase
        .from('episode_script_storyboards')
        .select('response_json')
        .eq('id', storyboardId)
        .single();

      if (storyboard) {
        const responseJson = storyboard.response_json as { cuts?: Array<{ cutNumber?: number }> } | null;
        const cuts = responseJson?.cuts || [];

        // 관련배경 컷 번호로 인덱스 찾기
        const relatedCutIndices: number[] = [];
        for (const relatedBg of relatedBackgrounds) {
          const cutIndex = cuts.findIndex(cut => cut.cutNumber === relatedBg.cutNumber);
          if (cutIndex !== -1) {
            relatedCutIndices.push(cutIndex);
          }
        }

        // 배경 이미지 조회 (image_type: 'background')
        if (relatedCutIndices.length > 0) {
          const { data: bgImages } = await supabase
            .from('episode_script_storyboard_images')
            .select('cut_index, mime_type, image_base64')
            .eq('storyboard_id', storyboardId)
            .eq('image_type', 'background')
            .in('cut_index', relatedCutIndices.slice(0, 2)) // 최대 2개
            .order('cut_index', { ascending: true });

          if (bgImages && bgImages.length > 0) {
            for (const img of bgImages) {
              const cut = cuts[img.cut_index];
              const cutNumber = cut?.cutNumber ?? img.cut_index + 1;
              relatedBackgroundImages.push({
                base64: img.image_base64,
                mimeType: img.mime_type || 'image/png',
                cutNumber,
              });
            }
          }
        }
      }
    }

    // 이미지 생성 프롬프트 구성 (콘티 스타일과 동일하게 흑백 스케치)
    const prompt = `웹툰 배경 이미지를 생성하세요.
- 흑백 스케치 스타일, 잉크 느낌
- 과도한 채색 없이 라인 드로잉 강조
- 배경 설명에 맞는 상세하고 일관성 있는 배경을 그려주세요.
- 배경의 장소, 시간대, 분위기, 주요 요소를 정확히 반영하세요.
${relatedBackgroundImages.length > 0
  ? '- 아래 제공된 관련 배경 이미지들을 참고하여 배경의 일관성을 유지하세요. 같은 장소나 지역이라면 스타일과 분위기를 일치시켜주세요.'
  : ''}

배경 설명:
${background}`;

    const saveAndRespond = async (base64: string, mimeType: string) => {
      const safeMime = mimeType || 'image/png';

      // 기존 배경 이미지 삭제 (같은 storyboard_id, cut_index, image_type: 'background')
      const { error: deleteError } = await supabase
        .from('episode_script_storyboard_images')
        .delete()
        .eq('storyboard_id', storyboardId)
        .eq('cut_index', cutIndex)
        .eq('image_type', 'background');

      if (deleteError) {
        console.warn('[generate-cut-background-image] 기존 배경 이미지 삭제 실패 (무시):', deleteError);
      }

      // 새 배경 이미지 저장
      const { error: insertError } = await supabase
        .from('episode_script_storyboard_images')
        .insert({
          storyboard_id: storyboardId,
          cut_index: cutIndex,
          mime_type: safeMime,
          image_base64: base64,
          image_type: 'background',
        });

      if (insertError) {
        console.error('[generate-cut-background-image] DB 저장 실패:', insertError);
        return NextResponse.json({ error: '배경 이미지 저장에 실패했습니다.' }, { status: 500 });
      }

      const dataUrl = `data:${safeMime};base64,${base64}`;
      console.log('[generate-cut-background-image] 생성 및 저장 완료', { storyboardId, cutIndex });
      return NextResponse.json({ imageUrl: dataUrl, mimeType: safeMime });
    };

    // API Provider 결정
    const finalProvider = apiProvider === 'auto' ? 'gemini' : apiProvider;

    if (finalProvider === 'gemini') {
      // Gemini 이미지 생성
      const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: prompt },
      ];

      // 관련배경 이미지 추가
      for (const relatedImg of relatedBackgroundImages) {
        contentParts.push({
          text: `\n[관련 배경 레퍼런스 이미지: 컷 ${relatedImg.cutNumber}]\n이 이미지는 이전 컷의 배경입니다. 배경의 일관성을 유지하기 위해 참고하세요.`,
        });
        contentParts.push({
          inlineData: {
            mimeType: relatedImg.mimeType,
            data: relatedImg.base64,
          },
        });
      }

      const contents = [
        {
          role: 'user' as const,
          parts: contentParts,
        },
      ];

      try {
        const { base64, mimeType } = await generateGeminiImage({
          provider: 'gemini',
          model: 'gemini-3-pro-image-preview',
          contents,
          config: {
            responseModalities: ['IMAGE'],
            imageConfig: { imageSize: '1K' },
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 32768,
          },
          timeoutMs: GEMINI_API_TIMEOUT,
          retries: 1,
        });

        return await saveAndRespond(base64, mimeType);
      } catch (error) {
        const geminiErrorMessage = error instanceof Error ? error.message : 'Gemini 이미지 생성 실패';
        console.error('[generate-cut-background-image] Gemini 이미지 생성 실패', { reason: geminiErrorMessage });
        return NextResponse.json({ error: '배경 이미지 생성에 실패했습니다.' }, { status: 500 });
      }
    }

    // Seedream 분기
    if (!SEEDREAM_API_KEY) {
      console.error('[generate-cut-background-image] SEEDREAM_API_KEY가 설정되지 않았습니다.');
      return NextResponse.json({ error: '배경 이미지 생성에 실패했습니다.' }, { status: 500 });
    }

    const seedreamImages = relatedBackgroundImages.map(
      (img) => `data:${img.mimeType};base64,${img.base64}`
    );

    try {
      console.log('[generate-cut-background-image] Seedream API 호출 시작...', { model: 'seedream-4-5-251128' });
      const { base64, mimeType } = await generateSeedreamImage({
        provider: 'seedream',
        model: 'seedream-4-5-251128',
        prompt,
        images: seedreamImages,
        responseFormat: 'url',
        size: '2048x2048',
        stream: false,
        watermark: true,
        timeoutMs: SEEDREAM_API_TIMEOUT,
        retries: 1,
      });

      return await saveAndRespond(base64, mimeType);
    } catch (error) {
      console.error('[generate-cut-background-image] Seedream 이미지 생성 실패:', error);
      return NextResponse.json({ error: '배경 이미지 생성에 실패했습니다.' }, { status: 500 });
    }
  } catch (error) {
    console.error('[generate-cut-background-image] 예상치 못한 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '배경 이미지 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
