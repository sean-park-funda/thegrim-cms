import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import crypto from 'crypto';
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY;
const SEEDREAM_API_BASE_URL = process.env.SEEDREAM_API_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';
const SEEDREAM_API_ENDPOINT = `${SEEDREAM_API_BASE_URL}/images/generations`;

const SEEDREAM_API_TIMEOUT = 60000; // 60초
const GEMINI_API_TIMEOUT = 120000; // 120초 (이미지 생성이 더 오래 걸릴 수 있음)
const RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'];
const SEEDREAM_MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const SEEDREAM_MAX_PIXELS = 36000000; // 36,000,000 픽셀

// 레퍼런스 이미지 리사이징 결과 캐시
const referenceImageResizeCache = new Map<string, { base64: string; mimeType: string; resized: boolean }>();
const MAX_CACHE_SIZE = 100;

// Gemini API에서 지원하는 이미지 비율 목록
const GEMINI_ASPECT_RATIOS = [
  '21:9', '16:9', '4:3', '3:2',
  '1:1',
  '9:16', '3:4', '2:3',
  '5:4', '4:5',
] as const;

// Seedream API에서 지원하는 이미지 비율 목록
const SEEDREAM_ASPECT_RATIOS = [
  '21:9', '16:9', '4:3', '3:2',
  '1:1',
  '9:16', '3:4', '2:3',
] as const;

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // 타임아웃 에러는 재시도 가능 (일시적인 네트워크 문제일 수 있음)
    if (error.message.includes('타임아웃') || error.message.includes('timeout')) {
      return true;
    }
    if (error.message === 'terminated' || error.message.includes('ECONNRESET')) {
      return true;
    }
    if (error.cause && typeof error.cause === 'object' && 'code' in error.cause) {
      const code = error.cause.code as string;
      return RETRYABLE_ERROR_CODES.includes(code);
    }
    if ('status' in error && typeof error.status === 'number') {
      const status = error.status as number;
      if ([500, 502, 503, 504].includes(status)) {
        return true;
      }
    }
    if ('errorMessage' in error && typeof error.errorMessage === 'string') {
      const errorMessage = error.errorMessage as string;
      if (errorMessage.includes('"code":500') || errorMessage.includes('"status":"INTERNAL"')) {
        return true;
      }
    }
  }
  return false;
}

function getRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10000);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = SEEDREAM_API_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

function getClosestAspectRatio(width: number, height: number, provider: 'gemini' | 'seedream'): string {
  const originalRatio = width / height;
  const supportedRatios = provider === 'gemini' ? GEMINI_ASPECT_RATIOS : SEEDREAM_ASPECT_RATIOS;
  
  let closestRatio = '1:1';
  let minDifference = Infinity;
  
  for (const ratio of supportedRatios) {
    const [w, h] = ratio.split(':').map(Number);
    const ratioValue = w / h;
    const difference = Math.abs(originalRatio - ratioValue);
    
    if (difference < minDifference) {
      minDifference = difference;
      closestRatio = ratio;
    }
  }
  
  return closestRatio;
}

async function resizeImageIfNeeded(
  imageBuffer: Buffer,
  maxSize: number = SEEDREAM_MAX_IMAGE_SIZE,
  maxPixels: number = SEEDREAM_MAX_PIXELS
): Promise<{ base64: string; mimeType: string; resized: boolean }> {
  const currentSize = imageBuffer.length;
  const metadata = await sharp(imageBuffer).metadata();
  const originalWidth = metadata.width || 1920;
  const originalHeight = metadata.height || 1080;
  const currentPixels = originalWidth * originalHeight;

  if (currentSize <= maxSize && currentPixels <= maxPixels) {
    return {
      base64: imageBuffer.toString('base64'),
      mimeType: metadata.format === 'jpeg' ? 'image/jpeg' : 'image/png',
      resized: false,
    };
  }

  const needsPixelResize = currentPixels > maxPixels;
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (needsPixelResize) {
    const pixelScale = Math.sqrt(maxPixels / currentPixels) * 0.95;
    targetWidth = Math.round(originalWidth * pixelScale);
    targetHeight = Math.round(originalHeight * pixelScale);
  }

  let resizedBuffer: Buffer;
  let quality = 85;

  resizedBuffer = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: 'inside' })
    .jpeg({ quality })
    .toBuffer();

  if (resizedBuffer.length <= maxSize) {
    return {
      base64: resizedBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      resized: true,
    };
  }

  for (quality = 80; quality >= 50; quality -= 10) {
    resizedBuffer = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, { fit: 'inside' })
      .jpeg({ quality })
      .toBuffer();

    if (resizedBuffer.length <= maxSize) {
      return {
        base64: resizedBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        resized: true,
      };
    }
  }

  for (let scale = 0.8; scale >= 0.4; scale -= 0.1) {
    const newWidth = Math.round(targetWidth * scale);
    const newHeight = Math.round(targetHeight * scale);

    resizedBuffer = await sharp(imageBuffer)
      .resize(newWidth, newHeight, { fit: 'inside' })
      .jpeg({ quality: 70 })
      .toBuffer();

    if (resizedBuffer.length <= maxSize) {
      return {
        base64: resizedBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        resized: true,
      };
    }
  }

  resizedBuffer = await sharp(imageBuffer)
    .resize(2048, 2048, { fit: 'inside' })
    .jpeg({ quality: 60 })
    .toBuffer();

  return {
    base64: resizedBuffer.toString('base64'),
    mimeType: 'image/jpeg',
    resized: true,
  };
}

