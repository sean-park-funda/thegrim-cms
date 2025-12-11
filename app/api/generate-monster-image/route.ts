import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 120000; // 120초 (이미지 생성이 더 오래 걸릴 수 있음)

interface GenerateMonsterImageRequest {
  prompt: string;
  aspectRatio?: string;
  cutId: string; // 컷 ID (필수)
  userId?: string; // 사용자 ID (선택적)
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[괴수 이미지 생성] 요청 시작');

  try {
    if (!GEMINI_API_KEY) {
      console.error('[괴수 이미지 생성] GEMINI_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body: GenerateMonsterImageRequest = await request.json();
    const { prompt, aspectRatio, cutId, userId } = body;

    if (!prompt || !prompt.trim()) {
      console.error('[괴수 이미지 생성] 프롬프트가 없음');
      return NextResponse.json(
        { error: '프롬프트가 필요합니다.' },
        { status: 400 }
      );
    }

    // cutId가 없으면 임시 파일 저장 없이 base64만 반환
    console.log('[괴수 이미지 생성] Gemini API 호출 시작...');
    const geminiRequestStart = Date.now();

    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    // 이미지 비율 설정
    const imageConfig: { imageSize: string; aspectRatio?: string } = {
      imageSize: '1K',
    };
    
    if (aspectRatio) {
      imageConfig.aspectRatio = aspectRatio;
      console.log('[괴수 이미지 생성] 이미지 비율 설정:', aspectRatio);
    }

    const config = {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig,
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 32768,
    };

    const model = 'gemini-3-pro-image-preview';

    const contents = [
      {
        role: 'user' as const,
        parts: [
          {
            text: prompt.trim(),
          },
        ],
      },
    ];

    // 재시도 로직
    const maxRetries = 3;
    let lastError: unknown = null;
    let response: Awaited<ReturnType<typeof ai.models.generateContentStream>> | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`[괴수 이미지 생성] Gemini API 재시도 ${attempt}/${maxRetries} (${delay}ms 대기 후)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log('[괴수 이미지 생성] Gemini API 호출:', {
          model,
          promptLength: prompt.length,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
        });

        const apiPromise = ai.models.generateContentStream({
          model,
          config,
          contents,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Gemini API 타임아웃: ${GEMINI_API_TIMEOUT}ms 초과`));
          }, GEMINI_API_TIMEOUT);
        });

        response = await Promise.race([apiPromise, timeoutPromise]);
        break;
      } catch (error: unknown) {
        lastError = error;
        console.error(`[괴수 이미지 생성] Gemini API 호출 실패 (시도 ${attempt + 1}/${maxRetries + 1}):`, {
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt >= maxRetries) {
          throw error;
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Gemini API 응답을 받을 수 없습니다.');
    }

    // 스트림에서 이미지 데이터 수집
    let generatedImageData: string | null = null;
    let generatedImageMimeType: string | null = null;

    const streamReadStartTime = Date.now();
    const STREAM_READ_TIMEOUT = GEMINI_API_TIMEOUT;

    try {
      for await (const chunk of response) {
        const elapsed = Date.now() - streamReadStartTime;
        if (elapsed > STREAM_READ_TIMEOUT) {
          throw new Error(`스트림 읽기 타임아웃: ${STREAM_READ_TIMEOUT}ms 초과`);
        }

        if (!chunk.candidates || !chunk.candidates[0]?.content?.parts) {
          continue;
        }

        const parts = chunk.candidates[0].content.parts;

        for (const part of parts) {
          if (part.inlineData) {
            const inlineData = part.inlineData;
            if (inlineData.data && typeof inlineData.data === 'string' && inlineData.data.length > 0) {
              generatedImageData = inlineData.data;
              generatedImageMimeType = inlineData.mimeType || 'image/png';
              console.log('[괴수 이미지 생성] 이미지 데이터를 찾음:', {
                dataLength: generatedImageData.length,
                mimeType: generatedImageMimeType,
              });
              break;
            }
          }
        }

        if (generatedImageData) {
          break;
        }
      }
    } catch (streamError) {
      if (streamError instanceof Error && streamError.message.includes('타임아웃')) {
        console.error('[괴수 이미지 생성] 스트림 읽기 타임아웃:', streamError.message);
        throw streamError;
      }
      throw streamError;
    }

    const geminiRequestTime = Date.now() - geminiRequestStart;
    console.log('[괴수 이미지 생성] Gemini API 응답:', {
      requestTime: `${geminiRequestTime}ms`,
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

