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

// 에러 객체의 상세 정보를 추출하는 헬퍼 함수
function extractErrorDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {};

  if (error instanceof Error) {
    details.name = error.name;
    
    // message가 JSON 문자열인 경우 파싱 시도
    let parsedMessage: unknown = error.message;
    if (typeof error.message === 'string') {
      try {
        // JSON 문자열인지 확인하고 파싱 시도
        const trimmed = error.message.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          parsedMessage = JSON.parse(error.message);
        }
      } catch {
        // 파싱 실패 시 원본 메시지 사용
        parsedMessage = error.message;
      }
    }
    details.message = parsedMessage;
    details.stack = error.stack;

    // cause 속성이 있으면 재귀적으로 추출
    if (error.cause) {
      details.cause = extractErrorDetails(error.cause);
    }

    // Error 객체의 추가 속성들 추출 (타입 단언을 통해 접근)
    const errorObj = error as unknown as Record<string, unknown>;
    Object.keys(errorObj).forEach(key => {
      if (!['name', 'message', 'stack', 'cause'].includes(key)) {
        try {
          // 직렬화 가능한 값만 포함
          JSON.stringify(errorObj[key]);
          details[key] = errorObj[key];
        } catch {
          // 직렬화 불가능한 값은 문자열로 변환
          details[key] = String(errorObj[key]);
        }
      }
    });
  } else if (typeof error === 'object' && error !== null) {
    // Error 객체가 아닌 경우 모든 속성 추출
    const errorObj = error as Record<string, unknown>;
    Object.keys(errorObj).forEach(key => {
      try {
        JSON.stringify(errorObj[key]);
        details[key] = errorObj[key];
      } catch {
        details[key] = String(errorObj[key]);
      }
    });
  } else {
    details.value = String(error);
  }

  return details;
}

