import type { SafetySetting } from '@google/genai';

export type ImageProvider = 'gemini' | 'seedream' | 'openai';

export type InlineImage = {
  mimeType: string;
  data: string; // base64 without data URL prefix
};

export type GeminiContentPart =
  | { text: string }
  | { inlineData: InlineImage };

export type GeminiContent = {
  role: 'user' | 'system' | 'model';
  parts: GeminiContentPart[];
};

export type GeminiRequestConfig = {
  responseModalities?: Array<'IMAGE' | 'TEXT'>;
  imageConfig?: {
    imageSize?: string;
    aspectRatio?: string;
  };
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  safetySettings?: SafetySetting[];
};

export type GeminiRequest = {
  provider: 'gemini';
  apiKey?: string;
  model?: string;
  contents: GeminiContent[];
  config?: GeminiRequestConfig;
  timeoutMs?: number;
  retries?: number;
};

export type SeedreamRequest = {
  provider: 'seedream';
  apiKey?: string;
  endpoint?: string;
  model?: string;
  prompt: string;
  images?: string[]; // data URLs
  size?: string;
  responseFormat?: 'url' | 'b64_json';
  stream?: boolean;
  watermark?: boolean;
  timeoutMs?: number;
  retries?: number;
};

export type OpenAIRequest = {
  provider: 'openai';
  apiKey?: string;
  model?: string;
  prompt: string;
  images?: string[]; // base64 data URLs (PNG preferred)
  aspectRatio?: string; // e.g. '16:9', '1:1', '9:16'
  timeoutMs?: number;
  retries?: number;
};

export type GenerateImageRequest = GeminiRequest | SeedreamRequest | OpenAIRequest;

export type GenerateImageResult = {
  base64: string;
  mimeType: string;
  provider: ImageProvider;
  model: string;
  elapsedMs: number;
  raw?: unknown;
};








