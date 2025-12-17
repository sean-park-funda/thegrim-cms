import sharp from 'sharp';
import crypto from 'crypto';
import type { ImageProvider } from '../types';
import {
  GEMINI_ASPECT_RATIOS,
  SEEDREAM_ASPECT_RATIOS,
  SEEDREAM_MAX_IMAGE_SIZE,
  SEEDREAM_MAX_PIXELS,
  MAX_CACHE_SIZE,
} from './constants';

/** 리사이징 결과 타입 */
export interface ResizeResult {
  base64: string;
  mimeType: string;
  resized: boolean;
}

/** 레퍼런스 이미지 리사이징 결과 캐시 */
const referenceImageResizeCache = new Map<string, ResizeResult>();

/**
 * 원본 이미지 비율에 가장 가까운 지원 비율 반환
 */
export function getClosestAspectRatio(width: number, height: number, provider: ImageProvider): string {
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

/**
 * 이미지를 필요시 리사이징 (Seedream API 제한에 맞춤)
 */
export async function resizeImageIfNeeded(
  imageBuffer: Buffer,
  maxSize: number = SEEDREAM_MAX_IMAGE_SIZE,
  maxPixels: number = SEEDREAM_MAX_PIXELS
): Promise<ResizeResult> {
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

/**
 * Seedream API용 이미지 크기 계산
 */
export function calculateSeedreamSize(width: number, height: number): string {
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
  const area = targetWidth * targetHeight;
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

/**
 * MIME 타입에서 확장자 추출
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return mimeToExt[mimeType] || '.png';
}

/**
 * 캐시된 리사이징 수행 (레퍼런스/캐릭터시트 이미지용)
 */
export async function resizeImageWithCache(
  base64: string,
  mimeType: string,
  cachePrefix: string
): Promise<ResizeResult> {
  const cacheKey = `${cachePrefix}:${crypto.createHash('sha256').update(base64).digest('hex')}`;
  
  if (referenceImageResizeCache.has(cacheKey)) {
    return referenceImageResizeCache.get(cacheKey)!;
  }
  
  const buffer = Buffer.from(base64, 'base64');
  const result = await resizeImageIfNeeded(buffer);
  
  // 캐시 크기 제한
  if (referenceImageResizeCache.size >= MAX_CACHE_SIZE) {
    const firstKey = referenceImageResizeCache.keys().next().value;
    if (firstKey) {
      referenceImageResizeCache.delete(firstKey);
    }
  }
  
  referenceImageResizeCache.set(cacheKey, result);
  return result;
}

/**
 * 이미지 메타데이터 추출
 */
export async function getImageMetadata(imageBuffer: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(imageBuffer).metadata();
  return {
    width: metadata.width || 1920,
    height: metadata.height || 1080,
  };
}
