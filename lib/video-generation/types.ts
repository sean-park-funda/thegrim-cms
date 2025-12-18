export interface VeoRequestConfig {
  aspectRatio?: '16:9' | '9:16';
  durationSeconds?: 5 | 8;
  numberOfVideos?: 1 | 2;
  personGeneration?: 'dont_allow' | 'allow_adult';
}

export interface VeoRequest {
  apiKey?: string;
  model?: string;
  prompt: string;
  startImageBase64?: string;
  startImageMimeType?: string;
  endImageBase64?: string;
  endImageMimeType?: string;
  config?: VeoRequestConfig;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface VeoResult {
  videoBase64: string;
  mimeType: string;
  model: string;
  elapsedMs: number;
}

export interface VeoOperationStatus {
  done: boolean;
  response?: {
    generatedVideos: Array<{
      video: {
        videoBytes: string;
      };
    }>;
  };
  error?: {
    message: string;
    code?: string;
  };
}
