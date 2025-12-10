import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import crypto from 'crypto';
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
  
  targetWidth = Math.round(targetWidth / 8) * 8;
  targetHeight = Math.round(targetHeight / 8) * 8;
  
  return `${targetWidth}x${targetHeight}`;
}

interface RegenerateImageRequest {
  stylePrompt: string;
  index: number;
  apiProvider: 'gemini' | 'seedream';
}

interface RegenerateImageBatchRequest {
  characterSheets?: Array<{ sheetId: string }>; // 캐릭터시트 정보 (sheetId만 필요, file_path는 DB에서 조회)
  fileId: string;
  referenceFileId?: string;
  requests: RegenerateImageRequest[];
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
    const { fileId, referenceFileId, requests, characterSheets } = body;
    
    const hasCharacterSheets = !!(characterSheets && characterSheets.length > 0);
    
    // 캐릭터시트가 있으면 모든 요청을 Gemini로 변경
    if (hasCharacterSheets) {
      console.log('[이미지 재생성 배치] 캐릭터 바꾸기 모드: 모든 요청을 Gemini로 변경');
      requests.forEach(req => {
        req.apiProvider = 'gemini';
      });
    }

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
      referenceFileId: referenceFileId || '없음',
      requestCount: requests.length,
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
    // reference_files 테이블과 files 테이블 모두에서 조회 시도
    let referenceFile: { file_path: string } | null = null;
    if (referenceFileId) {
      // 먼저 reference_files 테이블에서 조회 시도
      const { data: refFile, error: refFileError } = await supabase
        .from('reference_files')
        .select('file_path')
        .eq('id', referenceFileId)
        .single();

      if (refFileError || !refFile) {
        // reference_files에서 찾지 못하면 files 테이블에서 조회 시도
        console.log('[이미지 재생성 배치] reference_files에서 찾지 못함, files 테이블에서 조회 시도...');
        const { data: regularFile, error: regularFileError } = await supabase
          .from('files')
          .select('file_path')
          .eq('id', referenceFileId)
          .single();

        if (regularFileError || !regularFile) {
          console.error('[이미지 재생성 배치] 레퍼런스 파일 조회 실패 (reference_files 및 files 모두):', refFileError || regularFileError);
          return NextResponse.json(
            { error: '레퍼런스 파일을 찾을 수 없습니다.' },
            { status: 404 }
          );
        }
        referenceFile = regularFile;
        console.log('[이미지 재생성 배치] files 테이블에서 레퍼런스 파일 찾음');
      } else {
        referenceFile = refFile;
        console.log('[이미지 재생성 배치] reference_files 테이블에서 레퍼런스 파일 찾음');
      }
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
    
    // 원본 이미지와 레퍼런스 이미지를 병렬로 다운로드
    const downloadPromises: Array<Promise<{ buffer: Buffer; mimeType: string; isReference: boolean }>> = [
      fetchWithTimeout(file.file_path, {}, IMAGE_DOWNLOAD_TIMEOUT)
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
            isReference: false,
          };
        }),
    ];

    if (referenceFile) {
      console.log('[이미지 재생성 배치] 레퍼런스 이미지 다운로드 시작...');
      downloadPromises.push(
        fetchWithTimeout(referenceFile.file_path, {}, IMAGE_DOWNLOAD_TIMEOUT)
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`레퍼런스 이미지 다운로드 실패: ${response.status} ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log('[이미지 재생성 배치] 레퍼런스 이미지 다운로드 완료:', {
              size: buffer.length,
              mimeType: response.headers.get('content-type') || 'image/jpeg',
            });
            return {
              buffer,
              mimeType: response.headers.get('content-type') || 'image/jpeg',
              isReference: true,
            };
          })
      );
    }

    const downloadResults = await Promise.allSettled(downloadPromises);

    // 원본 이미지 처리
    const imageResult = downloadResults[0];
    if (imageResult.status === 'rejected') {
      console.error('[이미지 재생성 배치] 이미지 다운로드 실패:', imageResult.reason);
      return NextResponse.json(
        { error: '이미지를 가져올 수 없습니다.' },
        { status: 400 }
      );
    }
    if (imageResult.value.isReference) {
      return NextResponse.json(
        { error: '원본 이미지 다운로드 결과가 잘못되었습니다.' },
        { status: 500 }
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
    let refImageBase64: string | undefined;
    let refMimeType: string | undefined;
    if (referenceFile) {
      const refResult = downloadResults[1];
      if (refResult.status === 'rejected') {
        console.error('[이미지 재생성 배치] 레퍼런스 이미지 다운로드 실패:', refResult.reason);
        return NextResponse.json(
          { error: '레퍼런스 이미지를 가져올 수 없습니다.' },
          { status: 400 }
        );
      }
      if (!refResult.value.isReference) {
        return NextResponse.json(
          { error: '레퍼런스 이미지 다운로드 결과가 잘못되었습니다.' },
          { status: 500 }
        );
      }

      const refBuffer = refResult.value.buffer;
      refImageBase64 = refBuffer.toString('base64');
      refMimeType = refResult.value.mimeType;
    }

    // Provider별로 그룹화
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
      if (refImageBase64 && refMimeType) {
        console.log('[이미지 재생성 배치] 레퍼런스 이미지 리사이징 시작 (Seedream용)...');
        const refResizeStartTime = Date.now();
        const cacheKey = referenceFileId 
          ? `id:${referenceFileId}`
          : `base64:${crypto.createHash('sha256').update(refImageBase64).digest('hex')}`;
        
        let refResizeResult: { base64: string; mimeType: string; resized: boolean };
        if (referenceImageResizeCache.has(cacheKey)) {
          refResizeResult = referenceImageResizeCache.get(cacheKey)!;
          console.log('[이미지 재생성 배치] 레퍼런스 이미지 리사이징 결과 캐시에서 재사용');
        } else {
          const refBuffer = Buffer.from(refImageBase64, 'base64');
          refResizeResult = await resizeImageIfNeeded(refBuffer);
          const refResizeTime = Date.now() - refResizeStartTime;
          console.log('[이미지 재생성 배치] 레퍼런스 이미지 리사이징 완료:', {
            resized: refResizeResult.resized,
            resizeTime: `${refResizeTime}ms`,
            originalBase64Length: refImageBase64.length,
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
        
        const finalRefBase64 = refResizeResult.resized ? refResizeResult.base64 : refImageBase64;
        const finalRefMimeType = refResizeResult.resized ? refResizeResult.mimeType : refMimeType;
        const refDataUrl = `data:${finalRefMimeType};base64,${finalRefBase64}`;
        seedreamImages.push(refDataUrl);
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
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const model = 'gemini-3-pro-image-preview';

      const imageConfig: { imageSize: string; aspectRatio?: string } = {
        imageSize: '1K',
      };
      if (aspectRatio) {
        imageConfig.aspectRatio = aspectRatio;
      }

      const config = {
        responseModalities: ['IMAGE', 'TEXT'],
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
            } else if (refImageBase64 && refMimeType) {
              contentParts.push({ text: req.stylePrompt });
              contentParts.push({
                inlineData: {
                  mimeType: mimeType,
                  data: imageBase64,
                },
              });
              contentParts.push({
                inlineData: {
                  mimeType: refMimeType,
                  data: refImageBase64,
                },
              });
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

            // 타임아웃과 함께 API 호출
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

            const response = await Promise.race([apiPromise, timeoutPromise]);

            let generatedImageData: string | null = null;
            let generatedImageMimeType: string | null = null;

            // 스트림 읽기 타임아웃 설정
            const streamReadStartTime = Date.now();
            const STREAM_READ_TIMEOUT = GEMINI_API_TIMEOUT;

            try {
              const readStreamWithTimeout = async () => {
                for await (const chunk of response) {
                  // 타임아웃 체크
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
                        break;
                      }
                    }
                  }

                  if (generatedImageData) {
                    break;
                  }
                }
              };

              await Promise.race([
                readStreamWithTimeout(),
                new Promise<never>((_, reject) => {
                  setTimeout(() => {
                    reject(new Error(`스트림 읽기 타임아웃: ${STREAM_READ_TIMEOUT}ms 초과`));
                  }, STREAM_READ_TIMEOUT);
                }),
              ]);
            } catch (streamError) {
              if (streamError instanceof Error && streamError.message.includes('타임아웃')) {
                console.error(`[이미지 재생성 배치] 스트림 읽기 타임아웃 (인덱스 ${req.index}):`, streamError.message);
                throw streamError;
              }
              throw streamError;
            }

            if (!generatedImageData) {
              throw new Error('생성된 이미지를 받을 수 없습니다.');
            }

            const requestTime = Date.now() - requestStartTime;
            console.log(`[이미지 재생성 배치] Gemini API 호출 완료 (인덱스 ${req.index}):`, {
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
                  created_by: sourceFile.created_by,
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
                await supabase.storage.from('webtoon-files').remove([fallbackStoragePath]);
                return {
                  index: req.index,
                  imageData: generatedImageData,
                  mimeType: generatedImageMimeType || 'image/png',
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
                mimeType: generatedImageMimeType || 'image/png',
                apiProvider: 'gemini' as const,
                stylePrompt: req.stylePrompt,
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
                created_by: sourceFile.created_by,
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
              mimeType: generatedImageMimeType || 'image/png',
              apiProvider: 'gemini' as const,
              stylePrompt: req.stylePrompt,
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
        const requestStartTime = Date.now();
        const maxRetries = 3;
        let lastError: unknown = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              const delay = getRetryDelay(attempt - 1);
              console.log(`[이미지 재생성 배치] Seedream API 재시도 (인덱스 ${req.index}, 시도 ${attempt}/${maxRetries}, ${delay}ms 대기 후):`, {
                prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
                promptLength: req.stylePrompt.length,
              });
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              console.log(`[이미지 재생성 배치] Seedream API 호출 시작 (인덱스 ${req.index}):`, {
                prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
                promptLength: req.stylePrompt.length,
              });
            }

            const seedreamRequestBody: Record<string, unknown> = {
              model: 'seedream-4-0-250828',
              prompt: req.stylePrompt,
              image: seedreamImages,
              sequential_image_generation: 'disabled',
              response_format: 'url',
              size: seedreamSize,
              stream: false,
              watermark: true,
            };

            const seedreamResponse = await fetchWithTimeout(
              SEEDREAM_API_ENDPOINT,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
                },
                body: JSON.stringify(seedreamRequestBody),
              },
              SEEDREAM_API_TIMEOUT
            );

            if (!seedreamResponse.ok) {
              const errorText = await seedreamResponse.text().catch(() => '응답 본문을 읽을 수 없음');
              throw new Error(`Seedream API 오류: ${seedreamResponse.status} ${seedreamResponse.statusText}. ${errorText}`);
            }

            const seedreamData = await seedreamResponse.json();
            console.log(`[이미지 재생성 배치] Seedream API 응답 수신 (인덱스 ${req.index}):`, {
              hasData: !!seedreamData.data,
              dataLength: seedreamData.data?.length || 0,
            });

            let generatedImageData: string | null = null;
            let generatedImageMimeType: string | null = null;

            if (seedreamData.data && Array.isArray(seedreamData.data) && seedreamData.data[0]) {
              const imageResult = seedreamData.data[0];
              
              if (imageResult.url) {
                console.log(`[이미지 재생성 배치] Seedream 이미지 URL 받음 (인덱스 ${req.index}), 다운로드 시작...`);
                const imageResponse = await fetch(imageResult.url);
                if (imageResponse.ok) {
                  const imageBuffer = await imageResponse.arrayBuffer();
                  generatedImageData = Buffer.from(imageBuffer).toString('base64');
                  generatedImageMimeType = imageResponse.headers.get('content-type') || 'image/png';
                  console.log(`[이미지 재생성 배치] Seedream 이미지 다운로드 완료 (인덱스 ${req.index}):`, {
                    size: imageBuffer.byteLength,
                    mimeType: generatedImageMimeType,
                  });
                } else {
                  console.error(`[이미지 재생성 배치] Seedream 이미지 URL 다운로드 실패 (인덱스 ${req.index}):`, {
                    status: imageResponse.status,
                    statusText: imageResponse.statusText,
                  });
                }
              } else if (imageResult.b64_json) {
                console.log(`[이미지 재생성 배치] Seedream base64 이미지 받음 (인덱스 ${req.index})`);
                generatedImageData = imageResult.b64_json;
                generatedImageMimeType = 'image/png';
              }
            }

            if (!generatedImageData) {
              throw new Error('Seedream에서 생성된 이미지를 받을 수 없습니다.');
            }

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
                  created_by: sourceFile.created_by,
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
                created_by: sourceFile.created_by,
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
            };
          } catch (error: unknown) {
            lastError = error;
            const isRetryable = isRetryableError(error);

            if (!isRetryable || attempt >= maxRetries) {
              console.error(`[이미지 재생성 배치] Seedream API 호출 실패 (인덱스 ${req.index}):`, {
                error: error instanceof Error ? error.message : String(error),
                attempt: attempt + 1,
              });
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

