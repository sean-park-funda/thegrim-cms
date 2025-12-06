import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import sharp from 'sharp';
import crypto from 'crypto';

interface SaveTempImageRequest {
  imageData: string; // base64 이미지 데이터
  mimeType: string; // MIME 타입
  cutId: string; // 컷 ID
  processId: string; // 공정 ID
  fileName?: string; // 파일명 (선택사항)
  description?: string; // 설명 (선택사항)
  prompt?: string; // 프롬프트 (선택사항)
  sourceFileId?: string; // 원본 파일 ID (선택사항)
  createdBy?: string; // 생성자 ID (선택사항)
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[임시 이미지 저장] 저장 요청 시작');

  try {
    const body: SaveTempImageRequest = await request.json();
    const {
      imageData,
      mimeType,
      cutId,
      processId,
      fileName,
      description,
      prompt,
      sourceFileId,
      createdBy,
    } = body;

    if (!imageData || !mimeType || !cutId || !processId) {
      return NextResponse.json(
        { error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // base64를 Buffer로 변환
    const imageBuffer = Buffer.from(imageData, 'base64');
    console.log('[임시 이미지 저장] 이미지 버퍼 생성 완료:', {
      size: imageBuffer.length,
      mimeType,
    });

    // 이미지 메타데이터 추출
    let imageWidth: number | undefined;
    let imageHeight: number | undefined;
    try {
      const metadata = await sharp(imageBuffer).metadata();
      imageWidth = metadata.width;
      imageHeight = metadata.height;
    } catch (error) {
      console.warn('[임시 이미지 저장] 메타데이터 추출 실패:', error);
    }

    // 파일 확장자 결정
    const getExtensionFromMimeType = (mime: string): string => {
      const mimeMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
      };
      return mimeMap[mime] || '.png';
    };

    const extension = getExtensionFromMimeType(mimeType);
    const uuid = crypto.randomUUID().substring(0, 8);
    const baseFileName = fileName?.replace(/\.[^/.]+$/, '') || 'modified';
    const sanitizedBaseFileName = baseFileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 100);
    const finalFileName = `${sanitizedBaseFileName}-${uuid}${extension}`;
    const storagePath = `${cutId}/${processId}/${finalFileName}`;

    console.log('[임시 이미지 저장] Storage 업로드 시작:', storagePath);

    // Storage에 업로드
    const { error: uploadError } = await supabase.storage
      .from('webtoon-files')
      .upload(storagePath, imageBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[임시 이미지 저장] Storage 업로드 실패:', uploadError);
      
      // 재시도 (더 간단한 파일명 사용)
      const fallbackFileName = `modified-${uuid}${extension}`;
      const fallbackStoragePath = `${cutId}/${processId}/${fallbackFileName}`;
      
      const { error: retryError } = await supabase.storage
        .from('webtoon-files')
        .upload(fallbackStoragePath, imageBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (retryError) {
        console.error('[임시 이미지 저장] 재시도도 실패:', retryError);
        return NextResponse.json(
          { error: '이미지 업로드에 실패했습니다.' },
          { status: 500 }
        );
      }

      // 재시도 성공 시 fallback 경로 사용
      const { data: urlData } = supabase.storage
        .from('webtoon-files')
        .getPublicUrl(fallbackStoragePath);
      const fileUrl = urlData.publicUrl;

      // DB에 임시 파일 정보 저장
      const { data: fileData, error: dbError } = await supabase
        .from('files')
        .insert({
          cut_id: cutId,
          process_id: processId,
          file_name: fallbackFileName,
          file_path: fileUrl,
          storage_path: fallbackStoragePath,
          file_size: imageBuffer.length,
          file_type: 'image',
          mime_type: mimeType,
          description: description || `AI 수정: ${fileName || '이미지'}`,
          prompt: prompt,
          created_by: createdBy,
          source_file_id: sourceFileId,
          is_temp: true,
          metadata: {
            width: imageWidth,
            height: imageHeight,
          },
        })
        .select()
        .single();

      if (dbError || !fileData) {
        console.error('[임시 이미지 저장] DB 저장 실패:', dbError);
        await supabase.storage.from('webtoon-files').remove([fallbackStoragePath]);
        return NextResponse.json(
          { error: '파일 정보 저장에 실패했습니다.' },
          { status: 500 }
        );
      }

      const totalTime = Date.now() - startTime;
      console.log('[임시 이미지 저장] 완료:', {
        fileId: fileData.id,
        totalTime: `${totalTime}ms`,
      });

      return NextResponse.json({
        file: fileData,
        fileUrl,
      });
    }

    // 업로드 성공 시
    const { data: urlData } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(storagePath);
    const fileUrl = urlData.publicUrl;

    // DB에 임시 파일 정보 저장
    const { data: fileData, error: dbError } = await supabase
      .from('files')
      .insert({
        cut_id: cutId,
        process_id: processId,
        file_name: finalFileName,
        file_path: fileUrl,
        storage_path: storagePath,
        file_size: imageBuffer.length,
        file_type: 'image',
        mime_type: mimeType,
        description: description || `AI 수정: ${fileName || '이미지'}`,
        prompt: prompt,
        created_by: createdBy,
        source_file_id: sourceFileId,
        is_temp: true,
        metadata: {
          width: imageWidth,
          height: imageHeight,
        },
      })
      .select()
      .single();

    if (dbError || !fileData) {
      console.error('[임시 이미지 저장] DB 저장 실패:', dbError);
      await supabase.storage.from('webtoon-files').remove([storagePath]);
      return NextResponse.json(
        { error: '파일 정보 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[임시 이미지 저장] 완료:', {
      fileId: fileData.id,
      totalTime: `${totalTime}ms`,
    });

    return NextResponse.json({
      file: fileData,
      fileUrl,
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[임시 이미지 저장] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`,
    });
    const errorMessage =
      error instanceof Error
        ? error.message
        : '임시 이미지 저장 중 오류가 발생했습니다.';
    return NextResponse.json(
      {
        error: errorMessage,
        details: {
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
      },
      { status: 500 }
    );
  }
}