// 에러 타입과 사용자 메시지를 구분하는 함수
function categorizeError(error: unknown, provider: 'gemini' | 'seedream'): { code: string; message: string } {
  if (error instanceof Error) {
    // 타임아웃 에러
    if (error.message.includes('타임아웃') || error.message.includes('timeout') || error.message.includes('Timeout')) {
      return {
        code: provider === 'gemini' ? 'GEMINI_TIMEOUT' : 'SEEDREAM_TIMEOUT',
        message: `${provider === 'gemini' ? 'Gemini' : 'Seedream'} API 요청이 시간 초과되었습니다. 잠시 후 다시 시도해주세요.`,
      };
    }

    // ApiError인 경우 status 확인
    const errorObj = error as unknown as Record<string, unknown>;
    if ('status' in errorObj && typeof errorObj.status === 'number') {
      const status = errorObj.status;
      
      // 503 Service Unavailable (오버로드)
      if (status === 503) {
        // 메시지에 "overloaded" 포함 여부 확인
        const errorMessage = String(error.message || '');
        if (errorMessage.toLowerCase().includes('overload') || errorMessage.toLowerCase().includes('overloaded')) {
          return {
            code: provider === 'gemini' ? 'GEMINI_OVERLOAD' : 'SEEDREAM_OVERLOAD',
            message: `${provider === 'gemini' ? 'Gemini' : 'Seedream'} 서비스가 현재 과부하 상태입니다. 잠시 후 다시 시도해주세요.`,
          };
        }
        return {
          code: provider === 'gemini' ? 'GEMINI_SERVICE_UNAVAILABLE' : 'SEEDREAM_SERVICE_UNAVAILABLE',
          message: `${provider === 'gemini' ? 'Gemini' : 'Seedream'} 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.`,
        };
      }

      // 429 Too Many Requests
      if (status === 429) {
        return {
          code: provider === 'gemini' ? 'GEMINI_RATE_LIMIT' : 'SEEDREAM_RATE_LIMIT',
          message: `요청이 너무 많습니다. 잠시 후 다시 시도해주세요.`,
        };
      }
    }
  }

  // 기타 에러
  return {
    code: provider === 'gemini' ? 'GEMINI_ERROR' : 'SEEDREAM_ERROR',
    message: `이미지 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`,
  };
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
    fileId?: string; // 파일 ID (DB에 저장된, 성공 시에만 존재)
    filePath?: string; // 파일 경로 (Storage 경로, 성공 시에만 존재)
    fileUrl?: string; // 파일 URL (미리보기용, 성공 시에만 존재)
    mimeType?: string; // 성공 시에만 존재
    apiProvider: 'gemini' | 'seedream';
    stylePrompt: string; // 프롬프트 (히스토리용)
    imageData?: string; // 하위 호환성을 위해 선택적으로 유지 (임시 파일 저장 실패 시에만 사용)
    styleId?: string; // 스타일 ID
    styleKey?: string; // 스타일 키
    styleName?: string; // 스타일 이름
    // 에러 정보 (실패 시에만 존재)
    error?: {
      code: string; // 에러 코드 ('GEMINI_OVERLOAD', 'GEMINI_TIMEOUT', 'GEMINI_ERROR', 'SEEDREAM_ERROR' 등)
      message: string; // 사용자에게 표시할 메시지
      details?: unknown; // 상세 에러 정보 (디버깅용)
    };
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

        try {
            console.log(`[이미지 재생성 배치] Gemini API 호출 시작 (인덱스 ${req.index}):`, {
              prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
              promptLength: req.stylePrompt.length,
            });

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

                  // Gemini API 응답에서 에러 정보 확인
                  if (chunk.candidates && chunk.candidates[0]) {
                    const candidate = chunk.candidates[0];
                    // finishReason이 STOP이 아닌 경우는 실패로 간주
                    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                      const candidateAny = candidate as unknown as Record<string, unknown>;
                      const errorInfo: Record<string, unknown> = {
                        finishReason: candidate.finishReason,
                      };
                      if (candidate.safetyRatings) {
                        errorInfo.safetyRatings = candidate.safetyRatings;
                      }
                      if ('blockReason' in candidateAny && candidateAny.blockReason) {
                        errorInfo.blockReason = candidateAny.blockReason;
                      }
                      console.error(`[이미지 재생성 배치] Gemini API 응답에서 생성 실패 감지 (인덱스 ${req.index}):`, errorInfo);
                      throw new Error(`Gemini API 생성 실패: finishReason=${candidate.finishReason}`);
                    }
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
              console.error(`[이미지 재생성 배치] Gemini API 응답에 이미지 데이터 없음 (인덱스 ${req.index}):`, {
                requestIndex: req.index,
                promptLength: req.stylePrompt.length,
              });
              throw new Error('생성된 이미지를 받을 수 없습니다.');
            }

            // TypeScript 타입 가드: null 체크 후에는 string으로 확정
            const finalImageData: string = generatedImageData;
            const finalMimeType: string = generatedImageMimeType || 'image/png';

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
            const errorDetails = extractErrorDetails(error);
            const isTimeout = error instanceof Error && (
              error.message.includes('타임아웃') || 
              error.message.includes('timeout') ||
              error.message.includes('Timeout')
            );
            const errorType = isTimeout ? '타임아웃' : '일반 에러';
            
            console.error(`[이미지 재생성 배치] Gemini API 호출 실패 (인덱스 ${req.index}, ${errorType}):`, {
              errorDetails,
              requestIndex: req.index,
              promptLength: req.stylePrompt.length,
              promptPreview: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
              errorType,
            });
            throw error;
          }
        });

        const chunkResults = await Promise.allSettled(geminiPromises);
        chunkResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            geminiGroupResults.push(result.value);
          } else {
            console.error(`[이미지 재생성 배치] Gemini 요청 실패:`, result.reason);
            // 실패한 요청도 결과에 포함 (에러 정보와 함께)
            const failedRequest = chunk[index];
            if (failedRequest) {
              const errorInfo = categorizeError(result.reason, 'gemini');
              // 에러 정보 검증
              if (!errorInfo || !errorInfo.code || !errorInfo.message) {
                console.error(`[이미지 재생성 배치] categorizeError 반환값이 유효하지 않음 (인덱스 ${failedRequest.index}):`, errorInfo);
                errorInfo.code = 'GEMINI_ERROR';
                errorInfo.message = '이미지 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
              }
              const errorResult: RegenerateImageBatchResponse['images'][0] = {
                index: failedRequest.index,
                apiProvider: 'gemini',
                stylePrompt: failedRequest.stylePrompt,
                ...(failedRequest.styleId && { styleId: failedRequest.styleId }),
                ...(failedRequest.styleKey && { styleKey: failedRequest.styleKey }),
                ...(failedRequest.styleName && { styleName: failedRequest.styleName }),
                error: {
                  code: errorInfo.code,
                  message: errorInfo.message,
                },
              };
              console.log(`[이미지 재생성 배치] Gemini 에러 결과 생성 (인덱스 ${failedRequest.index}):`, {
                errorCode: errorResult.error?.code,
                errorMessage: errorResult.error?.message,
                fullResult: JSON.stringify(errorResult, null, 2),
              });
              geminiGroupResults.push(errorResult);
            }
          }
        });
      }

      // 성공한 것만 카운트 (error가 없는 것만)
      const geminiSuccessCount = geminiGroupResults.filter(r => !r.error).length;
      const geminiFailCount = geminiGroupResults.filter(r => !!r.error).length;
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

        try {
            console.log(`[이미지 재생성 배치] Seedream API 호출 시작 (인덱스 ${req.index}):`, {
              prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
              promptLength: req.stylePrompt.length,
            });

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
            const errorDetails = extractErrorDetails(error);
            console.error(`[이미지 재생성 배치] Seedream API 호출 실패 (인덱스 ${req.index}):`, {
              errorDetails,
              requestIndex: req.index,
              promptLength: req.stylePrompt.length,
              promptPreview: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
            });
            throw error;
          }
        });

        const chunkResults = await Promise.allSettled(seedreamPromises);
        chunkResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            seedreamGroupResults.push(result.value);
          } else {
            console.error(`[이미지 재생성 배치] Seedream 요청 실패:`, result.reason);
            // 실패한 요청도 결과에 포함 (에러 정보와 함께)
            const failedRequest = chunk[index];
            if (failedRequest) {
              const errorInfo = categorizeError(result.reason, 'seedream');
              // 에러 정보 검증
              if (!errorInfo || !errorInfo.code || !errorInfo.message) {
                console.error(`[이미지 재생성 배치] categorizeError 반환값이 유효하지 않음 (인덱스 ${failedRequest.index}):`, errorInfo);
                errorInfo.code = 'SEEDREAM_ERROR';
                errorInfo.message = '이미지 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
              }
              const errorResult: RegenerateImageBatchResponse['images'][0] = {
                index: failedRequest.index,
                apiProvider: 'seedream',
                stylePrompt: failedRequest.stylePrompt,
                ...(failedRequest.styleId && { styleId: failedRequest.styleId }),
                ...(failedRequest.styleKey && { styleKey: failedRequest.styleKey }),
                ...(failedRequest.styleName && { styleName: failedRequest.styleName }),
                error: {
                  code: errorInfo.code,
                  message: errorInfo.message,
                },
              };
              console.log(`[이미지 재생성 배치] Seedream 에러 결과 생성 (인덱스 ${failedRequest.index}):`, {
                errorCode: errorResult.error?.code,
                errorMessage: errorResult.error?.message,
                fullResult: JSON.stringify(errorResult, null, 2),
              });
              seedreamGroupResults.push(errorResult);
            }
          }
        });
      }

      // 성공한 것만 카운트 (error가 없는 것만)
      const seedreamSuccessCount = seedreamGroupResults.filter(r => !r.error).length;
      const seedreamFailCount = seedreamGroupResults.filter(r => !!r.error).length;
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
    
    // 최종 결과 로깅 (에러 확인용)
    const resultsWithErrors = results.filter(r => r.error);
    if (resultsWithErrors.length > 0) {
      console.log('[이미지 재생성 배치] 에러가 포함된 결과:', JSON.stringify(resultsWithErrors, null, 2));
    }

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