function calculateSeedreamSize(width: number, height: number): string {
  const originalRatio = width / height;
  const baseSize = 2048;
  const minPixels = 3686400; // Seedream 요구 최소 픽셀 (약 1920x1920)
  
  let targetWidth: number;
  let targetHeight: number;
  
  if (originalRatio >= 1) {
    targetWidth = baseSize;
    targetHeight = Math.round(baseSize / originalRatio);
  } else {
    targetHeight = baseSize;
    targetWidth = Math.round(baseSize * originalRatio);
  }
  
  const minWidth = 1280;
  const minHeight = 720;
  const maxWidth = 4096;
  const maxHeight = 4096;
  
  if (targetWidth < minWidth) {
    targetWidth = minWidth;
    targetHeight = Math.round(minWidth / originalRatio);
  }
  if (targetHeight < minHeight) {
    targetHeight = minHeight;
    targetWidth = Math.round(minHeight * originalRatio);
  }
  
  if (targetWidth > maxWidth) {
    targetWidth = maxWidth;
    targetHeight = Math.round(maxWidth / originalRatio);
  }
  if (targetHeight > maxHeight) {
    targetHeight = maxHeight;
    targetWidth = Math.round(maxHeight * originalRatio);
  }
  
  // 8의 배수로 반올림
  targetWidth = Math.round(targetWidth / 8) * 8;
  targetHeight = Math.round(targetHeight / 8) * 8;
  
  // 최소 픽셀 수 보장 (3686400px 이상) - 8의 배수 반올림 후 최종 확인
  let area = targetWidth * targetHeight;
  if (area < minPixels) {
    const scale = Math.sqrt(minPixels / area);
    targetWidth = Math.ceil((targetWidth * scale) / 8) * 8;
    targetHeight = Math.ceil((targetHeight * scale) / 8) * 8;
    // 스케일업 후에도 max 제한 확인
    if (targetWidth > maxWidth) targetWidth = maxWidth;
    if (targetHeight > maxHeight) targetHeight = maxHeight;
  }
  
  return `${targetWidth}x${targetHeight}`;
}

interface RegenerateImageRequest {
  stylePrompt: string;
  index: number;
  apiProvider: 'gemini' | 'seedream';
  styleId?: string; // 스타일 ID (선택적)
  styleKey?: string; // 스타일 키 (선택적)
  styleName?: string; // 스타일 이름 (선택적)
}

interface RegenerateImageBatchRequest {
  characterSheets?: Array<{ sheetId: string }>; // 캐릭터시트 정보 (sheetId만 필요, file_path는 DB에서 조회)
  fileId: string;
  referenceFileId?: string; // 하위 호환성
  referenceFileIds?: string[]; // 레퍼런스 이미지 파일 ID 배열
  requests: RegenerateImageRequest[];
  createdBy?: string; // 재생성을 요청한 사용자 ID (선택적, 없으면 원본 파일의 생성자 사용)
}

interface RegenerateImageBatchResponse {
  images: Array<{
    index: number;
    fileId: string; // 파일 ID (DB에 저장된)
    filePath: string; // 파일 경로 (Storage 경로)
    fileUrl: string; // 파일 URL (미리보기용)
    mimeType: string;
    apiProvider: 'gemini' | 'seedream';
    stylePrompt: string; // 프롬프트 (히스토리용)
    imageData?: string; // 하위 호환성을 위해 선택적으로 유지 (임시 파일 저장 실패 시에만 사용)
    styleId?: string; // 스타일 ID
    styleKey?: string; // 스타일 키
    styleName?: string; // 스타일 이름
  }>;
}

