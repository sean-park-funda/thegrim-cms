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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; backgroundId: string }> }
) {
  const startTime = Date.now();
  const { projectId, backgroundId } = await params;

  console.log('[background-regenerate] 요청 시작:', { projectId, backgroundId });

  try {
    const body = await request.json();
    const {
      imagePrompt,
      apiProvider = 'gemini',
      aspectRatio = '16:9',
    } = body;

    // 1. 배경 정보 가져오기
    const { data: background, error: bgError } = await supabase
      .from('movie_backgrounds')
      .select('*')
      .eq('id', backgroundId)
      .eq('project_id', projectId)
      .single();

    if (bgError || !background) {
      console.error('[background-regenerate] 배경 조회 실패:', bgError);
      return NextResponse.json(
        { error: '배경을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // imagePrompt가 전달되면 사용, 아니면 기존 프롬프트 사용
    // 재생성 시에는 이미 스타일이 포함된 완전본 프롬프트가 전달되므로 그대로 사용
    const finalPrompt = imagePrompt || background.image_prompt;

    if (!finalPrompt) {
      return NextResponse.json(
        { error: '이미지 프롬프트가 없습니다.' },
        { status: 400 }
      );
    }

    console.log('[background-regenerate] 프롬프트:', finalPrompt);

    // 2. 이미지 생성
    console.log('[background-regenerate] 이미지 생성 시작...');
    const { base64, mimeType } = await generateBackgroundImage(finalPrompt, apiProvider, aspectRatio);

    // 3. 기존 이미지 삭제 (있으면)
    if (background.storage_path) {
      const { error: deleteError } = await supabase.storage
        .from('movie-videos')
        .remove([background.storage_path]);

      if (deleteError) {
        console.warn('[background-regenerate] 기존 이미지 삭제 실패 (무시):', deleteError);
      }
    }

    // 4. 새 이미지 업로드
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
      console.error('[background-regenerate] 이미지 업로드 실패:', uploadError);
      return NextResponse.json(
        { error: '이미지 업로드에 실패했습니다.' },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from('movie-videos')
      .getPublicUrl(fileName);

    // 5. DB 업데이트
    const { data: updatedBackground, error: updateError } = await supabase
      .from('movie_backgrounds')
      .update({
        image_prompt: finalPrompt,
        image_path: publicUrlData.publicUrl,
        storage_path: fileName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', backgroundId)
      .select()
      .single();

    if (updateError) {
      console.error('[background-regenerate] DB 업데이트 실패:', updateError);
      return NextResponse.json(
        { error: '배경 업데이트에 실패했습니다.' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[background-regenerate] 완료:', {
      totalTime: `${totalTime}ms`,
      backgroundId,
      name: background.name,
    });

    return NextResponse.json({
      background: updatedBackground,
    });
  } catch (error) {
    console.error('[background-regenerate] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '이미지 재생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
