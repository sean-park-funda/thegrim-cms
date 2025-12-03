// SEEDREAM API 이미지 제한
const SEEDREAM_MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const SEEDREAM_MAX_PIXELS = 36000000; // 36,000,000 픽셀 (약 6000x6000)

/**
 * 이미지를 Canvas로 리사이즈합니다.
 * @param image 원본 이미지 (Image 또는 ImageBitmap)
 * @param targetWidth 목표 너비
 * @param targetHeight 목표 높이
 * @param quality JPEG 품질 (0-1)
 * @returns base64 인코딩된 이미지 데이터와 mimeType
 */
async function resizeImageWithCanvas(
  image: HTMLImageElement | ImageBitmap,
  targetWidth: number,
  targetHeight: number,
  quality: number = 0.85
): Promise<{ base64: string; mimeType: string; size: number }> {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context를 가져올 수 없습니다.');
  }
  
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  
  // JPEG로 변환 (blob으로 먼저 변환하여 정확한 크기 확인)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('이미지 변환 실패'));
          return;
        }
        
        // blob을 base64로 변환
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // data:image/jpeg;base64, 부분 제거
          const base64Data = base64.split(',')[1];
          
          resolve({
            base64: base64Data,
            mimeType: 'image/jpeg',
            size: blob.size, // 정확한 크기
          });
        };
        reader.onerror = () => reject(new Error('base64 변환 실패'));
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * 이미지 URL에서 이미지를 로드합니다.
 * @param imageUrl 이미지 URL
 * @returns Image 객체
 */
function loadImageFromUrl(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // CORS 허용
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(new Error(`이미지 로드 실패: ${imageUrl}`));
    img.src = imageUrl;
  });
}

/**
 * 이미지가 SEEDREAM API 제한을 초과하는지 확인하고 필요시 리사이즈합니다.
 * @param imageUrl 이미지 URL
 * @param maxSize 최대 파일 크기 (바이트, 기본값: 10MB)
 * @param maxPixels 최대 픽셀 수 (기본값: 36M픽셀)
 * @returns 리사이즈된 이미지의 base64 데이터와 mimeType
 */
export async function resizeImageIfNeeded(
  imageUrl: string,
  maxSize: number = SEEDREAM_MAX_IMAGE_SIZE,
  maxPixels: number = SEEDREAM_MAX_PIXELS
): Promise<{ base64: string; mimeType: string; resized: boolean }> {
  try {
    // 이미지 로드
    const img = await loadImageFromUrl(imageUrl);
    const originalWidth = img.width;
    const originalHeight = img.height;
    const currentPixels = originalWidth * originalHeight;
    
    // 원본 이미지 크기 추정 (대략적인 계산)
    // 실제 크기를 알기 위해 blob으로 변환
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const currentSize = blob.size;
    
    // 파일 크기와 픽셀 수 모두 제한 이내인 경우
    if (currentSize <= maxSize && currentPixels <= maxPixels) {
      // base64로 변환
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const mimeType = blob.type || 'image/jpeg';
      
      return {
        base64,
        mimeType,
        resized: false,
      };
    }
    
    console.log('[이미지 리사이징] 이미지 리사이즈 필요:', {
      currentSize: `${(currentSize / 1024 / 1024).toFixed(2)}MB`,
      maxSize: `${(maxSize / 1024 / 1024).toFixed(2)}MB`,
      currentPixels: `${(currentPixels / 1000000).toFixed(2)}M`,
      maxPixels: `${(maxPixels / 1000000).toFixed(2)}M`,
      dimensions: `${originalWidth}x${originalHeight}`,
    });
    
    // 픽셀 수 제한을 위한 스케일 계산
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;
    
    if (currentPixels > maxPixels) {
      // 픽셀 수를 maxPixels 이하로 줄이기 위한 스케일 계산
      const pixelScale = Math.sqrt(maxPixels / currentPixels) * 0.95; // 5% 여유
      targetWidth = Math.round(originalWidth * pixelScale);
      targetHeight = Math.round(originalHeight * pixelScale);
      console.log('[이미지 리사이징] 픽셀 수 제한으로 리사이즈:', `${originalWidth}x${originalHeight} -> ${targetWidth}x${targetHeight}`);
    }
    
    // 먼저 픽셀 수 제한에 맞게 리사이즈
    let quality = 0.85;
    let result = await resizeImageWithCanvas(img, targetWidth, targetHeight, quality);
    
    // 파일 크기도 확인
    if (result.size <= maxSize) {
      console.log('[이미지 리사이징] 리사이즈 성공:', `${(result.size / 1024 / 1024).toFixed(2)}MB (${targetWidth}x${targetHeight})`);
      return {
        base64: result.base64,
        mimeType: result.mimeType,
        resized: true,
      };
    }
    
    // 파일 크기 초과 시 품질을 낮추며 재시도
    for (quality = 0.8; quality >= 0.5; quality -= 0.1) {
      result = await resizeImageWithCanvas(img, targetWidth, targetHeight, quality);
      
      if (result.size <= maxSize) {
        console.log('[이미지 리사이징] 품질', `${Math.round(quality * 100)}%로 리사이즈 성공:`, `${(result.size / 1024 / 1024).toFixed(2)}MB (${targetWidth}x${targetHeight})`);
        return {
          base64: result.base64,
          mimeType: result.mimeType,
          resized: true,
        };
      }
    }
    
    // 그래도 초과하면 크기를 더 줄임
    for (let scale = 0.8; scale >= 0.4; scale -= 0.1) {
      const newWidth = Math.round(targetWidth * scale);
      const newHeight = Math.round(targetHeight * scale);
      
      result = await resizeImageWithCanvas(img, newWidth, newHeight, 0.7);
      
      if (result.size <= maxSize) {
        console.log('[이미지 리사이징]', `${Math.round(scale * 100)}% 추가 축소 성공:`, `${(result.size / 1024 / 1024).toFixed(2)}MB (${newWidth}x${newHeight})`);
        return {
          base64: result.base64,
          mimeType: result.mimeType,
          resized: true,
        };
      }
    }
    
    // 최소 크기로 강제 리사이즈
    result = await resizeImageWithCanvas(img, 2048, 2048, 0.6);
    console.log('[이미지 리사이징] 최소 크기로 리사이즈:', `${(result.size / 1024 / 1024).toFixed(2)}MB`);
    return {
      base64: result.base64,
      mimeType: result.mimeType,
      resized: true,
    };
  } catch (error) {
    console.error('[이미지 리사이징] 오류:', error);
    throw error;
  }
}

