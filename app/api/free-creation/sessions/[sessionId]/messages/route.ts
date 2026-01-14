import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import crypto from 'crypto';
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';
import { ApiProvider } from '@/lib/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const GEMINI_API_TIMEOUT = 120000;
const SEEDREAM_API_TIMEOUT = 60000;

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// GET /api/free-creation/sessions/[sessionId]/messages - 메시지 목록 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;

    // 메시지 목록 조회 (생성된 파일 정보 포함)
    const { data: messages, error } = await supabase
      .from('free_creation_messages')
      .select(`
        *,
        generated_file:files (
          id,
          file_name,
          file_path,
          storage_path,
          thumbnail_path,
          file_type,
          mime_type
        )
      `)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[자유창작 메시지] 조회 실패:', error);
      return NextResponse.json(
        { error: '메시지 목록 조회에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 레퍼런스 파일 정보 조회
    const allReferenceIds = new Set<string>();
    messages?.forEach(msg => {
      if (msg.reference_file_ids) {
        msg.reference_file_ids.forEach((id: string) => allReferenceIds.add(id));
      }
    });

    let referenceFilesMap = new Map();
    if (allReferenceIds.size > 0) {
      const { data: refFiles } = await supabase
        .from('reference_files')
        .select('id, file_name, file_path, thumbnail_path')
        .in('id', Array.from(allReferenceIds));

      if (refFiles) {
        referenceFilesMap = new Map(refFiles.map(f => [f.id, f]));
      }
    }

    // 메시지에 레퍼런스 파일 정보 추가
    const messagesWithRefs = messages?.map(msg => ({
      ...msg,
      reference_files: msg.reference_file_ids
        ?.map((id: string) => referenceFilesMap.get(id))
        .filter(Boolean) || [],
    }));

    return NextResponse.json({ messages: messagesWithRefs || [] });
  } catch (error) {
    console.error('[자유창작 메시지] 예외 발생:', error);
    return NextResponse.json(
      { error: '메시지 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST /api/free-creation/sessions/[sessionId]/messages - 메시지 생성 + 이미지 생성
export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  console.log('[자유창작] 메시지 생성 요청 시작');

  try {
    const { sessionId } = await params;
    const body = await request.json();
    const {
      prompt,
      referenceFileIds = [],
      apiProvider = 'gemini',
      aspectRatio = '1:1',
      userId,
      webtoonId,
    } = body;

    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { error: '프롬프트가 필요합니다.' },
        { status: 400 }
      );
    }

    // 세션 확인
    const { data: session, error: sessionError } = await supabase
      .from('free_creation_sessions')
      .select('id, webtoon_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: '세션을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 메시지 생성 (pending 상태)
    const { data: message, error: messageError } = await supabase
      .from('free_creation_messages')
      .insert({
        session_id: sessionId,
        prompt: prompt.trim(),
        reference_file_ids: referenceFileIds,
        api_provider: apiProvider,
        aspect_ratio: aspectRatio,
        status: 'generating',
        created_by: userId || null,
      })
      .select()
      .single();

    if (messageError || !message) {
      console.error('[자유창작] 메시지 생성 실패:', messageError);
      return NextResponse.json(
        { error: '메시지 생성에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 레퍼런스 이미지 다운로드
    const refImages: Array<{ base64: string; mimeType: string }> = [];
    if (referenceFileIds.length > 0) {
      console.log('[자유창작] 레퍼런스 이미지 다운로드 시작:', referenceFileIds.length);

      const { data: refFiles } = await supabase
        .from('reference_files')
        .select('id, file_path')
        .in('id', referenceFileIds);

      if (refFiles) {
        for (const refFile of refFiles) {
          try {
            const response = await fetch(refFile.file_path);
            if (response.ok) {
              const buffer = Buffer.from(await response.arrayBuffer());
              refImages.push({
                base64: buffer.toString('base64'),
                mimeType: response.headers.get('content-type') || 'image/jpeg',
              });
            }
          } catch (err) {
            console.error('[자유창작] 레퍼런스 이미지 다운로드 실패:', err);
          }
        }
      }

      // 최근 레퍼런스 업데이트 (UPSERT)
      for (const refId of referenceFileIds) {
        await supabase
          .from('free_creation_recent_references')
          .upsert({
            session_id: sessionId,
            reference_file_id: refId,
            created_by: userId || null,
            used_at: new Date().toISOString(),
          }, {
            onConflict: 'session_id,reference_file_id',
          });
      }
    }

    // 이미지 생성
    let generatedImageData: string | null = null;
    let generatedImageMimeType: string = 'image/png';
    const useSeedream = apiProvider === 'seedream';

    try {
      console.log(`[자유창작] ${useSeedream ? 'Seedream' : 'Gemini'} API 호출 시작...`);

      if (useSeedream) {
        // Seedream API
        const seedreamSize = aspectRatio === '16:9' ? '2560x1440'
          : aspectRatio === '9:16' ? '1440x2560'
          : '1920x1920';

        const seedreamImages = refImages.map(img => 
          `data:${img.mimeType};base64,${img.base64}`
        );

        const result = await generateSeedreamImage({
          provider: 'seedream',
          model: 'seedream-4-5-251128',
          prompt: prompt.trim(),
          images: seedreamImages.length > 0 ? seedreamImages : undefined,
          size: seedreamSize,
          responseFormat: 'url',
          watermark: true,
          timeoutMs: SEEDREAM_API_TIMEOUT,
          retries: 3,
        });

        generatedImageData = result.base64;
        generatedImageMimeType = result.mimeType;
      } else {
        // Gemini API
        const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
          { text: prompt.trim() },
        ];

        // 레퍼런스 이미지 추가
        for (const img of refImages) {
          contentParts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.base64,
            },
          });
        }

        const result = await generateGeminiImage({
          provider: 'gemini',
          model: 'gemini-3-pro-image-preview',
          contents: [{ role: 'user', parts: contentParts }],
          config: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: {
              imageSize: '1K',
              aspectRatio,
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
    } catch (genError) {
      console.error('[자유창작] 이미지 생성 실패:', genError);
      
      // 메시지 상태를 error로 업데이트
      await supabase
        .from('free_creation_messages')
        .update({
          status: 'error',
          error_message: genError instanceof Error ? genError.message : '이미지 생성 실패',
        })
        .eq('id', message.id);

      return NextResponse.json(
        { error: '이미지 생성에 실패했습니다.', message },
        { status: 500 }
      );
    }

    if (!generatedImageData) {
      await supabase
        .from('free_creation_messages')
        .update({
          status: 'error',
          error_message: '생성된 이미지 데이터가 없습니다.',
        })
        .eq('id', message.id);

      return NextResponse.json(
        { error: '생성된 이미지 데이터가 없습니다.', message },
        { status: 500 }
      );
    }

    // 이미지를 Storage에 저장
    const imageBuffer = Buffer.from(generatedImageData, 'base64');
    const extension = generatedImageMimeType === 'image/png' ? '.png' : '.jpg';
    const uuid = crypto.randomUUID().substring(0, 8);
    const fileName = `free-creation-${uuid}${extension}`;
    const storagePath = `temp/free-creation/${userId || 'anonymous'}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('webtoon-files')
      .upload(storagePath, imageBuffer, {
        contentType: generatedImageMimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[자유창작] 파일 업로드 실패:', uploadError);
      await supabase
        .from('free_creation_messages')
        .update({
          status: 'error',
          error_message: '파일 업로드 실패',
        })
        .eq('id', message.id);

      return NextResponse.json(
        { error: '파일 업로드에 실패했습니다.', message },
        { status: 500 }
      );
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
    } catch {
      console.warn('[자유창작] 메타데이터 추출 실패');
    }

    // DB에 파일 정보 저장 (cut_id = null)
    const { data: fileData, error: dbError } = await supabase
      .from('files')
      .insert({
        cut_id: null,
        process_id: null,
        file_name: fileName,
        file_path: fileUrl,
        storage_path: storagePath,
        file_size: imageBuffer.length,
        file_type: 'image',
        mime_type: generatedImageMimeType,
        description: '자유창작',
        prompt: prompt.trim(),
        created_by: userId || null,
        is_temp: true,
        is_public: true,
        metadata: {
          width: imageWidth,
          height: imageHeight,
          source: 'free-creation',
          session_id: sessionId,
          reference_file_ids: referenceFileIds,
        },
      })
      .select()
      .single();

    if (dbError || !fileData) {
      console.error('[자유창작] 파일 DB 저장 실패:', dbError);
      // Storage 파일 삭제
      await supabase.storage.from('webtoon-files').remove([storagePath]);

      await supabase
        .from('free_creation_messages')
        .update({
          status: 'error',
          error_message: '파일 저장 실패',
        })
        .eq('id', message.id);

      return NextResponse.json(
        { error: '파일 저장에 실패했습니다.', message },
        { status: 500 }
      );
    }

    // 메시지 상태 업데이트 (completed)
    const { data: updatedMessage, error: updateError } = await supabase
      .from('free_creation_messages')
      .update({
        status: 'completed',
        generated_file_id: fileData.id,
      })
      .eq('id', message.id)
      .select(`
        *,
        generated_file:files (
          id,
          file_name,
          file_path,
          storage_path,
          thumbnail_path,
          file_type,
          mime_type
        )
      `)
      .single();

    if (updateError) {
      console.error('[자유창작] 메시지 업데이트 실패:', updateError);
    }

    // 세션의 updated_at 갱신
    await supabase
      .from('free_creation_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    const totalTime = Date.now() - startTime;
    console.log('[자유창작] 메시지 생성 완료:', {
      messageId: message.id,
      fileId: fileData.id,
      totalTime: `${totalTime}ms`,
    });

    // 레퍼런스 파일 정보 조회
    let referenceFiles: Array<{ id: string; file_name: string; file_path: string; thumbnail_path: string | null }> = [];
    if (referenceFileIds.length > 0) {
      const { data: refFiles } = await supabase
        .from('reference_files')
        .select('id, file_name, file_path, thumbnail_path')
        .in('id', referenceFileIds);
      referenceFiles = refFiles || [];
    }

    return NextResponse.json({
      message: {
        ...updatedMessage,
        reference_files: referenceFiles,
      },
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[자유창작] 예외 발생:', {
      error,
      totalTime: `${totalTime}ms`,
    });
    return NextResponse.json(
      { error: '메시지 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
