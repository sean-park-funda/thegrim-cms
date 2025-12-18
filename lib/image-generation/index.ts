import { generateGeminiImage } from './providers/gemini';
import { generateSeedreamImage } from './providers/seedream';
import type {
  GenerateImageRequest,
  GenerateImageResult,
  GeminiContent,
  GeminiContentPart,
  GeminiRequest,
  ImageProvider,
  InlineImage,
  SeedreamRequest,
} from './types';

export type {
  GenerateImageRequest,
  GenerateImageResult,
  GeminiContent,
  GeminiContentPart,
  GeminiRequest,
  ImageProvider,
  InlineImage,
  SeedreamRequest,
};

export async function generateImage(request: GenerateImageRequest): Promise<GenerateImageResult> {
  if (request.provider === 'gemini') {
    return generateGeminiImage(request);
  }

  return generateSeedreamImage(request);
}

export { generateGeminiImage, generateSeedreamImage };




