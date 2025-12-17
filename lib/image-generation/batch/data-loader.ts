import sharp from 'sharp';
import { supabase } from '@/lib/supabase';
import { fetchWithTimeout } from '../utils';
import { IMAGE_DOWNLOAD_TIMEOUT } from './constants';
import type { SourceFile, ReferenceFile, ImageData, DownloadedImages } from './types';

/**
 * 소스 파일 정보 조회
 */
export async function loadSourceFile(fileId: string): Promise<SourceFile> {
  console.log('[data-loader] 소스 파일 정보 조회 시작...', { fileId });
  
  const { data: file, error: fileError } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single();

  if (fileError || !file) {
    console.error('[data-loader] 소스 파일 조회 실패:', fileError);
    throw new Error('파일을 찾을 수 없습니다.');
  }

  if (file.file_type !== 'image') {
    throw new Error('이미지 파일만 재생성할 수 있습니다.');
  }

  console.log('[data-loader] 소스 파일 조회 완료:', { fileId: file.id, fileName: file.file_name });

  return {
    id: file.id,
    file_path: file.file_path,
    file_name: file.file_name,
    file_type: file.file_type,
    cut_id: file.cut_id,
    process_id: file.process_id,
    created_by: file.created_by,
  };
}

/**
 * 레퍼런스 파일 정보 조회
 */
export async function loadReferenceFiles(fileIds: string[]): Promise<ReferenceFile[]> {
  if (!fileIds || fileIds.length === 0) {
    return [];
  }

  console.log('[data-loader] 레퍼런스 파일 정보 조회 시작...', { count: fileIds.length });
  const referenceFiles: ReferenceFile[] = [];

  for (const refFileId of fileIds) {
    // 먼저 reference_files 테이블에서 조회 시도
    const { data: refFile, error: refFileError } = await supabase
      .from('reference_files')
      .select('file_path')
      .eq('id', refFileId)
      .single();

    if (refFileError || !refFile) {
      // reference_files에서 찾지 못하면 files 테이블에서 조회 시도
      console.log('[data-loader] reference_files에서 찾지 못함, files 테이블에서 조회 시도...', { refFileId });
      const { data: regularFile, error: regularFileError } = await supabase
        .from('files')
        .select('file_path')
        .eq('id', refFileId)
        .single();

      if (regularFileError || !regularFile) {
        console.error('[data-loader] 레퍼런스 파일 조회 실패:', { refFileId, error: refFileError || regularFileError });
        continue;
      }
      referenceFiles.push(regularFile);
      console.log('[data-loader] files 테이블에서 레퍼런스 파일 찾음', { refFileId });
    } else {
      referenceFiles.push(refFile);
      console.log('[data-loader] reference_files 테이블에서 레퍼런스 파일 찾음', { refFileId });
    }
  }

  console.log('[data-loader] 레퍼런스 파일 조회 완료:', {
    total: fileIds.length,
    success: referenceFiles.length,
  });

  return referenceFiles;
}

/**
 * 캐릭터 시트 이미지 다운로드
 */
