import type { ImageProvider } from '../types';

/** 개별 이미지 재생성 요청 */
export interface RegenerateImageRequest {
  stylePrompt: string;
  index: number;
  apiProvider: ImageProvider;
  styleId?: string;
  styleKey?: string;
  styleName?: string;
}

/** 배치 재생성 요청 */
export interface RegenerateImageBatchRequest {
  fileId: string;
  requests: RegenerateImageRequest[];
  characterSheets?: Array<{ sheetId: string }>;
  referenceFileId?: string;
  referenceFileIds?: string[];
  createdBy?: string;
}

/** 처리된 이미지 결과 (성공 또는 실패) */
export interface ProcessedImage {
  index: number;
  fileId?: string;
  filePath?: string;
  fileUrl?: string;
  mimeType?: string;
  apiProvider: ImageProvider;
  stylePrompt: string;
  imageData?: string;
  styleId?: string;
  styleKey?: string;
  styleName?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** 배치 재생성 응답 */
export interface RegenerateImageBatchResponse {
  images: ProcessedImage[];
}

/** 소스 파일 정보 (DB에서 조회한 파일) */
export interface SourceFile {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  cut_id: string;
  process_id: string;
  created_by?: string;
}

/** 레퍼런스 파일 정보 */
export interface ReferenceFile {
  file_path: string;
}

/** 다운로드된 이미지 데이터 */
export interface ImageData {
  base64: string;
  mimeType: string;
}

/** 다운로드 결과 */
export interface DownloadedImages {
  imageBuffer: Buffer;
  imageBase64: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  refImages: ImageData[];
  characterSheetImages: ImageData[];
}

/** 임시 파일 저장 파라미터 */
export interface SaveTempFileParams {
  imageData: string;
  mimeType: string;
  sourceFile: SourceFile;
  stylePrompt: string;
  createdBy?: string;
  styleId?: string;
  styleKey?: string;
  styleName?: string;
}

/** 저장된 파일 정보 */
export interface SavedFile {
  fileId: string;
  filePath: string;
  fileUrl: string;
  storagePath: string;
}

/** Gemini 배치 처리 파라미터 */
export interface GeminiProcessParams {
  requests: RegenerateImageRequest[];
  sourceFile: SourceFile;
  imageBase64: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  refImages: ImageData[];
  characterSheetImages: ImageData[];
  createdBy?: string;
}

/** Seedream 배치 처리 파라미터 */
export interface SeedreamProcessParams {
  requests: RegenerateImageRequest[];
  sourceFile: SourceFile;
  imageBuffer: Buffer;
  imageBase64: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  refImages: ImageData[];
  characterSheetImages: ImageData[];
  createdBy?: string;
}
