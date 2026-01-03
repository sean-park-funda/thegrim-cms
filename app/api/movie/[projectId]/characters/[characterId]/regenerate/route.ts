import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// 단일 캐릭터 이미지 생성
async function generateCharacterImage(
  imagePrompt: string,
  apiProvider: 'gemini' | 'seedream' = 'gemini'
): Promise<{ base64: string; mimeType: string }> {
  const enhancedPrompt = `${imagePrompt}`;

  if (apiProvider === 'seedream') {
    return await generateSeedreamImage({
      provider: 'seedream',
      model: 'seedream-4-5-251128',
      prompt: enhancedPrompt,
      size: '1024x1024',
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
        aspectRatio: '1:1',
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
  { params }: { params: Promise<{ projectId: string; characterId: string }> }
) {
  const startTime = Date.now();
  const { projectId, characterId } = await params;

  console.log('[character-regenerate] 요청 시작:', { projectId, characterId });

  try {
    const body = await request.json();
    const {
      imagePrompt,
      apiProvider = 'gemini',
    } = body;

    // 1. 캐릭터 정보 가져오기
    const { data: character, error: charError } = await supabase
      .from('movie_characters')
      .select('*')
      .eq('id', characterId)
      .eq('project_id', projectId)
      .single();

    if (charError || !character) {
      console.error('[character-regenerate] 캐릭터 조회 실패:', charError);
      return NextResponse.json(
        { error: '캐릭터를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // imagePrompt가 전달되면 사용, 아니면 기존 프롬프트 사용
    // 재생성 시에는 이미 스타일이 포함된 완전본 프롬프트가 전달되므로 그대로 사용
    const finalPrompt = imagePrompt || character.image_prompt;

    if (!finalPrompt) {
      return NextResponse.json(
        { error: '이미지 프롬프트가 없습니다.' },
        { status: 400 }
      );
    }

    console.log('[character-regenerate] 프롬프트:', finalPrompt);

    // 2. 이미지 생성
    console.log('[character-regenerate] 이미지 생성 시작...');
    const { base64, mimeType } = await generateCharacterImage(finalPrompt, apiProvider);

    // 3. 기존 이미지 삭제 (있으면)
    if (character.storage_path) {
      const { error: deleteError } = await supabase.storage
        .from('movie-videos')
        .remove([character.storage_path]);

      if (deleteError) {
        console.warn('[character-regenerate] 기존 이미지 삭제 실패 (무시):', deleteError);
      }
    }

    // 4. 새 이미지 업로드
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    // 파일 이름에 한글을 사용하지 않음 (Supabase Storage 제한)
    const fileName = `characters/${projectId}_${characterId}_${Date.now()}.${extension}`;

    const buffer = Buffer.from(base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('movie-videos')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[character-regenerate] 이미지 업로드 실패:', uploadError);
      return NextResponse.json(
        { error: '이미지 업로드에 실패했습니다.' },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from('movie-videos')
      .getPublicUrl(fileName);

    // 5. DB 업데이트
    const { data: updatedCharacter, error: updateError } = await supabase
      .from('movie_characters')
      .update({
        image_prompt: finalPrompt,
        image_path: publicUrlData.publicUrl,
        storage_path: fileName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', characterId)
      .select()
      .single();

    if (updateError) {
      console.error('[character-regenerate] DB 업데이트 실패:', updateError);
      return NextResponse.json(
        { error: '캐릭터 업데이트에 실패했습니다.' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[character-regenerate] 완료:', {
      totalTime: `${totalTime}ms`,
      characterId,
      name: character.name,
    });

    return NextResponse.json({
      character: updatedCharacter,
    });
  } catch (error) {
    console.error('[character-regenerate] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '이미지 재생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
