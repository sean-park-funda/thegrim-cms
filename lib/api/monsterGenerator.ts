export interface GenerateMonsterPromptResponse {
  prompt: string;
  imagePrompt?: string;
  aspectRatio?: string;
  error?: string;
}

export interface GenerateMonsterImageResponse {
  fileId?: string | null;
  fileUrl?: string | null;
  imageData?: string; // 하위 호환성
  mimeType: string;
  error?: string;
}

export async function generateMonsterPrompt(): Promise<GenerateMonsterPromptResponse> {
  try {
    const response = await fetch('/api/generate-monster-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: '알 수 없는 오류가 발생했습니다.' }));
      return { prompt: '', error: errorData.error || '프롬프트 생성에 실패했습니다.' };
    }

    const data = await response.json();
    return {
      prompt: data.prompt || '',
      imagePrompt: data.imagePrompt || '',
      aspectRatio: data.aspectRatio || '1:1',
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
  userId?: string
): Promise<GenerateMonsterImageResponse> {
  try {
    const response = await fetch('/api/generate-monster-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, aspectRatio, cutId, userId }),
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

