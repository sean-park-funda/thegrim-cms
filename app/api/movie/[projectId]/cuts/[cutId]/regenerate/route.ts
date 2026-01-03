import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateGeminiImage, generateSeedreamImage, GeminiContentPart } from '@/lib/image-generation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface ReferenceImage {
  base64: string;
  mimeType: string;
}

// 이미지 URL에서 base64로 다운로드
async function downloadImageAsBase64(imageUrl: string): Promise<ReferenceImage | null> {
  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    return { base64, mimeType };
  } catch (error) {
    console.warn('[cut-regenerate] 이미지 다운로드 실패:', imageUrl, error);
    return null;
  }
}

// 컷 이미지 재생성 (완전본 프롬프트를 그대로 사용)
async function generateCutImageDirect(
  imagePrompt: string,  // 이미 완전본 프롬프트
  apiProvider: 'gemini' | 'seedream' = 'gemini',
  aspectRatio: '16:9' | '9:16' = '16:9',
  referenceImages: ReferenceImage[] = []
): Promise<{ base64: string; mimeType: string }> {
  // 전체 프롬프트 로그 출력
  console.log('\n========== 🎬 CUT IMAGE REGENERATE PROMPT ==========');
  console.log(imagePrompt);
  console.log('=====================================================\n');

  // Seedream 사이즈 매핑
  const seedreamSize = aspectRatio === '9:16' ? '1080x1920' : '1920x1080';

  if (apiProvider === 'seedream') {
    // Seedream: images 배열에 레퍼런스 이미지 추가
    const seedreamImages: string[] = [];
    for (const refImg of referenceImages) {
      seedreamImages.push(`data:${refImg.mimeType};base64,${refImg.base64}`);
    }

    return await generateSeedreamImage({
      provider: 'seedream',
      model: 'seedream-4-5-251128',
      prompt: imagePrompt,
      size: seedreamSize,
      images: seedreamImages.length > 0 ? seedreamImages : undefined,
      responseFormat: 'url',
      watermark: true,
      timeoutMs: 120000,
      retries: 2,
    });
  }

  // Gemini: contents에 레퍼런스 이미지 포함
  const contentParts: GeminiContentPart[] = [{ text: imagePrompt }];

  // 레퍼런스 이미지 추가
  for (const refImg of referenceImages) {
    contentParts.push({
      inlineData: {
        mimeType: refImg.mimeType,
        data: refImg.base64,
      },
    });
  }

  return await generateGeminiImage({
    provider: 'gemini',
    model: 'gemini-3-pro-image-preview',
    contents: [
      {
        role: 'user',
        parts: contentParts,
      },
    ],
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        imageSize: '2K',
        aspectRatio: aspectRatio,
      },
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 32768,
    },
    timeoutMs: 120000,
    retries: 2,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; cutId: string }> }
) {
  const startTime = Date.now();
  const { projectId, cutId } = await params;

  console.log('[cut-regenerate] 요청 시작:', { projectId, cutId });

  try {
    const body = await request.json();
    const {
      imagePrompt,
      apiProvider = 'gemini',
      aspectRatio = '16:9',
    } = body;

    console.log('[cut-regenerate] 설정:', { apiProvider, aspectRatio });

    // 1. 컷 정보 가져오기
    const { data: cut, error: cutError } = await supabase
      .from('movie_cuts')
      .select('*')
      .eq('id', cutId)
      .eq('project_id', projectId)
      .single();

    if (cutError || !cut) {
      console.error('[cut-regenerate] 컷 조회 실패:', cutError);
      return NextResponse.json(
        { error: '컷을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // imagePrompt가 전달되면 사용, 아니면 기존 프롬프트 사용
    const finalPrompt = imagePrompt || cut.image_prompt;

    if (!finalPrompt) {
      return NextResponse.json(
        { error: '이미지 프롬프트가 없습니다.' },
        { status: 400 }
      );
    }

    // 2. 레퍼런스 이미지 수집 (캐릭터 + 배경)
    const referenceImages: ReferenceImage[] = [];

    // 2-1. 캐릭터 이미지 조회 (컷에 등장하는 캐릭터들)
    if (cut.characters && cut.characters.length > 0) {
      const { data: characters } = await supabase
        .from('movie_characters')
        .select('name, image_path')
        .eq('project_id', projectId)
        .in('name', cut.characters);

      if (characters) {
        console.log(`[cut-regenerate] 캐릭터 레퍼런스 ${characters.length}개 조회`);
        for (const char of characters) {
          if (char.image_path) {
            const refImg = await downloadImageAsBase64(char.image_path);
            if (refImg) {
              referenceImages.push(refImg);
              console.log(`[cut-regenerate] 캐릭터 이미지 추가: ${char.name}`);
            }
          }
        }
      }
    }

    // 2-2. 배경 이미지 조회
    if (cut.background_id) {
      const { data: background } = await supabase
        .from('movie_backgrounds')
        .select('name, image_path')
        .eq('id', cut.background_id)
        .single();

      if (background?.image_path) {
        const refImg = await downloadImageAsBase64(background.image_path);
        if (refImg) {
          referenceImages.push(refImg);
          console.log(`[cut-regenerate] 배경 이미지 추가: ${background.name}`);
        }
      }
    }

    console.log(`[cut-regenerate] 총 레퍼런스 이미지: ${referenceImages.length}개`);

    // 3. 이미지 생성 (완전본 프롬프트를 그대로 사용)
    console.log(`[cut-regenerate] 컷 ${cut.cut_index} 이미지 생성 시작...`);
    const { base64, mimeType } = await generateCutImageDirect(
      finalPrompt,
      apiProvider,
      aspectRatio,
      referenceImages
    );

    // 3. 기존 이미지 삭제 (있으면)
    if (cut.storage_path) {
      const { error: deleteError } = await supabase.storage
        .from('movie-videos')
        .remove([cut.storage_path]);

      if (deleteError) {
        console.warn('[cut-regenerate] 기존 이미지 삭제 실패 (무시):', deleteError);
      }
    }

    // 4. 새 이미지 업로드
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    const fileName = `cuts/${projectId}_cut${cut.cut_index}_${Date.now()}.${extension}`;

    const buffer = Buffer.from(base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('movie-videos')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[cut-regenerate] 이미지 업로드 실패:', uploadError);
      return NextResponse.json(
        { error: '이미지 업로드에 실패했습니다.' },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from('movie-videos')
      .getPublicUrl(fileName);

    // 5. DB 업데이트
    const { data: updatedCut, error: updateError } = await supabase
      .from('movie_cuts')
      .update({
        image_prompt: finalPrompt,
        image_path: publicUrlData.publicUrl,
        storage_path: fileName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cutId)
      .select('*')
      .single();

    if (updateError) {
      console.error('[cut-regenerate] DB 업데이트 실패:', updateError);
      return NextResponse.json(
        { error: '컷 업데이트에 실패했습니다.' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[cut-regenerate] 완료:', {
      totalTime: `${totalTime}ms`,
      cutId,
      cutIndex: cut.cut_index,
    });

    return NextResponse.json({
      cut: updatedCut,
    });
  } catch (error) {
    console.error('[cut-regenerate] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '이미지 재생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
