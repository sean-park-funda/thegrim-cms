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
  console.log('\n========== 🎭 CHARACTER IMAGE GENERATION PROMPT ==========');
  console.log(imagePrompt);
  console.log('===========================================================\n');

  if (apiProvider === 'seedream') {
    return await generateSeedreamImage({
      provider: 'seedream',
      model: 'seedream-4-5-251128',
      prompt: imagePrompt,
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
        parts: [{ text: imagePrompt }],
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

// 이미지를 Storage에 업로드
async function uploadCharacterImage(
  projectId: string,
  characterId: string,
  base64: string,
  mimeType: string
): Promise<{ imagePath: string; storagePath: string }> {
  const extension = mimeType.includes('png') ? 'png' : 'jpg';
  const fileName = `characters/${projectId}_${characterId}_${Date.now()}.${extension}`;

  const buffer = Buffer.from(base64, 'base64');

  const { error: uploadError } = await supabase.storage
    .from('movie-videos')
    .upload(fileName, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error('[generate-characters] 이미지 업로드 실패:', uploadError);
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

  console.log('[generate-characters] 요청 시작:', { projectId });

  try {
    const body = await request.json();
    const {
      apiProvider = 'gemini',
      characterIds, // 선택적: 특정 캐릭터만 생성
    } = body;

    // 1. 캐릭터 목록 가져오기
    let query = supabase
      .from('movie_characters')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at');

    // 특정 캐릭터만 생성하는 경우
    if (characterIds && Array.isArray(characterIds) && characterIds.length > 0) {
      query = query.in('id', characterIds);
    }

    const { data: characters, error: charError } = await query;

    if (charError || !characters || characters.length === 0) {
      console.error('[generate-characters] 캐릭터 조회 실패:', charError);
      return NextResponse.json(
        { error: '캐릭터가 없습니다. 먼저 캐릭터 분석을 실행해주세요.' },
        { status: 400 }
      );
    }

    console.log('[generate-characters] 이미지 생성 시작:', characters.length, '개');

    // 2. 캐릭터 이미지 생성 (DB의 완전본 프롬프트를 그대로 사용)
    const results = [];

    for (const char of characters) {
      // 이미 이미지가 있으면 스킵 (재생성이 아닌 경우)
      if (char.image_path && !characterIds) {
        results.push({
          success: true,
          characterId: char.id,
          skipped: true,
        });
        continue;
      }

      try {
        // DB에 저장된 완전본 프롬프트를 그대로 사용
        const imagePrompt = char.image_prompt || char.name;
        console.log(`[generate-characters] 캐릭터 생성: ${char.name}`);

        const { base64, mimeType } = await generateCharacterImage(imagePrompt, apiProvider);
        const { imagePath, storagePath } = await uploadCharacterImage(projectId, char.id, base64, mimeType);

        // DB 업데이트
        await supabase
          .from('movie_characters')
          .update({
            image_path: imagePath,
            storage_path: storagePath,
            updated_at: new Date().toISOString(),
          })
          .eq('id', char.id);

        results.push({
          success: true,
          characterId: char.id,
          name: char.name,
          imagePath,
        });
      } catch (error) {
        console.error(`[generate-characters] 캐릭터 ${char.name} 이미지 생성 실패:`, error);
        results.push({
          success: false,
          characterId: char.id,
          name: char.name,
          error: error instanceof Error ? error.message : '이미지 생성 실패',
        });
      }
    }

    // 3. 프로젝트 상태 업데이트
    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
      await supabase
        .from('movie_projects')
        .update({ status: 'characters_ready', updated_at: new Date().toISOString() })
        .eq('id', projectId);
    }

    // 4. 최신 캐릭터 목록 반환
    const { data: updatedCharacters } = await supabase
      .from('movie_characters')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at');

    const totalTime = Date.now() - startTime;
    console.log('[generate-characters] 완료:', {
      totalTime: `${totalTime}ms`,
      total: characters.length,
      success: successCount,
      failed: results.filter(r => !r.success).length,
      skipped: results.filter(r => r.skipped).length,
    });

    return NextResponse.json({
      characters: updatedCharacters,
      stats: {
        total: characters.length,
        success: successCount,
        failed: results.filter(r => !r.success).length,
        skipped: results.filter(r => r.skipped).length,
        errors: results.filter(r => !r.success && r.error).map(r => ({
          name: r.name,
          error: r.error,
        })),
      },
    });
  } catch (error) {
    console.error('[generate-characters] 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '캐릭터 이미지 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
