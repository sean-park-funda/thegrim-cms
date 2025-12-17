import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import crypto from 'crypto';
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';
import { supabase, ApiProvider } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY;
const GEMINI_API_TIMEOUT = 120000; // 120초 (이미지 생성이 더 오래 걸릴 수 있음)
const SEEDREAM_API_TIMEOUT = 60000; // 60초

interface GenerateMonsterImageRequest {
  prompt: string;
  aspectRatio?: string;
  cutId: string; // 컷 ID (필수)
  userId?: string; // 사용자 ID (선택적)
  apiProvider?: ApiProvider; // API 제공자 (gemini, seedream, auto)
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[괴수 이미지 생성] 요청 시작');

  try {
    const body: GenerateMonsterImageRequest = await request.json();
    const { prompt, aspectRatio, cutId, userId, apiProvider = 'auto' } = body;

    if (!prompt || !prompt.trim()) {
      console.error('[괴수 이미지 생성] 프롬프트가 없음');
      return NextResponse.json(
        { error: '프롬프트가 필요합니다.' },
        { status: 400 }
      );
    }

    // API 제공자 결정 (auto면 gemini 사용)
    const useSeedream = apiProvider === 'seedream';
    const providerName = useSeedream ? 'Seedream' : 'Gemini';

    // API 키 확인
    if (useSeedream && !SEEDREAM_API_KEY) {
      console.error('[괴수 이미지 생성] SEEDREAM_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'SEEDREAM_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    if (!useSeedream && !GEMINI_API_KEY) {
      console.error('[괴수 이미지 생성] GEMINI_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    console.log(`[괴수 이미지 생성] ${providerName} API 호출 시작...`);
    const apiRequestStart = Date.now();

    let generatedImageData: string;
    let generatedImageMimeType: string;

    if (useSeedream) {
      // Seedream API 사용 (최소 3686400 픽셀 충족)
      // 1:1 -> 1920x1920 (3,686,400 픽셀)
      // 16:9 -> 2560x1440 (3,686,400 픽셀)
      // 9:16 -> 1440x2560 (3,686,400 픽셀)
      const seedreamSize = aspectRatio === '16:9' ? '2560x1440' 
        : aspectRatio === '9:16' ? '1440x2560' 
        : '1920x1920';
      const result = await generateSeedreamImage({
        provider: 'seedream',
        model: 'seedream-4-5-251128',
        prompt: prompt.trim(),
        size: seedreamSize,
        responseFormat: 'url',
        watermark: true,
        timeoutMs: SEEDREAM_API_TIMEOUT,
        retries: 3,
      });
      generatedImageData = result.base64;
      generatedImageMimeType = result.mimeType;
    } else {
      // Gemini API 사용
      const result = await generateGeminiImage({
        provider: 'gemini',
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt.trim() }],
          },
        ],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            imageSize: '1K',
            ...(aspectRatio ? { aspectRatio } : {}),
          },
          temperature: 1.0,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 32768,
        },
        timeoutMs: GEMINI_API_TIMEOUT,
        retries: 3,
      });
      generatedImageData = result.base64;
      generatedImageMimeType = result.mimeType;
    }

    const apiRequestTime = Date.now() - apiRequestStart;
    console.log(`[괴수 이미지 생성] ${providerName} API 응답:`, {
      requestTime: `${apiRequestTime}ms`,
      hasImageData: !!generatedImageData,
      mimeType: generatedImageMimeType,
    });

    if (!generatedImageData) {
      console.error('[괴수 이미지 생성] 생성된 이미지 데이터가 없음');
      return NextResponse.json(
        { error: '이미지 생성에 실패했습니다. 다시 시도해주세요.' },
        { status: 500 }
      );
    }

    if (!cutId) {
      console.error('[괴수 이미지 생성] cutId가 없음');
      return NextResponse.json(
        { error: 'cutId가 필요합니다.' },
        { status: 400 }
      );
    }

    // base64 데이터를 Buffer로 변환
    const imageBuffer = Buffer.from(generatedImageData, 'base64');
    
    // 임시 파일 저장 (is_temp = true)
    const extension = generatedImageMimeType === 'image/png' ? '.png' : '.jpg';
    const uuid = crypto.randomUUID().substring(0, 8);
    const fileName = `monster-${uuid}${extension}`;
    
    // 컷의 첫 번째 공정 ID를 가져오기 (임시로 사용)
    const { data: cutData } = await supabase
      .from('cuts')
      .select('episode_id')
      .eq('id', cutId)
      .single();
    
    if (!cutData) {
      console.error('[괴수 이미지 생성] 컷 정보를 찾을 수 없음');
      return NextResponse.json(
        { error: '컷 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 에피소드의 첫 번째 공정 ID 가져오기
    const { data: processes } = await supabase
      .from('processes')
      .select('id')
      .order('order_index', { ascending: true })
      .limit(1)
      .single();

    const processId = processes?.id || null;
    
    if (!processId) {
      console.error('[괴수 이미지 생성] 공정을 찾을 수 없음');
      return NextResponse.json(
        { error: '공정을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const storagePath = `${cutId}/${processId}/${fileName}`;
    
    console.log('[괴수 이미지 생성] 임시 파일 저장 시작:', storagePath);
    const { error: uploadError } = await supabase.storage
      .from('webtoon-files')
      .upload(storagePath, imageBuffer, {
        contentType: generatedImageMimeType || 'image/png',
        upsert: false,
      });

    if (uploadError) {
      console.error('[괴수 이미지 생성] 임시 파일 저장 실패:', uploadError);
      // 저장 실패 시 기존 방식으로 fallback (base64 반환)
      return NextResponse.json({
        imageData: generatedImageData,
        mimeType: generatedImageMimeType || 'image/png',
        fileId: null,
        fileUrl: null,
      });
    }

    // 파일 URL 생성
    const { data: urlData } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(storagePath);
    const fileUrl = urlData.publicUrl;

    // 이미지 메타데이터 추출
    let imageWidth: number | undefined;
    let imageHeight: number | undefined;
    try {
      const metadata = await sharp(imageBuffer).metadata();
      imageWidth = metadata.width;
      imageHeight = metadata.height;
    } catch (error) {
      console.warn('[괴수 이미지 생성] 메타데이터 추출 실패:', error);
    }

    // DB에 임시 파일 정보 저장 (is_temp = true)
    const { data: fileData, error: dbError } = await supabase
      .from('files')
      .insert({
        cut_id: cutId,
        process_id: processId,
        file_name: fileName,
        file_path: fileUrl,
        storage_path: storagePath,
        file_size: imageBuffer.length,
        file_type: 'image',
        mime_type: generatedImageMimeType || 'image/png',
        description: '괴수 생성기로 생성된 이미지',
        prompt: prompt,
        created_by: userId || null,
        is_temp: true,
        metadata: {
          width: imageWidth,
          height: imageHeight,
        },
      })
      .select()
      .single();

    if (dbError || !fileData) {
      console.error('[괴수 이미지 생성] DB 저장 실패:', dbError);
      // Storage 파일은 삭제
      await supabase.storage.from('webtoon-files').remove([storagePath]);
      // 저장 실패 시 기존 방식으로 fallback (base64 반환)
      return NextResponse.json({
        imageData: generatedImageData,
        mimeType: generatedImageMimeType || 'image/png',
        fileId: null,
        fileUrl: null,
      });
    }

    console.log('[괴수 이미지 생성] 임시 파일 저장 완료:', {
      fileId: fileData.id,
      storagePath,
      fileUrl,
      size: imageBuffer.length,
    });

    const totalTime = Date.now() - startTime;
    console.log('[괴수 이미지 생성] 생성 완료:', {
      totalTime: `${totalTime}ms`,
      mimeType: generatedImageMimeType,
      fileId: fileData.id,
    });

    return NextResponse.json({
      fileId: fileData.id,
      fileUrl: fileUrl,
      imageData: generatedImageData, // 하위 호환성을 위해 유지
      mimeType: generatedImageMimeType || 'image/png',
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[괴수 이미지 생성] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`,
    });
    const errorMessage = error instanceof Error ? error.message : '이미지 생성 중 오류가 발생했습니다.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

