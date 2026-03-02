// Video Test Lab — Provider 추상화 인터페이스

export type InputMode = 'single_image' | 'start_end_frame' | 'multi_reference' | 'character_reference';

export interface ProviderCapabilities {
  id: string;
  name: string;
  inputModes: InputMode[];
  durations: number[];
  aspectRatios: string[];
  maxImages?: number;
  contentSafety: 'lenient' | 'moderate' | 'strict';
  costPerSec?: number;
  platform: 'direct' | 'fal.ai' | 'comfyui';
}

export interface VideoGenImage {
  role: 'start' | 'end' | 'reference';
  url?: string;          // 공개 URL (fal.ai 직접 전달)
  base64?: string;       // base64 fallback (Veo 등)
  mimeType: string;
  label?: string;        // 캐릭터 라벨 (Kling @Element 매핑용)
}

export interface VideoGenRequest {
  provider: string;
  prompt: string;
  inputMode: InputMode;
  images: VideoGenImage[];
  characterImages?: VideoGenImage[];  // character_reference 모드: 모델에 전달할 레퍼런스 이미지
  duration: number;
  aspectRatio: string;
}

export interface VideoGenResult {
  videoBase64: string;
  mimeType: string;
  provider: string;
  elapsedMs: number;
}

export interface VideoProvider {
  capabilities: ProviderCapabilities;
  generate(req: VideoGenRequest): Promise<VideoGenResult>;
}