// MIME 타입에서 확장자 추출
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return mimeToExt[mimeType] || '.png';
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[이미지 재생성 배치] 배치 재생성 요청 시작');

  try {
    const body: RegenerateImageBatchRequest = await request.json();
    const { fileId, referenceFileId, referenceFileIds, requests, characterSheets, createdBy } = body;
    
    // referenceFileIds가 있으면 사용, 없으면 referenceFileId를 배열로 변환 (하위 호환성)
    const finalReferenceFileIds = referenceFileIds || (referenceFileId ? [referenceFileId] : undefined);
    
    const hasCharacterSheets = !!(characterSheets && characterSheets.length > 0);
    
    // apiProvider가 비어있는 요청에 대해 기본값 설정 (전역 기본: Seedream, 단 캐릭터시트 모드 제외)
    const defaultProvider: 'gemini' | 'seedream' = 'seedream';
    requests.forEach(req => {
      if (!req.apiProvider) {
        req.apiProvider = defaultProvider;
      }
    });

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json(
        { error: '생성 요청이 필요합니다.' },
        { status: 400 }
      );
    }

    console.log('[이미지 재생성 배치] 요청 파라미터:', {
      fileId,
      referenceFileIds: finalReferenceFileIds || '없음',
      referenceFileIdsCount: finalReferenceFileIds?.length || 0,
      requestCount: requests.length,
      createdBy: createdBy || '없음 (원본 파일 생성자 사용)',
    });

    // 파일 정보 조회 (한 번만)
    console.log('[이미지 재생성 배치] 파일 정보 조회 시작...');
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      console.error('[이미지 재생성 배치] 파일 조회 실패:', fileError);
      return NextResponse.json(
        { error: '파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (file.file_type !== 'image') {
      return NextResponse.json(
        { error: '이미지 파일만 재생성할 수 있습니다.' },
        { status: 400 }
      );
    }

    // 레퍼런스 파일 정보 조회 (있는 경우)
    const referenceFiles: Array<{ file_path: string }> = [];
    if (finalReferenceFileIds && finalReferenceFileIds.length > 0) {
      console.log('[이미지 재생성 배치] 레퍼런스 파일 정보 조회 시작...', { count: finalReferenceFileIds.length });
      
      for (const refFileId of finalReferenceFileIds) {
        // 먼저 reference_files 테이블에서 조회 시도
        const { data: refFile, error: refFileError } = await supabase
          .from('reference_files')
          .select('file_path')
          .eq('id', refFileId)
          .single();

        if (refFileError || !refFile) {
          // reference_files에서 찾지 못하면 files 테이블에서 조회 시도
          console.log('[이미지 재생성 배치] reference_files에서 찾지 못함, files 테이블에서 조회 시도...', { refFileId });
          const { data: regularFile, error: regularFileError } = await supabase
            .from('files')
            .select('file_path')
            .eq('id', refFileId)
            .single();

          if (regularFileError || !regularFile) {
            console.error('[이미지 재생성 배치] 레퍼런스 파일 조회 실패:', { refFileId, error: refFileError || regularFileError });
            continue; // 개별 실패해도 계속 진행
          }
          referenceFiles.push(regularFile);
          console.log('[이미지 재생성 배치] files 테이블에서 레퍼런스 파일 찾음', { refFileId });
        } else {
          referenceFiles.push(refFile);
          console.log('[이미지 재생성 배치] reference_files 테이블에서 레퍼런스 파일 찾음', { refFileId });
        }
      }
      
      if (referenceFiles.length === 0) {
        console.error('[이미지 재생성 배치] 모든 레퍼런스 파일 조회 실패');
        return NextResponse.json(
          { error: '레퍼런스 파일을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
      
      console.log('[이미지 재생성 배치] 레퍼런스 파일 조회 완료:', {
        total: finalReferenceFileIds.length,
        success: referenceFiles.length,
      });
    }

    // 캐릭터시트 이미지 캐시 (한 번만 다운로드)
    let characterSheetImagesCache: Array<{ base64: string; mimeType: string }> | null = null;
    
    if (hasCharacterSheets && characterSheets) {
      console.log('[이미지 재생성 배치] 캐릭터시트 이미지 다운로드 시작...', { count: characterSheets.length });
      characterSheetImagesCache = [];
      
      for (const sheet of characterSheets) {
        try {
          // 레퍼런스 파일처럼 DB에서 file_path 조회
          console.log('[이미지 재생성 배치] 캐릭터시트 파일 ID로 파일 정보 조회 시작...', { sheetId: sheet.sheetId });
          const { data: sheetFile, error: sheetFileError } = await supabase
            .from('character_sheets')
            .select('file_path')
            .eq('id', sheet.sheetId)
            .single();

          if (sheetFileError || !sheetFile) {
            console.error('[이미지 재생성 배치] 캐릭터시트 파일 조회 실패:', {
              sheetId: sheet.sheetId,
              error: sheetFileError,
            });
            continue;
          }

          console.log('[이미지 재생성 배치] 캐릭터시트 이미지 다운로드 시작...', { sheetId: sheet.sheetId, filePath: sheetFile.file_path });
          const sheetResponse = await fetch(sheetFile.file_path);
          
          if (!sheetResponse.ok) {
            console.error('[이미지 재생성 배치] 캐릭터시트 이미지 다운로드 실패:', {
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
          
          characterSheetImagesCache.push({
            base64: sheetBase64,
            mimeType: sheetMimeType,
          });
        } catch (error) {
          console.error('[이미지 재생성 배치] 캐릭터시트 이미지 다운로드 중 오류:', {
            sheetId: sheet.sheetId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      if (characterSheetImagesCache.length === 0) {
        console.error('[이미지 재생성 배치] 모든 캐릭터시트 이미지 다운로드 실패');
        return NextResponse.json(
          { error: '캐릭터시트 이미지를 가져올 수 없습니다.' },
          { status: 400 }
        );
      }
      
      console.log('[이미지 재생성 배치] 캐릭터시트 이미지 다운로드 완료:', {
        total: characterSheets.length,
        success: characterSheetImagesCache.length,
      });
    }

    // 이미지 다운로드 (원본과 레퍼런스를 병렬로, 타임아웃 설정)
    console.log('[이미지 재생성 배치] 이미지 다운로드 시작...');
    const IMAGE_DOWNLOAD_TIMEOUT = 30000; // 30초
    
    // 원본 이미지 다운로드
    const imageDownloadPromise = fetchWithTimeout(file.file_path, {}, IMAGE_DOWNLOAD_TIMEOUT)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`이미지 다운로드 실패: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log('[이미지 재생성 배치] 원본 이미지 다운로드 완료:', {
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
          console.log('[이미지 재생성 배치] 레퍼런스 이미지 다운로드 완료:', {
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

    // 원본과 레퍼런스 이미지들을 병렬로 다운로드
    const [imageResult, ...referenceResults] = await Promise.allSettled([
      imageDownloadPromise,
      ...referenceDownloadPromises,
    ]);

    // 원본 이미지 처리
    if (imageResult.status === 'rejected') {
      console.error('[이미지 재생성 배치] 이미지 다운로드 실패:', imageResult.reason);
      return NextResponse.json(
        { error: '이미지를 가져올 수 없습니다.' },
        { status: 400 }
      );
    }

    const imageBuffer = imageResult.value.buffer;
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = imageResult.value.mimeType;

    // 이미지 메타데이터 가져오기
    console.log('[이미지 재생성 배치] 이미지 메타데이터 추출 시작...');
    const imageMetadata = await sharp(imageBuffer).metadata();
    const originalWidth = imageMetadata.width || 1920;
    const originalHeight = imageMetadata.height || 1080;
    console.log('[이미지 재생성 배치] 이미지 메타데이터 추출 완료:', {
      width: originalWidth,
      height: originalHeight,
      format: imageMetadata.format,
    });

    // 레퍼런스 이미지 처리
    const refImages: Array<{ base64: string; mimeType: string }> = [];
    referenceResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        refImages.push({
          base64: result.value.buffer.toString('base64'),
          mimeType: result.value.mimeType,
        });
      } else {
        console.error('[이미지 재생성 배치] 레퍼런스 이미지 다운로드 실패:', {
          index: index + 1,
          error: result.reason,
        });
      }
    });
    
    if (referenceFiles.length > 0 && refImages.length === 0) {
      console.error('[이미지 재생성 배치] 모든 레퍼런스 이미지 다운로드 실패');
      return NextResponse.json(
        { error: '레퍼런스 이미지를 가져올 수 없습니다.' },
        { status: 400 }
      );
    }
    
    console.log('[이미지 재생성 배치] 레퍼런스 이미지 다운로드 완료:', {
      total: referenceFiles.length,
      success: refImages.length,
    });

    // Provider별로 그룹화 (전달된 apiProvider를 그대로 사용)
    console.log('[이미지 재생성 배치] Provider별 그룹화 시작...');
    const geminiRequests = requests.filter(r => r.apiProvider === 'gemini');
    const seedreamRequests = requests.filter(r => r.apiProvider === 'seedream');
    console.log('[이미지 재생성 배치] Provider별 그룹화 완료:', {
      geminiCount: geminiRequests.length,
      seedreamCount: seedreamRequests.length,
      totalCount: requests.length,
    });

    const results: RegenerateImageBatchResponse['images'] = [];

    // Seedream용 이미지 리사이징 (병렬 처리 전에 미리 준비)
    let seedreamImageBase64: string | undefined;
    let seedreamMimeType: string | undefined;
    let seedreamImages: string[] | undefined;
    let seedreamSize: string | undefined;

    if (seedreamRequests.length > 0) {
      console.log('[이미지 재생성 배치] Seedream용 이미지 리사이징 준비 시작...');
      // 이미지 리사이징 (한 번만)
      console.log('[이미지 재생성 배치] 원본 이미지 리사이징 시작 (Seedream용)...');
      const resizeStartTime = Date.now();
      const resizeResult = await resizeImageIfNeeded(imageBuffer);
      const resizeTime = Date.now() - resizeStartTime;
      console.log('[이미지 재생성 배치] 원본 이미지 리사이징 완료:', {
        resized: resizeResult.resized,
        resizeTime: `${resizeTime}ms`,
        originalSize: imageBuffer.length,
        resizedBase64Length: resizeResult.base64.length,
      });
      
      seedreamImageBase64 = resizeResult.resized ? resizeResult.base64 : imageBase64;
      seedreamMimeType = resizeResult.resized ? resizeResult.mimeType : mimeType;
      const seedreamImageInput = `data:${seedreamMimeType};base64,${seedreamImageBase64}`;

      seedreamImages = [seedreamImageInput];
      if (refImages.length > 0) {
        console.log('[이미지 재생성 배치] 레퍼런스 이미지 리사이징 시작 (Seedream용)...', { count: refImages.length });
        
        for (const refImage of refImages) {
          const refResizeStartTime = Date.now();
          const cacheKey = `base64:${crypto.createHash('sha256').update(refImage.base64).digest('hex')}`;
          
          let refResizeResult: { base64: string; mimeType: string; resized: boolean };
          if (referenceImageResizeCache.has(cacheKey)) {
            refResizeResult = referenceImageResizeCache.get(cacheKey)!;
            console.log('[이미지 재생성 배치] 레퍼런스 이미지 리사이징 결과 캐시에서 재사용');
          } else {
            const refBuffer = Buffer.from(refImage.base64, 'base64');
            refResizeResult = await resizeImageIfNeeded(refBuffer);
            const refResizeTime = Date.now() - refResizeStartTime;
            console.log('[이미지 재생성 배치] 레퍼런스 이미지 리사이징 완료:', {
              resized: refResizeResult.resized,
              resizeTime: `${refResizeTime}ms`,
              originalBase64Length: refImage.base64.length,
              resizedBase64Length: refResizeResult.base64.length,
            });
            
            if (referenceImageResizeCache.size >= MAX_CACHE_SIZE) {
              const firstKey = referenceImageResizeCache.keys().next().value;
              if (firstKey) {
                referenceImageResizeCache.delete(firstKey);
              }
            }
            referenceImageResizeCache.set(cacheKey, refResizeResult);
          }
          
          const finalRefBase64 = refResizeResult.resized ? refResizeResult.base64 : refImage.base64;
          const finalRefMimeType = refResizeResult.resized ? refResizeResult.mimeType : refImage.mimeType;
          const refDataUrl = `data:${finalRefMimeType};base64,${finalRefBase64}`;
          seedreamImages.push(refDataUrl);
        }
        
        console.log('[이미지 재생성 배치] Seedream API에 레퍼런스 이미지 포함', { count: refImages.length });
      }

      // 캐릭터시트 이미지 추가 (캐릭터 바꾸기용)
      if (characterSheetImagesCache && characterSheetImagesCache.length > 0) {
        console.log('[이미지 재생성 배치] 캐릭터시트 이미지 리사이징 시작 (Seedream용)...', { count: characterSheetImagesCache.length });
        
        for (const sheetImage of characterSheetImagesCache) {
          const sheetResizeStartTime = Date.now();
          const cacheKey = `sheet:${crypto.createHash('sha256').update(sheetImage.base64).digest('hex')}`;
          
          let sheetResizeResult: { base64: string; mimeType: string; resized: boolean };
          if (referenceImageResizeCache.has(cacheKey)) {
            sheetResizeResult = referenceImageResizeCache.get(cacheKey)!;
            console.log('[이미지 재생성 배치] 캐릭터시트 이미지 리사이징 결과 캐시에서 재사용');
          } else {
            const sheetBuffer = Buffer.from(sheetImage.base64, 'base64');
            sheetResizeResult = await resizeImageIfNeeded(sheetBuffer);
            const sheetResizeTime = Date.now() - sheetResizeStartTime;
            console.log('[이미지 재생성 배치] 캐릭터시트 이미지 리사이징 완료:', {
              resized: sheetResizeResult.resized,
              resizeTime: `${sheetResizeTime}ms`,
              originalBase64Length: sheetImage.base64.length,
              resizedBase64Length: sheetResizeResult.base64.length,
            });
            
            if (referenceImageResizeCache.size >= MAX_CACHE_SIZE) {
              const firstKey = referenceImageResizeCache.keys().next().value;
              if (firstKey) {
                referenceImageResizeCache.delete(firstKey);
              }
            }
            referenceImageResizeCache.set(cacheKey, sheetResizeResult);
          }
          
          const finalSheetBase64 = sheetResizeResult.resized ? sheetResizeResult.base64 : sheetImage.base64;
          const finalSheetMimeType = sheetResizeResult.resized ? sheetResizeResult.mimeType : sheetImage.mimeType;
          const sheetDataUrl = `data:${finalSheetMimeType};base64,${finalSheetBase64}`;
          seedreamImages.push(sheetDataUrl);
        }
        
        console.log('[이미지 재생성 배치] Seedream API에 캐릭터시트 이미지 포함', { count: characterSheetImagesCache.length });
      }

      seedreamSize = calculateSeedreamSize(originalWidth, originalHeight);
      console.log('[이미지 재생성 배치] Seedream size 계산:', seedreamSize);
    }

    // Gemini와 Seedream 그룹을 병렬 처리
    const processGeminiGroup = async (): Promise<RegenerateImageBatchResponse['images']> => {
      if (geminiRequests.length === 0) {
        return [];
      }
      
      // 원본 파일 정보를 클로저로 전달
      const sourceFile = file;
      
      console.log(`[이미지 재생성 배치] Gemini 그룹 처리 시작 (${geminiRequests.length}개 요청)...`);
      if (!GEMINI_API_KEY) {
        console.error('[이미지 재생성 배치] GEMINI_API_KEY가 설정되지 않음');
        throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
      }

      const aspectRatio = getClosestAspectRatio(originalWidth, originalHeight, 'gemini');
      console.log('[이미지 재생성 배치] Gemini aspectRatio 계산:', aspectRatio);
      const model = 'gemini-3-pro-image-preview';

      const imageConfig: { imageSize: string; aspectRatio?: string } = {
        imageSize: '1K',
      };
      if (aspectRatio) {
        imageConfig.aspectRatio = aspectRatio;
      }

      const config = {
        responseModalities: ['IMAGE', 'TEXT'] as Array<'IMAGE' | 'TEXT'>,
        imageConfig,
        temperature: 1.0,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32768,
      };

      // Gemini 요청들을 2개씩 청크로 나누어 처리
      const GEMINI_CONCURRENT_LIMIT = 2;
      const geminiGroupResults: RegenerateImageBatchResponse['images'] = [];

      for (let i = 0; i < geminiRequests.length; i += GEMINI_CONCURRENT_LIMIT) {
        const chunk = geminiRequests.slice(i, i + GEMINI_CONCURRENT_LIMIT);
        console.log(`[이미지 재생성 배치] Gemini 청크 처리 시작 (${chunk.length}개, 인덱스 ${i}~${i + chunk.length - 1})...`);

        const geminiPromises = chunk.map(async (req) => {
        const requestStartTime = Date.now();
        const maxRetries = 3;
        let lastError: unknown = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              const delay = getRetryDelay(attempt - 1);
              console.log(`[이미지 재생성 배치] Gemini API 재시도 (인덱스 ${req.index}, 시도 ${attempt}/${maxRetries}, ${delay}ms 대기 후):`, {
                prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
                promptLength: req.stylePrompt.length,
              });
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              console.log(`[이미지 재생성 배치] Gemini API 호출 시작 (인덱스 ${req.index}):`, {
                prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
                promptLength: req.stylePrompt.length,
              });
            }

            const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
            
            if (hasCharacterSheets && characterSheets) {
              // 캐릭터 바꾸기: DB에서 가져온 프롬프트 사용 + 원본 이미지(1번) + 캐릭터시트 이미지들(2번 이후)
              // req.stylePrompt는 DB의 스타일 프롬프트 또는 사용자가 수정한 프롬프트
              contentParts.push({
                text: req.stylePrompt,
              });
              // 1번 이미지: 원본 이미지
              contentParts.push({
                inlineData: {
                  mimeType: mimeType,
                  data: imageBase64,
                },
              });
              // 2번 이후: 캐릭터시트 이미지들 (캐시에서 재사용)
              if (characterSheetImagesCache) {
                for (const sheetImage of characterSheetImagesCache) {
                  contentParts.push({
                    inlineData: {
                      mimeType: sheetImage.mimeType,
                      data: sheetImage.base64,
                    },
                  });
                }
              }
            } else if (refImages.length > 0) {
              contentParts.push({ text: req.stylePrompt });
              contentParts.push({
                inlineData: {
                  mimeType: mimeType,
                  data: imageBase64,
                },
              });
              // 여러 레퍼런스 이미지 추가
              for (const refImage of refImages) {
                contentParts.push({
                  inlineData: {
                    mimeType: refImage.mimeType,
                    data: refImage.base64,
                  },
                });
              }
              console.log(`[이미지 재생성 배치] Gemini API 호출 (인덱스 ${req.index}): 레퍼런스 이미지 포함`, { count: refImages.length });
            } else {
              contentParts.push({ text: req.stylePrompt });
              contentParts.push({
                inlineData: {
                  mimeType: mimeType,
                  data: imageBase64,
                },
              });
            }

            const contents = [{
              role: 'user' as const,
              parts: contentParts,
            }];

            console.log(`[이미지 재생성 배치] Gemini API 호출 (인덱스 ${req.index}):`, {
              timeout: `${GEMINI_API_TIMEOUT}ms`,
            });

            const { base64: finalImageData, mimeType: finalMimeType } = await generateGeminiImage({
              provider: 'gemini',
              model,
              contents,
              config,
              timeoutMs: GEMINI_API_TIMEOUT,
              retries: 3,
            });

            const requestTime = Date.now() - requestStartTime;
            console.log(`[이미지 재생성 배치] Gemini API 호출 완료 (인덱스 ${req.index}):`, {
              requestTime: `${requestTime}ms`,
              imageDataLength: finalImageData.length,
              mimeType: finalMimeType,
            });

            // base64 데이터를 Buffer로 변환
            const imageBuffer = Buffer.from(finalImageData, 'base64');
            
            // 영구 파일과 같은 경로에 임시 파일 저장
            const extension = getExtensionFromMimeType(finalMimeType);
            const uuid = crypto.randomUUID().substring(0, 8);
            const baseFileName = sourceFile.file_name.replace(/\.[^/.]+$/, '') || 'regenerated';
            // 파일명 sanitize (한글 및 특수문자 처리)
            const sanitizedBaseFileName = baseFileName
              .replace(/[^a-zA-Z0-9._-]/g, '_') // 한글 및 특수문자를 언더스코어로 변환
              .substring(0, 100); // 파일명 길이 제한
            const fileName = `${sanitizedBaseFileName}-${uuid}${extension}`;
            const storagePath = `${sourceFile.cut_id}/${sourceFile.process_id}/${fileName}`;
            
            console.log(`[이미지 재생성 배치] 임시 파일 저장 시작 (인덱스 ${req.index}):`, storagePath);
            const { error: uploadError } = await supabase.storage
              .from('webtoon-files')
              .upload(storagePath, imageBuffer, {
                contentType: finalMimeType,
                upsert: false,
              });

            if (uploadError) {
              console.error(`[이미지 재생성 배치] 임시 파일 저장 실패 (인덱스 ${req.index}):`, {
                error: uploadError,
                storagePath,
                fileName,
                originalFileName: sourceFile.file_name,
              });
              
              // 파일명 재시도 (더 간단한 파일명 사용)
              const fallbackFileName = `regenerated-${uuid}${extension}`;
              const fallbackStoragePath = `${sourceFile.cut_id}/${sourceFile.process_id}/${fallbackFileName}`;
              
              console.log(`[이미지 재생성 배치] 재시도 - 간단한 파일명 사용 (인덱스 ${req.index}):`, fallbackStoragePath);
              const { error: retryError } = await supabase.storage
                .from('webtoon-files')
                .upload(fallbackStoragePath, imageBuffer, {
                  contentType: finalMimeType,
                  upsert: false,
                });
              
              if (retryError) {
                console.error(`[이미지 재생성 배치] 재시도도 실패 (인덱스 ${req.index}):`, retryError);
                // 저장 실패 시 기존 방식으로 fallback (base64 반환)
                return {
                  index: req.index,
                  imageData: finalImageData,
                  mimeType: finalMimeType,
                  apiProvider: 'gemini' as const,
                  fileId: '',
                  filePath: '',
                  fileUrl: '',
                  stylePrompt: req.stylePrompt,
                };
              }
              
              // 재시도 성공 시 fallback 경로 사용
              const { data: urlData } = supabase.storage
                .from('webtoon-files')
                .getPublicUrl(fallbackStoragePath);
              const fileUrl = urlData.publicUrl;
              
              // DB에 임시 파일 정보 저장 (is_temp = true)
              let imageWidth: number | undefined;
              let imageHeight: number | undefined;
              try {
                const metadata = await sharp(imageBuffer).metadata();
                imageWidth = metadata.width;
                imageHeight = metadata.height;
              } catch (error) {
                console.warn(`[이미지 재생성 배치] 메타데이터 추출 실패 (인덱스 ${req.index}):`, error);
              }
              
              const finalCreatedBy = createdBy || sourceFile.created_by;
              console.log(`[이미지 재생성 배치] 파일 저장 (인덱스 ${req.index}, Gemini fallback):`, {
                createdBy: createdBy || '없음 (원본 파일 생성자 사용)',
                sourceCreatedBy: sourceFile.created_by,
                finalCreatedBy,
              });
              
              const { data: fileData, error: dbError } = await supabase
                .from('files')
                .insert({
                  cut_id: sourceFile.cut_id,
                  process_id: sourceFile.process_id,
                  file_name: fallbackFileName,
                  file_path: fileUrl,
                  storage_path: fallbackStoragePath,
                  file_size: imageBuffer.length,
                  file_type: 'image',
                  mime_type: finalMimeType,
                  description: `AI 재생성: ${sourceFile.file_name}`,
                  prompt: req.stylePrompt,
                  created_by: finalCreatedBy,
                  source_file_id: sourceFile.id,
                  is_temp: true,
                  metadata: {
                    width: imageWidth,
                    height: imageHeight,
                    ...(req.styleId && { style_id: req.styleId }),
                    ...(req.styleKey && { style_key: req.styleKey }),
                    ...(req.styleName && { style_name: req.styleName }),
                  },
                })
                .select()
                .single();
              
              if (dbError || !fileData) {
                console.error(`[이미지 재생성 배치] DB 저장 실패 (인덱스 ${req.index}):`, dbError);
                await supabase.storage.from('webtoon-files').remove([fallbackStoragePath]);
                return {
                  index: req.index,
                  imageData: finalImageData,
                  mimeType: finalMimeType,
                  apiProvider: 'gemini' as const,
                  fileId: '',
                  filePath: '',
                  fileUrl: '',
                  stylePrompt: req.stylePrompt,
                };
              }
              
              return {
                index: req.index,
                fileId: fileData.id,
                filePath: fallbackStoragePath,
                fileUrl: fileUrl,
                mimeType: finalMimeType,
                apiProvider: 'gemini' as const,
                stylePrompt: req.stylePrompt,
                ...(req.styleId && { styleId: req.styleId }),
                ...(req.styleKey && { styleKey: req.styleKey }),
                ...(req.styleName && { styleName: req.styleName }),
              };
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
              console.warn(`[이미지 재생성 배치] 메타데이터 추출 실패 (인덱스 ${req.index}):`, error);
            }

            // DB에 임시 파일 정보 저장 (is_temp = true)
            const finalCreatedBy = createdBy || sourceFile.created_by;
            console.log(`[이미지 재생성 배치] 파일 저장 (인덱스 ${req.index}, Gemini):`, {
              createdBy: createdBy || '없음 (원본 파일 생성자 사용)',
              sourceCreatedBy: sourceFile.created_by,
              finalCreatedBy,
            });
            
            const { data: fileData, error: dbError } = await supabase
              .from('files')
              .insert({
                cut_id: sourceFile.cut_id,
                process_id: sourceFile.process_id,
                file_name: fileName,
                file_path: fileUrl,
                storage_path: storagePath,
                file_size: imageBuffer.length,
                file_type: 'image',
                mime_type: finalMimeType,
                description: `AI 재생성: ${sourceFile.file_name}`,
                prompt: req.stylePrompt,
                created_by: finalCreatedBy,
                source_file_id: sourceFile.id,
                is_temp: true,
                metadata: {
                  width: imageWidth,
                  height: imageHeight,
                },
              })
              .select()
              .single();

            if (dbError || !fileData) {
              console.error(`[이미지 재생성 배치] DB 저장 실패 (인덱스 ${req.index}):`, dbError);
              // Storage 파일은 삭제
              await supabase.storage.from('webtoon-files').remove([storagePath]);
              // 저장 실패 시 기존 방식으로 fallback (base64 반환)
              return {
                index: req.index,
                imageData: finalImageData,
                mimeType: finalMimeType,
                apiProvider: 'gemini' as const,
                fileId: '',
                filePath: '',
                fileUrl: '',
                stylePrompt: req.stylePrompt,
              };
            }

            console.log(`[이미지 재생성 배치] 임시 파일 저장 완료 (인덱스 ${req.index}):`, {
              fileId: fileData.id,
              storagePath,
              fileUrl,
              size: imageBuffer.length,
            });

            return {
              index: req.index,
              fileId: fileData.id,
              filePath: storagePath,
              fileUrl: fileUrl,
              mimeType: finalMimeType,
              apiProvider: 'gemini' as const,
              stylePrompt: req.stylePrompt,
              ...(req.styleId && { styleId: req.styleId }),
              ...(req.styleKey && { styleKey: req.styleKey }),
              ...(req.styleName && { styleName: req.styleName }),
            };
          } catch (error: unknown) {
            lastError = error;
            const isRetryable = isRetryableError(error);

            if (!isRetryable || attempt >= maxRetries) {
              console.error(`[이미지 재생성 배치] Gemini API 호출 실패 (인덱스 ${req.index}):`, {
                error: error instanceof Error ? error.message : String(error),
                attempt: attempt + 1,
              });
              throw error;
            }
          }
        }

          throw lastError || new Error('Gemini API 응답을 받을 수 없습니다.');
        });

        const chunkResults = await Promise.allSettled(geminiPromises);
        chunkResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            geminiGroupResults.push(result.value);
          } else {
            console.error(`[이미지 재생성 배치] Gemini 요청 실패:`, result.reason);
          }
        });
      }

      const geminiSuccessCount = geminiGroupResults.length;
      const geminiFailCount = geminiRequests.length - geminiSuccessCount;
      console.log(`[이미지 재생성 배치] Gemini 그룹 처리 완료: ${geminiSuccessCount}개 성공, ${geminiFailCount}개 실패`);
      
      return geminiGroupResults;
    };

    const processSeedreamGroup = async (): Promise<RegenerateImageBatchResponse['images']> => {
      if (seedreamRequests.length === 0 || !seedreamImages || !seedreamSize) {
        return [];
      }
      
      // 원본 파일 정보를 클로저로 전달
      const sourceFile = file;

      console.log(`[이미지 재생성 배치] Seedream 그룹 처리 시작 (${seedreamRequests.length}개 요청)...`);
      if (!SEEDREAM_API_KEY) {
        console.error('[이미지 재생성 배치] SEEDREAM_API_KEY가 설정되지 않음');
        throw new Error('SEEDREAM_API_KEY가 설정되지 않았습니다.');
      }

      // Seedream 요청들을 2개씩 청크로 나누어 처리
      const SEEDREAM_CONCURRENT_LIMIT = 2;
      const seedreamGroupResults: RegenerateImageBatchResponse['images'] = [];

      for (let i = 0; i < seedreamRequests.length; i += SEEDREAM_CONCURRENT_LIMIT) {
        const chunk = seedreamRequests.slice(i, i + SEEDREAM_CONCURRENT_LIMIT);
        console.log(`[이미지 재생성 배치] Seedream 청크 처리 시작 (${chunk.length}개, 인덱스 ${i}~${i + chunk.length - 1})...`);

        const seedreamPromises = chunk.map(async (req) => {
          const maxRetries = 3;
          let lastError: unknown;

          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              const requestStartTime = Date.now();
              console.log(`[이미지 재생성 배치] Seedream API 호출 시작 (인덱스 ${req.index}):`, {
                prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
                promptLength: req.stylePrompt.length,
              });

              const { base64: generatedImageData, mimeType: generatedImageMimeType } = await generateSeedreamImage({
                provider: 'seedream',
                model: 'seedream-4-5-251128',
                prompt: req.stylePrompt,
                images: seedreamImages,
                responseFormat: 'url',
                size: seedreamSize,
                stream: false,
                watermark: true,
                timeoutMs: SEEDREAM_API_TIMEOUT,
                retries: 3,
              });

            const requestTime = Date.now() - requestStartTime;
            console.log(`[이미지 재생성 배치] Seedream API 호출 완료 (인덱스 ${req.index}):`, {
              requestTime: `${requestTime}ms`,
              imageDataLength: generatedImageData.length,
              mimeType: generatedImageMimeType,
            });

            // base64 데이터를 Buffer로 변환
            const imageBuffer = Buffer.from(generatedImageData, 'base64');
            
            // 영구 파일과 같은 경로에 임시 파일 저장
            const extension = getExtensionFromMimeType(generatedImageMimeType || 'image/png');
            const uuid = crypto.randomUUID().substring(0, 8);
            const baseFileName = sourceFile.file_name.replace(/\.[^/.]+$/, '') || 'regenerated';
            // 파일명 sanitize (한글 및 특수문자 처리)
            const sanitizedBaseFileName = baseFileName
              .replace(/[^a-zA-Z0-9._-]/g, '_') // 한글 및 특수문자를 언더스코어로 변환
              .substring(0, 100); // 파일명 길이 제한
            const fileName = `${sanitizedBaseFileName}-${uuid}${extension}`;
            const storagePath = `${sourceFile.cut_id}/${sourceFile.process_id}/${fileName}`;
            
            console.log(`[이미지 재생성 배치] 임시 파일 저장 시작 (인덱스 ${req.index}):`, storagePath);
            const { error: uploadError } = await supabase.storage
              .from('webtoon-files')
              .upload(storagePath, imageBuffer, {
                contentType: generatedImageMimeType || 'image/png',
                upsert: false,
              });

            if (uploadError) {
              console.error(`[이미지 재생성 배치] 임시 파일 저장 실패 (인덱스 ${req.index}):`, {
                error: uploadError,
                storagePath,
                fileName,
                originalFileName: sourceFile.file_name,
              });
              
              // 파일명 재시도 (더 간단한 파일명 사용)
              const fallbackFileName = `regenerated-${uuid}${extension}`;
              const fallbackStoragePath = `${sourceFile.cut_id}/${sourceFile.process_id}/${fallbackFileName}`;
              
              console.log(`[이미지 재생성 배치] 재시도 - 간단한 파일명 사용 (인덱스 ${req.index}):`, fallbackStoragePath);
              const { error: retryError } = await supabase.storage
                .from('webtoon-files')
                .upload(fallbackStoragePath, imageBuffer, {
                  contentType: generatedImageMimeType || 'image/png',
                  upsert: false,
                });
              
              if (retryError) {
                console.error(`[이미지 재생성 배치] 재시도도 실패 (인덱스 ${req.index}):`, retryError);
                // 저장 실패 시 기존 방식으로 fallback (base64 반환)
                return {
                  index: req.index,
                  imageData: generatedImageData,
                  mimeType: generatedImageMimeType || 'image/png',
                  apiProvider: 'seedream' as const,
                  fileId: '',
                  filePath: '',
                  fileUrl: '',
                  stylePrompt: req.stylePrompt,
                };
              }
              
              // 재시도 성공 시 fallback 경로 사용
              const { data: urlData } = supabase.storage
                .from('webtoon-files')
                .getPublicUrl(fallbackStoragePath);
              const fileUrl = urlData.publicUrl;
              
              // DB에 임시 파일 정보 저장 (is_temp = true)
              let imageWidth: number | undefined;
              let imageHeight: number | undefined;
              try {
                const metadata = await sharp(imageBuffer).metadata();
                imageWidth = metadata.width;
                imageHeight = metadata.height;
              } catch (error) {
                console.warn(`[이미지 재생성 배치] 메타데이터 추출 실패 (인덱스 ${req.index}):`, error);
              }
              
              const finalCreatedBy = createdBy || sourceFile.created_by;
              console.log(`[이미지 재생성 배치] 파일 저장 (인덱스 ${req.index}, Seedream fallback):`, {
                createdBy: createdBy || '없음 (원본 파일 생성자 사용)',
                sourceCreatedBy: sourceFile.created_by,
                finalCreatedBy,
              });
              
              const { data: fileData, error: dbError } = await supabase
                .from('files')
                .insert({
                  cut_id: sourceFile.cut_id,
                  process_id: sourceFile.process_id,
                  file_name: fallbackFileName,
                  file_path: fileUrl,
                  storage_path: fallbackStoragePath,
                  file_size: imageBuffer.length,
                  file_type: 'image',
                  mime_type: generatedImageMimeType || 'image/png',
                  description: `AI 재생성: ${sourceFile.file_name}`,
                  prompt: req.stylePrompt,
                  created_by: finalCreatedBy,
                  source_file_id: sourceFile.id,
                  is_temp: true,
                  metadata: {
                    width: imageWidth,
                    height: imageHeight,
                    ...(req.styleId && { style_id: req.styleId }),
                    ...(req.styleKey && { style_key: req.styleKey }),
                    ...(req.styleName && { style_name: req.styleName }),
                  },
                })
                .select()
                .single();
              
              if (dbError || !fileData) {
                console.error(`[이미지 재생성 배치] DB 저장 실패 (인덱스 ${req.index}):`, dbError);
                await supabase.storage.from('webtoon-files').remove([fallbackStoragePath]);
                return {
                  index: req.index,
                  imageData: generatedImageData,
                  mimeType: generatedImageMimeType || 'image/png',
                  apiProvider: 'seedream' as const,
                  fileId: '',
                  filePath: '',
                  fileUrl: '',
                  stylePrompt: req.stylePrompt,
                };
              }
              
              return {
                index: req.index,
                fileId: fileData.id,
                filePath: fallbackStoragePath,
                fileUrl: fileUrl,
                mimeType: generatedImageMimeType || 'image/png',
                apiProvider: 'seedream' as const,
                stylePrompt: req.stylePrompt,
                ...(req.styleId && { styleId: req.styleId }),
                ...(req.styleKey && { styleKey: req.styleKey }),
                ...(req.styleName && { styleName: req.styleName }),
              };
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
              console.warn(`[이미지 재생성 배치] 메타데이터 추출 실패 (인덱스 ${req.index}):`, error);
            }

            // DB에 임시 파일 정보 저장 (is_temp = true)
            const finalCreatedBy = createdBy || sourceFile.created_by;
            console.log(`[이미지 재생성 배치] 파일 저장 (인덱스 ${req.index}, Seedream):`, {
              createdBy: createdBy || '없음 (원본 파일 생성자 사용)',
              sourceCreatedBy: sourceFile.created_by,
              finalCreatedBy,
            });
            
            const { data: fileData, error: dbError } = await supabase
              .from('files')
              .insert({
                cut_id: sourceFile.cut_id,
                process_id: sourceFile.process_id,
                file_name: fileName,
                file_path: fileUrl,
                storage_path: storagePath,
                file_size: imageBuffer.length,
                file_type: 'image',
                mime_type: generatedImageMimeType || 'image/png',
                description: `AI 재생성: ${sourceFile.file_name}`,
                prompt: req.stylePrompt,
                created_by: finalCreatedBy,
                source_file_id: sourceFile.id,
                is_temp: true,
                metadata: {
                  width: imageWidth,
                  height: imageHeight,
                },
              })
              .select()
              .single();

            if (dbError || !fileData) {
              console.error(`[이미지 재생성 배치] DB 저장 실패 (인덱스 ${req.index}):`, dbError);
              // Storage 파일은 삭제
              await supabase.storage.from('webtoon-files').remove([storagePath]);
              // 저장 실패 시 기존 방식으로 fallback (base64 반환)
              return {
                index: req.index,
                imageData: generatedImageData,
                mimeType: generatedImageMimeType || 'image/png',
                apiProvider: 'seedream' as const,
                fileId: '',
                filePath: '',
                fileUrl: '',
                stylePrompt: req.stylePrompt,
              };
            }

            console.log(`[이미지 재생성 배치] 임시 파일 저장 완료 (인덱스 ${req.index}):`, {
              fileId: fileData.id,
              storagePath,
              fileUrl,
              size: imageBuffer.length,
            });

            return {
              index: req.index,
              fileId: fileData.id,
              filePath: storagePath,
              fileUrl: fileUrl,
              mimeType: generatedImageMimeType || 'image/png',
              apiProvider: 'seedream' as const,
              stylePrompt: req.stylePrompt,
              ...(req.styleId && { styleId: req.styleId }),
              ...(req.styleKey && { styleKey: req.styleKey }),
              ...(req.styleName && { styleName: req.styleName }),
            };
            } catch (error: unknown) {
              lastError = error;
              const isRetryable = isRetryableError(error);

              if (!isRetryable || attempt >= maxRetries) {
                throw error;
              }
            }
          }

          throw lastError || new Error('Seedream API 응답을 받을 수 없습니다.');
        });

        const chunkResults = await Promise.allSettled(seedreamPromises);
        chunkResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            seedreamGroupResults.push(result.value);
          } else {
            console.error(`[이미지 재생성 배치] Seedream 요청 실패:`, result.reason);
          }
        });
      }

      const seedreamSuccessCount = seedreamGroupResults.length;
      const seedreamFailCount = seedreamRequests.length - seedreamSuccessCount;
      console.log(`[이미지 재생성 배치] Seedream 그룹 처리 완료: ${seedreamSuccessCount}개 성공, ${seedreamFailCount}개 실패`);
      
      return seedreamGroupResults;
    };

    // Gemini와 Seedream 그룹을 병렬 처리
    console.log('[이미지 재생성 배치] Gemini와 Seedream 그룹 병렬 처리 시작...');
    const [geminiResults, seedreamResults] = await Promise.all([
      processGeminiGroup().catch((error) => {
        console.error('[이미지 재생성 배치] Gemini 그룹 처리 실패:', error);
        return [];
      }),
      processSeedreamGroup().catch((error) => {
        console.error('[이미지 재생성 배치] Seedream 그룹 처리 실패:', error);
        return [];
      }),
    ]);

    // 결과 합치기
    results.push(...geminiResults, ...seedreamResults);

    const totalTime = Date.now() - startTime;
    console.log('[이미지 재생성 배치] 배치 재생성 완료:', {
      totalTime: `${totalTime}ms`,
      totalRequests: requests.length,
      successCount: results.length,
      failCount: requests.length - results.length,
      geminiCount: geminiRequests.length,
      seedreamCount: seedreamRequests.length,
    });

    return NextResponse.json({
      images: results,
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[이미지 재생성 배치] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`
    });
    const errorMessage = error instanceof Error ? error.message : '이미지 재생성 중 오류가 발생했습니다.';
    return NextResponse.json(
      {
        error: errorMessage,
        details: {
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }
      },
      { status: 500 }
    );
  }
}