export async function loadCharacterSheets(
  sheets: Array<{ sheetId: string }>
): Promise<ImageData[]> {
  if (!sheets || sheets.length === 0) {
    return [];
  }

  console.log('[data-loader] 캐릭터시트 이미지 다운로드 시작...', { count: sheets.length });
  const characterSheetImages: ImageData[] = [];

  for (const sheet of sheets) {
    try {
      // DB에서 file_path 조회
      console.log('[data-loader] 캐릭터시트 파일 ID로 파일 정보 조회 시작...', { sheetId: sheet.sheetId });
      const { data: sheetFile, error: sheetFileError } = await supabase
        .from('character_sheets')
        .select('file_path')
        .eq('id', sheet.sheetId)
        .single();

      if (sheetFileError || !sheetFile) {
        console.error('[data-loader] 캐릭터시트 파일 조회 실패:', {
          sheetId: sheet.sheetId,
          error: sheetFileError,
        });
        continue;
      }

      console.log('[data-loader] 캐릭터시트 이미지 다운로드 시작...', { sheetId: sheet.sheetId, filePath: sheetFile.file_path });
      const sheetResponse = await fetch(sheetFile.file_path);

      if (!sheetResponse.ok) {
        console.error('[data-loader] 캐릭터시트 이미지 다운로드 실패:', {
          sheetId: sheet.sheetId,
          status: sheetResponse.status,
          filePath: sheetFile.file_path,
        });
        continue;
      }

      const sheetArrayBuffer = await sheetResponse.arrayBuffer();
      const sheetBuffer = Buffer.from(sheetArrayBuffer);
      const sheetBase64 = sheetBuffer.toString('base64');
      const sheetMimeType = sheetResponse.headers.get('content-type') || 'image/jpeg';

      characterSheetImages.push({
        base64: sheetBase64,
        mimeType: sheetMimeType,
      });
    } catch (error) {
      console.error('[data-loader] 캐릭터시트 이미지 다운로드 중 오류:', {
        sheetId: sheet.sheetId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[data-loader] 캐릭터시트 이미지 다운로드 완료:', {
    total: sheets.length,
    success: characterSheetImages.length,
  });

  return characterSheetImages;
}

/**
 * 소스 이미지 및 레퍼런스 이미지 다운로드
 */
export async function downloadImages(
  sourceFile: SourceFile,
  referenceFiles: ReferenceFile[],
  characterSheets?: Array<{ sheetId: string }>
): Promise<DownloadedImages> {
  console.log('[data-loader] 이미지 다운로드 시작...');

  // 원본 이미지 다운로드
  const imageDownloadPromise = fetchWithTimeout(sourceFile.file_path, {}, IMAGE_DOWNLOAD_TIMEOUT)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`이미지 다운로드 실패: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log('[data-loader] 원본 이미지 다운로드 완료:', {
        size: buffer.length,
        mimeType: response.headers.get('content-type') || 'image/jpeg',
      });
      return {
        buffer,
        mimeType: response.headers.get('content-type') || 'image/jpeg',
      };
    });

  // 레퍼런스 이미지들 다운로드 (병렬)
  const referenceDownloadPromises = referenceFiles.map((refFile, index) =>
    fetchWithTimeout(refFile.file_path, {}, IMAGE_DOWNLOAD_TIMEOUT)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`레퍼런스 이미지 다운로드 실패: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log('[data-loader] 레퍼런스 이미지 다운로드 완료:', {
          index: index + 1,
          total: referenceFiles.length,
          size: buffer.length,
          mimeType: response.headers.get('content-type') || 'image/jpeg',
        });
        return {
          buffer,
          mimeType: response.headers.get('content-type') || 'image/jpeg',
        };
      })
  );

  // 캐릭터 시트 이미지 다운로드
  const characterSheetImagesPromise = characterSheets
    ? loadCharacterSheets(characterSheets)
    : Promise.resolve([]);

  // 원본과 레퍼런스 이미지들을 병렬로 다운로드
  const [imageResult, characterSheetImages, ...referenceResults] = await Promise.all([
    imageDownloadPromise.then(r => ({ status: 'fulfilled' as const, value: r })).catch(e => ({ status: 'rejected' as const, reason: e })),
    characterSheetImagesPromise,
    ...referenceDownloadPromises.map(p => p.then(r => ({ status: 'fulfilled' as const, value: r })).catch(e => ({ status: 'rejected' as const, reason: e }))),
  ]);

  // 원본 이미지 처리
  if (imageResult.status === 'rejected') {
    console.error('[data-loader] 이미지 다운로드 실패:', imageResult.reason);
    throw new Error('이미지를 가져올 수 없습니다.');
  }

  const imageBuffer = imageResult.value.buffer;
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = imageResult.value.mimeType;

  // 이미지 메타데이터 가져오기
  console.log('[data-loader] 이미지 메타데이터 추출 시작...');
  const imageMetadata = await sharp(imageBuffer).metadata();
  const originalWidth = imageMetadata.width || 1920;
  const originalHeight = imageMetadata.height || 1080;
  console.log('[data-loader] 이미지 메타데이터 추출 완료:', {
    width: originalWidth,
    height: originalHeight,
    format: imageMetadata.format,
  });

  // 레퍼런스 이미지 처리
  const refImages: ImageData[] = [];
  referenceResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      refImages.push({
        base64: result.value.buffer.toString('base64'),
        mimeType: result.value.mimeType,
      });
    } else {
      console.error('[data-loader] 레퍼런스 이미지 다운로드 실패:', {
        index: index + 1,
        error: result.reason,
      });
    }
  });

  if (referenceFiles.length > 0 && refImages.length === 0) {
    throw new Error('레퍼런스 이미지를 가져올 수 없습니다.');
  }

  console.log('[data-loader] 레퍼런스 이미지 다운로드 완료:', {
    total: referenceFiles.length,
    success: refImages.length,
  });

  // 캐릭터 시트 검증
  if (characterSheets && characterSheets.length > 0 && characterSheetImages.length === 0) {
    throw new Error('캐릭터시트 이미지를 가져올 수 없습니다.');
  }

  return {
    imageBuffer,
    imageBase64,
    mimeType,
    originalWidth,
    originalHeight,
    refImages,
    characterSheetImages,
  };
}
