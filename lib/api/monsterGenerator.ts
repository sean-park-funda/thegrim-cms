// 타입을 monster-styles 모듈에서 re-export
export type { MonsterStyle } from '@/lib/monster-styles';
import type { MonsterStyle } from '@/lib/monster-styles';

export interface GenerateMonsterPromptResponse {
  prompt: string;
  imagePrompt?: string;
  negativePrompt?: string;
  aspectRatio?: string;
  style?: MonsterStyle;
  error?: string;
}

export interface GenerateMonsterImageResponse {
  fileId?: string | null;
  fileUrl?: string | null;
  imageData?: string; // 하위 호환성
  mimeType: string;
  error?: string;
}

export type ApiProvider = 'gemini' | 'seedream' | 'auto';

export async function generateMonsterPrompt(style: MonsterStyle = 'normal'): Promise<GenerateMonsterPromptResponse> {
  try {
    const response = await fetch('/api/generate-monster-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ style }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: '알 수 없는 오류가 발생했습니다.' }));
      return { prompt: '', error: errorData.error || '프롬프트 생성에 실패했습니다.' };
    }

    const data = await response.json();
    return {
      prompt: data.prompt || '',
      imagePrompt: data.imagePrompt || '',
      negativePrompt: data.negativePrompt || '',
      aspectRatio: data.aspectRatio || '1:1',
      style: data.style || style,
      error: data.error,
    };
  } catch (error) {
    console.error('프롬프트 생성 API 호출 실패:', error);
    return {
      prompt: '',
      error: error instanceof Error ? error.message : '프롬프트 생성 중 오류가 발생했습니다.',
    };
  }
}

export async function generateMonsterImage(
  prompt: string,
  aspectRatio?: string,
  cutId?: string,
  userId?: string,
  apiProvider: ApiProvider = 'auto'
): Promise<GenerateMonsterImageResponse> {
  try {
    const response = await fetch('/api/generate-monster-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, aspectRatio, cutId, userId, apiProvider }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: '알 수 없는 오류가 발생했습니다.' }));
      return {
        mimeType: 'image/png',
        error: errorData.error || '이미지 생성에 실패했습니다.',
      };
    }

    const data = await response.json();
    return {
      fileId: data.fileId || null,
      fileUrl: data.fileUrl || null,
      imageData: data.imageData || '', // 하위 호환성
      mimeType: data.mimeType || 'image/png',
      error: data.error,
    };
  } catch (error) {
    console.error('이미지 생성 API 호출 실패:', error);
    return {
      mimeType: 'image/png',
      error: error instanceof Error ? error.message : '이미지 생성 중 오류가 발생했습니다.',
    };
  }
}
