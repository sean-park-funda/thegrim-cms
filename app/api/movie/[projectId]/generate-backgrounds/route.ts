import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// 배경 이미지 생성
async function generateBackgroundImage(
  imagePrompt: string,
  apiProvider: 'gemini' | 'seedream' = 'gemini',
  aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<{ base64: string; mimeType: string }> {
  const enhancedPrompt = `${imagePrompt}, wide angle shot, cinematic composition, detailed environment, no people, no characters`;

  // Seedream 사이즈 매핑
  const seedreamSize = aspectRatio === '9:16' ? '1080x1920' : '1920x1080';

  if (apiProvider === 'seedream') {
    return await generateSeedreamImage({
      provider: 'seedream',
      model: 'seedream-4-5-251128',
      prompt: enhancedPrompt,
      size: seedreamSize,
      responseFormat: 'url',
      watermark: true,
      timeoutMs: 120000,
      retries: 2,
    });
  }

  return await generateGeminiImage({
    provider: 'gemini',
    model: 'gemini-3-pro-image-preview',
    contents: [
      {
        role: 'user',
        parts: [{ text: enhancedPrompt }],
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

// 이미지를 Storage에 업로드
async function uploadBackgroundImage(
  projectId: string,
  backgroundId: string,
  base64: string,
  mimeType: string
): Promise<{ imagePath: string; storagePath: string }> {
  const extension = mimeType.includes('png') ? 'png' : 'jpg';
  const fileName = `backgrounds/${projectId}_${backgroundId}_${Date.now()}.${extension}`;
  const buffer = Buffer.from(base64, 'base64');

  const { error: uploadError } = await supabase.storage
    .from('movie-videos')
    .upload(fileName, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error('[generate-backgrounds] 이미지 업로드 실패:', uploadError);
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

  console.log('[generate-backgrounds] 요청 시작:', { projectId });

  try {
    const body = await request.json();
    const {
      apiProvider = 'gemini',
      aspectRatio = '16:9',
      backgroundIds, // 선택적: 특정 배경만 생성
    } = body;

    // 1. 배경 목록 가져오기
    let query = supabase
      .from('movie_backgrounds')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index');

    // 특정 배경만 생성하는 경우
    if (backgroundIds && Array.isArray(backgroundIds) && backgroundIds.length > 0) {
      query = query.in('id', backgroundIds);
    }

    const { data: backgrounds, error: bgError } = await query;

    if (bgError || !backgrounds || backgrounds.length === 0) {
      console.error('[generate-backgrounds] 배경 조회 실패:', bgError);
      return NextResponse.json(
        { error: '배경이 없습니다. 먼저 배경 분석을 실행해주세요.' },
        { status: 400 }
      );
    }

    console.log('[generate-backgrounds] 이미지 생성 시작:', backgrounds.length, '개');

    // 2. 배경 이미지 병렬 생성 (DB의 완전본 프롬프트를 그대로 사용)
    const imageGenerationPromises = backgrounds.map(async (bg) => {
      // 이미 이미지가 있으면 스킵 (재생성이 아닌 경우)
      if (bg.image_path && !backgroundIds) {
        return {
          success: true,
          backgroundId: bg.id,
          skipped: true,
        };
      }

      try {
        // DB에 저장된 완전본 프롬프트를 그대로 사용
        const imagePrompt = bg.image_prompt || bg.name;
        console.log(`[generate-backgrounds] 배경 생성: ${bg.name}`);
        console.log(`[generate-backgrounds] 전체 프롬프트:`, imagePrompt);

        const { base64, mimeType } = await generateBackgroundImage(imagePrompt, apiProvider, aspectRatio);
        const { imagePath, storagePath } = await uploadBackgroundImage(projectId, bg.id, base64, mimeType);

        // DB 업데이트
        await supabase
          .from('movie_backgrounds')
          .update({
            image_path: imagePath,
            storage_path: storagePath,
            updated_at: new Date().toISOString(),
          })
          .eq('id', bg.id);

        return {
          success: true,
          backgroundId: bg.id,
          name: bg.name,
          imagePath,
        };
      } catch (error) {
        console.error(`[generate-backgrounds] 배경 ${bg.name} 이미지 생성 실패:`, error);
        return {
          success: false,
          backgroundId: bg.id,
          name: bg.name,
          error: error instanceof Error ? error.message : '이미지 생성 실패',
        };
      }
    });

    const results = await Promise.all(imageGenerationPromises);

    // 3. 프로젝트 상태 업데이트
    const successCount = results.filter(r => r.success && !r.skipped).length;
    if (successCount > 0) {
      await supabase
        .from('movie_projects')
        .update({
          status: 'backgrounds_ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
    }

    // 4. 최신 배경 목록 조회
    const { data: updatedBackgrounds } = await supabase
      .from('movie_backgrounds')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index');

    const totalTime = Date.now() - startTime;
    console.log('[generate-backgrounds] 완료:', {
      totalTime: `${totalTime}ms`,
      total: backgrounds.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      skipped: results.filter(r => r.skipped).length,
    });

    return NextResponse.json({
      backgrounds: updatedBackgrounds,
      stats: {
        total: backgrounds.length,
        success: results.filter(r => r.success && !r.skipped).length,
        failed: results.filter(r => !r.success).length,
        skipped: results.filter(r => r.skipped).length,
        errors: results.filter(r => !r.success).map(r => ({
          name: r.name,
          error: r.error,
        })),
      },
    });
  } catch (error) {
    console.error('[generate-backgrounds] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '배경 이미지 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
