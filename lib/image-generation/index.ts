import { generateGeminiImage } from './providers/gemini';
import { generateSeedreamImage } from './providers/seedream';
import { generateOpenAIImage } from './providers/openai';
import type {
  GenerateImageRequest,
  GenerateImageResult,
  GeminiContent,
  GeminiContentPart,
  GeminiRequest,
  ImageProvider,
  InlineImage,
  OpenAIRequest,
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
  OpenAIRequest,
  SeedreamRequest,
};

export async function generateImage(request: GenerateImageRequest): Promise<GenerateImageResult> {
  if (request.provider === 'gemini') return generateGeminiImage(request);
  if (request.provider === 'openai') return generateOpenAIImage(request);
  return generateSeedreamImage(request);
}

export { generateGeminiImage, generateSeedreamImage, generateOpenAIImage };








