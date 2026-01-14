import { NextRequest, NextResponse } from 'next/server';

const EXTERNAL_API_URL = 'https://api.rewardpang.com/thegrim-cms/comfyui/generate';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // FormData에서 데이터 추출
    const workflowName = formData.get('workflow_name') as string;
    const prompt = formData.get('prompt') as string;
    const negativePrompt = (formData.get('negative_prompt') as string) || '';
    const seed = formData.get('seed') as string;
    const imageFile = formData.get('image') as File | null;

    // 필수 필드 검증
    if (!workflowName || !prompt) {
      return NextResponse.json(
        { error: 'workflow_name과 prompt는 필수입니다.' },
        { status: 400 }
      );
    }

    // 외부 서버로 전달할 FormData 생성
    const externalFormData = new FormData();
    externalFormData.append('workflow_name', workflowName);
    externalFormData.append('prompt', prompt);
    externalFormData.append('negative_prompt', negativePrompt);
    externalFormData.append('seed', seed || '-1');

    // 이미지 파일이 있으면 추가
    if (imageFile) {
      externalFormData.append('image', imageFile);
    }

    // 외부 API로 요청 전송
    const response = await fetch(EXTERNAL_API_URL, {
      method: 'POST',
      body: externalFormData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        detail: `HTTP error! status: ${response.status}`,
      }));
      return NextResponse.json(
        { error: errorData.detail || '이미지 생성에 실패했습니다.' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[comfyui/generate] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
