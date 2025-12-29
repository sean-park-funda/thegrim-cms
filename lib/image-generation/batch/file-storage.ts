import sharp from 'sharp';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import type { ImageProvider } from '../types';
import type { SourceFile, SaveTempFileParams, SavedFile, ProcessedImage } from './types';
import { getExtensionFromMimeType } from './image-utils';

/**
 * 임시 파일 저장 (Storage + DB)
 */
export async function saveTempFile(params: SaveTempFileParams): Promise<SavedFile> {
  const {
    imageData,
    mimeType,
    sourceFile,
    stylePrompt,
    createdBy,
    styleId,
    styleKey,
    styleName,
    isPublic = true,
  } = params;

  const imageBuffer = Buffer.from(imageData, 'base64');
  const extension = getExtensionFromMimeType(mimeType);
  const uuid = crypto.randomUUID().substring(0, 8);
  const baseFileName = sourceFile.file_name.replace(/\.[^/.]+$/, '') || 'regenerated';
  
  // 파일명 sanitize (한글 및 특수문자 처리)
  const sanitizedBaseFileName = baseFileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 100);
  const fileName = `${sanitizedBaseFileName}-${uuid}${extension}`;
  const storagePath = `${sourceFile.cut_id}/${sourceFile.process_id}/${fileName}`;

  console.log('[file-storage] 임시 파일 저장 시작:', storagePath);
  
  // Storage 업로드
  const { error: uploadError } = await supabase.storage
    .from('webtoon-files')
    .upload(storagePath, imageBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  let finalStoragePath = storagePath;
  let finalFileName = fileName;

  if (uploadError) {
    console.error('[file-storage] 임시 파일 저장 실패:', {
      error: uploadError,
      storagePath,
      fileName,
      originalFileName: sourceFile.file_name,
    });

    // 파일명 재시도 (더 간단한 파일명 사용)
    const fallbackFileName = `regenerated-${uuid}${extension}`;
    const fallbackStoragePath = `${sourceFile.cut_id}/${sourceFile.process_id}/${fallbackFileName}`;

    console.log('[file-storage] 재시도 - 간단한 파일명 사용:', fallbackStoragePath);
    const { error: retryError } = await supabase.storage
      .from('webtoon-files')
      .upload(fallbackStoragePath, imageBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (retryError) {
      console.error('[file-storage] 재시도도 실패:', retryError);
      throw new Error('파일 저장에 실패했습니다.');
    }

    finalStoragePath = fallbackStoragePath;
    finalFileName = fallbackFileName;
  }

  // 파일 URL 생성
  const { data: urlData } = supabase.storage
    .from('webtoon-files')
    .getPublicUrl(finalStoragePath);
  const fileUrl = urlData.publicUrl;

  // 이미지 메타데이터 추출
  let imageWidth: number | undefined;
  let imageHeight: number | undefined;
  try {
    const metadata = await sharp(imageBuffer).metadata();
    imageWidth = metadata.width;
    imageHeight = metadata.height;
  } catch (error) {
    console.warn('[file-storage] 메타데이터 추출 실패:', error);
  }

  // DB에 임시 파일 정보 저장 (is_temp = true)
  const finalCreatedBy = createdBy || sourceFile.created_by;
  console.log('[file-storage] 파일 저장:', {
    createdBy: createdBy || '없음 (원본 파일 생성자 사용)',
    sourceCreatedBy: sourceFile.created_by,
    finalCreatedBy,
  });

  const { data: fileData, error: dbError } = await supabase
    .from('files')
    .insert({
      cut_id: sourceFile.cut_id,
      process_id: sourceFile.process_id,
      file_name: finalFileName,
      file_path: fileUrl,
      storage_path: finalStoragePath,
      file_size: imageBuffer.length,
      file_type: 'image',
      mime_type: mimeType,
      description: `AI 재생성: ${sourceFile.file_name}`,
      prompt: stylePrompt,
      created_by: finalCreatedBy,
      source_file_id: sourceFile.id,
      is_temp: true,
      is_public: isPublic,
      metadata: {
        width: imageWidth,
        height: imageHeight,
        ...(styleId && { style_id: styleId }),
        ...(styleKey && { style_key: styleKey }),
        ...(styleName && { style_name: styleName }),
      },
    })
    .select()
    .single();

  if (dbError || !fileData) {
    console.error('[file-storage] DB 저장 실패:', dbError);
    // Storage 파일 삭제
    await supabase.storage.from('webtoon-files').remove([finalStoragePath]);
    throw new Error('DB 저장에 실패했습니다.');
  }

  console.log('[file-storage] 임시 파일 저장 완료:', {
    fileId: fileData.id,
    storagePath: finalStoragePath,
    fileUrl,
    size: imageBuffer.length,
  });

  return {
    fileId: fileData.id,
    filePath: finalStoragePath,
    fileUrl,
    storagePath: finalStoragePath,
  };
}

/**
 * 이미지 생성 결과를 저장하고 ProcessedImage 반환
 */
export async function saveGeneratedImage(
  imageData: string,
  mimeType: string,
  sourceFile: SourceFile,
  request: {
    index: number;
    stylePrompt: string;
    apiProvider: ImageProvider;
    styleId?: string;
    styleKey?: string;
    styleName?: string;
  },
  createdBy?: string,
  isPublic?: boolean
): Promise<ProcessedImage> {
  try {
    const savedFile = await saveTempFile({
      imageData,
      mimeType,
      sourceFile,
      stylePrompt: request.stylePrompt,
      createdBy,
      styleId: request.styleId,
      styleKey: request.styleKey,
      styleName: request.styleName,
      isPublic,
    });

    return {
      index: request.index,
      fileId: savedFile.fileId,
      filePath: savedFile.filePath,
      fileUrl: savedFile.fileUrl,
      mimeType,
      apiProvider: request.apiProvider,
      stylePrompt: request.stylePrompt,
      ...(request.styleId && { styleId: request.styleId }),
      ...(request.styleKey && { styleKey: request.styleKey }),
      ...(request.styleName && { styleName: request.styleName }),
    };
  } catch {
    // 저장 실패 시 기존 방식으로 fallback (base64 반환)
    return {
      index: request.index,
      imageData,
      mimeType,
      apiProvider: request.apiProvider,
      fileId: '',
      filePath: '',
      fileUrl: '',
      stylePrompt: request.stylePrompt,
    };
  }
}
