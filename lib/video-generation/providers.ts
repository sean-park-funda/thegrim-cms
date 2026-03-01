// Video Test Lab — Provider 추상화 인터페이스

export type InputMode = 'single_image' | 'start_end_frame' | 'multi_reference';

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

export interface VideoGenRequest {
  provider: string;
  prompt: string;
  inputMode: InputMode;
  images: { base64: string; mimeType: string; role: 'start' | 'end' | 'reference' }[];
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
