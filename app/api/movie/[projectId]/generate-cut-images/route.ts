import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateGeminiImage, generateSeedreamImage, GeminiContentPart } from '@/lib/image-generation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface Cut {
  id: string;
  cut_index: number;
  camera_shot: string | null;
  camera_angle: string | null;
  camera_composition: string | null;
  image_prompt: string;
  characters: string[];
  background_id: string | null;
  background_name: string | null;
  image_path: string | null;
}

interface Character {
  id: string;
  name: string;
  image_path: string | null;
}

interface Background {
  id: string;
  name: string;
  image_path: string | null;
}

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
    console.warn('[generate-cut-images] 이미지 다운로드 실패:', imageUrl, error);
    return null;
  }
}

// 컷 이미지 생성 (완전본 프롬프트를 그대로 사용)
async function generateCutImageDirect(
  imagePrompt: string,  // 이미 완전본 프롬프트
  apiProvider: 'gemini' | 'seedream' = 'gemini',
  aspectRatio: '16:9' | '9:16' = '16:9',
  referenceImages: ReferenceImage[] = []
): Promise<{ base64: string; mimeType: string }> {
  // 전체 프롬프트 로그 출력
  console.log('\n========== 🎬 CUT IMAGE GENERATION PROMPT ==========');
  console.log(imagePrompt);
  console.log('====================================================\n');

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

// 이미지 업로드
async function uploadCutImage(
  projectId: string,
  cutId: string,
  cutIndex: number,
  base64: string,
  mimeType: string
): Promise<{ imagePath: string; storagePath: string }> {
  const extension = mimeType.includes('png') ? 'png' : 'jpg';
  const fileName = `cuts/${projectId}_cut${cutIndex}_${Date.now()}.${extension}`;

  const buffer = Buffer.from(base64, 'base64');

  const { error: uploadError } = await supabase.storage
    .from('movie-videos')
    .upload(fileName, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error('[generate-cut-images] 이미지 업로드 실패:', uploadError);
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage
    .from('movie-videos')
    .getPublicUrl(fileName);

  return {
    imagePath: publicUrlData.publicUrl,
    storagePath: fileName,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const startTime = Date.now();
  const { projectId } = await params;

  console.log('[generate-cut-images] 요청 시작:', { projectId });

  try {
    const body = await request.json();
    const {
      apiProvider = 'gemini',
      aspectRatio = '16:9',
      cutIds, // 선택적: 특정 컷만 생성
      mode = 'all', // 'all' = 전체, 'missing' = 이미지 없는 것만
    } = body;

    console.log('[generate-cut-images] 설정:', { apiProvider, aspectRatio, cutIds: cutIds?.length || 'all', mode });

    // 1. 컷 목록 가져오기
    let query = supabase
      .from('movie_cuts')
      .select('*')
      .eq('project_id', projectId)
      .order('cut_index');

    // 특정 컷만 생성하는 경우
    if (cutIds && Array.isArray(cutIds) && cutIds.length > 0) {
      query = query.in('id', cutIds);
    }

    // 이미지 없는 컷만 생성하는 경우
    if (mode === 'missing') {
      query = query.is('image_path', null);
    }

    const { data: cuts, error: cutsError } = await query;

    if (cutsError) {
      console.error('[generate-cut-images] 컷 조회 실패:', cutsError);
      return NextResponse.json(
        { error: '컷 조회에 실패했습니다.' },
        { status: 500 }
      );
    }

    if (!cuts || cuts.length === 0) {
      if (mode === 'missing') {
        return NextResponse.json(
          { error: '이미지가 없는 컷이 없습니다. 모든 컷에 이미지가 있습니다.' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: '컷이 없습니다. 먼저 컷 분할을 실행해주세요.' },
        { status: 400 }
      );
    }

    console.log(`[generate-cut-images] 생성할 컷 수: ${cuts.length}개 (mode: ${mode})`);

    // 2. 캐릭터 정보 가져오기 (레퍼런스용)
    const { data: characters } = await supabase
      .from('movie_characters')
      .select('id, name, image_path')
      .eq('project_id', projectId);

    // 3. 배경 정보 가져오기 (레퍼런스용)
    const { data: backgrounds } = await supabase
      .from('movie_backgrounds')
      .select('id, name, image_path')
      .eq('project_id', projectId);

    const characterMap = new Map<string, Character>();
    characters?.forEach(c => characterMap.set(c.name, c));

    const backgroundMap = new Map<string, Background>();
    backgrounds?.forEach(b => {
      backgroundMap.set(b.id, b);
      backgroundMap.set(b.name, b);
    });

    // 4. 캐릭터/배경 이미지 사전 다운로드 (캐싱)
    const imageCache = new Map<string, ReferenceImage>();

    // 캐릭터 이미지 다운로드
    const characterDownloadPromises = (characters || [])
      .filter(c => c.image_path)
      .map(async (c) => {
        const refImg = await downloadImageAsBase64(c.image_path!);
        if (refImg) {
          imageCache.set(`char:${c.name}`, refImg);
        }
      });

    // 배경 이미지 다운로드
    const backgroundDownloadPromises = (backgrounds || [])
      .filter(b => b.image_path)
      .map(async (b) => {
        const refImg = await downloadImageAsBase64(b.image_path!);
        if (refImg) {
          imageCache.set(`bg:${b.id}`, refImg);
        }
      });

    await Promise.all([...characterDownloadPromises, ...backgroundDownloadPromises]);
    console.log(`[generate-cut-images] 레퍼런스 이미지 캐시 완료: ${imageCache.size}개`);

    console.log('[generate-cut-images] 이미지 생성 시작:', cuts.length, '개');

    // 5. 컷 이미지 병렬 생성
    const imageGenerationPromises = cuts.map(async (cut: Cut) => {
      // 이미 이미지가 있으면 스킵 (재생성이 아닌 경우)
      if (cut.image_path && !cutIds) {
        return {
          success: true,
          cutId: cut.id,
          cutIndex: cut.cut_index,
          skipped: true,
        };
      }

      if (!cut.image_prompt) {
        return {
          success: false,
          cutId: cut.id,
          cutIndex: cut.cut_index,
          error: '이미지 프롬프트가 없습니다.',
        };
      }

      try {
        // 해당 컷의 레퍼런스 이미지 수집
        const referenceImages: ReferenceImage[] = [];

        // 캐릭터 이미지 추가
        if (cut.characters && cut.characters.length > 0) {
          for (const charName of cut.characters) {
            const cached = imageCache.get(`char:${charName}`);
            if (cached) {
              referenceImages.push(cached);
            }
          }
        }

        // 배경 이미지 추가
        if (cut.background_id) {
          const cached = imageCache.get(`bg:${cut.background_id}`);
          if (cached) {
            referenceImages.push(cached);
          }
        }

        console.log(`[generate-cut-images] 컷 ${cut.cut_index} 이미지 생성 시작 (레퍼런스: ${referenceImages.length}개)`);

        // 완전본 프롬프트를 그대로 사용
        const { base64, mimeType } = await generateCutImageDirect(
          cut.image_prompt,
          apiProvider,
          aspectRatio,
          referenceImages
        );
        const { imagePath, storagePath } = await uploadCutImage(
          projectId,
          cut.id,
          cut.cut_index,
          base64,
          mimeType
        );

        // DB 업데이트
        await supabase
          .from('movie_cuts')
          .update({
            image_path: imagePath,
            storage_path: storagePath,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cut.id);

        console.log(`[generate-cut-images] 컷 ${cut.cut_index} 이미지 생성 완료`);

        return {
          success: true,
          cutId: cut.id,
          cutIndex: cut.cut_index,
          imagePath,
        };
      } catch (error) {
        console.error(`[generate-cut-images] 컷 ${cut.cut_index} 이미지 생성 실패:`, error);
        return {
          success: false,
          cutId: cut.id,
          cutIndex: cut.cut_index,
          error: error instanceof Error ? error.message : '이미지 생성 실패',
        };
      }
    });

    const results = await Promise.all(imageGenerationPromises);

    // 5. 프로젝트 상태 업데이트
    const successCount = results.filter(r => r.success && !r.skipped).length;
    if (successCount > 0) {
      await supabase
        .from('movie_projects')
        .update({
          status: 'cuts_images_ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
    }

    // 6. 최신 컷 목록 조회
    const { data: updatedCuts } = await supabase
      .from('movie_cuts')
      .select('*')
      .eq('project_id', projectId)
      .order('cut_index');

    const totalTime = Date.now() - startTime;
    console.log('[generate-cut-images] 완료:', {
      totalTime: `${totalTime}ms`,
      total: cuts.length,
      success: results.filter(r => r.success && !r.skipped).length,
      failed: results.filter(r => !r.success).length,
      skipped: results.filter(r => r.skipped).length,
    });

    return NextResponse.json({
      cuts: updatedCuts,
      stats: {
        total: cuts.length,
        success: results.filter(r => r.success && !r.skipped).length,
        failed: results.filter(r => !r.success).length,
        skipped: results.filter(r => r.skipped).length,
        errors: results.filter(r => !r.success).map(r => ({
          cutIndex: r.cutIndex,
          error: r.error,
        })),
      },
    });
  } catch (error) {
    console.error('[generate-cut-images] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '컷 이미지 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
