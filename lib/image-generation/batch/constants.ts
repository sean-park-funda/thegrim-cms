/** Seedream API 타임아웃 (ms) */
export const SEEDREAM_API_TIMEOUT = 60000; // 60초

/** Gemini API 타임아웃 (ms) */
export const GEMINI_API_TIMEOUT = 120000; // 120초 (이미지 생성이 더 오래 걸릴 수 있음)

/** Seedream 최대 이미지 크기 (bytes) */
export const SEEDREAM_MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/** Seedream 최대 픽셀 수 */
export const SEEDREAM_MAX_PIXELS = 36000000; // 36,000,000 픽셀

/** 이미지 다운로드 타임아웃 (ms) */
export const IMAGE_DOWNLOAD_TIMEOUT = 30000; // 30초

/** 레퍼런스 이미지 리사이징 캐시 최대 크기 */
export const MAX_CACHE_SIZE = 100;

/** 동시 처리 제한 */
export const GEMINI_CONCURRENT_LIMIT = 2;
export const SEEDREAM_CONCURRENT_LIMIT = 2;

/** Gemini API에서 지원하는 이미지 비율 목록 */
export const GEMINI_ASPECT_RATIOS = [
  '21:9', '16:9', '4:3', '3:2',
  '1:1',
  '9:16', '3:4', '2:3',
  '5:4', '4:5',
] as const;

/** Seedream API에서 지원하는 이미지 비율 목록 */
export const SEEDREAM_ASPECT_RATIOS = [
  '21:9', '16:9', '4:3', '3:2',
  '1:1',
  '9:16', '3:4', '2:3',
] as const;

/** Gemini 모델명 */
export const GEMINI_MODEL = 'gemini-3-pro-image-preview';

/** Seedream 모델명 */
export const SEEDREAM_MODEL = 'seedream-4-5-251128';
