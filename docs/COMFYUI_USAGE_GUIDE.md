# ComfyUI 이미지 생성 사용 가이드

다른 코드에서 ComfyUI를 사용해 이미지를 생성할 때 참고하는 문서입니다.

---

## 전체 흐름

```
1. 워크플로우 목록 조회 (GET /comfyui/workflows)
2. 워크플로우 선택
3. 프롬프트 입력
4. (선택) 참조 이미지 추가
5. 이미지 생성 요청 (POST /api/comfyui/generate)
6. 생성된 이미지 URL 수신
```

---

## API 엔드포인트

### 1. 워크플로우 목록 조회

```typescript
const response = await fetch('https://api.rewardpang.com/thegrim-cms/comfyui/workflows');
const data = await response.json();
// data.workflows: WorkflowInfo[]
```

### 2. 이미지 생성 (우리 서버 API Route 사용)

**경로**: `/api/comfyui/generate`

**방식**: `multipart/form-data`

```typescript
const formData = new FormData();
formData.append('workflow_name', 'workflow_name.json');
formData.append('prompt', 'your prompt here');
formData.append('negative_prompt', 'blurry, low quality');
formData.append('seed', '-1'); // -1 = 랜덤

// 참조 이미지가 있는 경우
if (imageFile) {
  formData.append('image', imageFile);
}

const response = await fetch('/api/comfyui/generate', {
  method: 'POST',
  body: formData,
});

const data = await response.json();
// data.image_url: 생성된 이미지 URL
```

---

## 코드 예시

### React 컴포넌트에서 사용

```typescript
'use client';

import { useState } from 'react';

interface GenerateResponse {
  image_url: string;
  prompt_id: string;
  workflow_name: string;
}

export function useComfyUIGenerate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const generate = async ({
    workflowName,
    prompt,
    negativePrompt = '',
    seed = -1,
    imageFile,
  }: {
    workflowName: string;
    prompt: string;
    negativePrompt?: string;
    seed?: number;
    imageFile?: File | null;
  }) => {
    setLoading(true);
    setError(null);
    setImageUrl(null);

    try {
      const formData = new FormData();
      formData.append('workflow_name', workflowName);
      formData.append('prompt', prompt);
      formData.append('negative_prompt', negativePrompt);
      formData.append('seed', String(seed));

      if (imageFile) {
        formData.append('image', imageFile);
      }

      const response = await fetch('/api/comfyui/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data: GenerateResponse = await response.json();
      setImageUrl(data.image_url);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '이미지 생성 실패';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { generate, loading, error, imageUrl };
}
```

### 사용 예시

```typescript
const { generate, loading, error, imageUrl } = useComfyUIGenerate();

// 텍스트만으로 이미지 생성
await generate({
  workflowName: 'text2img_basic.json',
  prompt: 'a beautiful sunset over the ocean',
  negativePrompt: 'blurry, low quality',
});

// 참조 이미지와 함께 이미지 생성
await generate({
  workflowName: 'img2img_edit.json',
  prompt: 'add a rainbow in the sky',
  imageFile: selectedFile, // File 객체
});
```

---

## 파일 구조

```
app/
├── api/
│   └── comfyui/
│       └── generate/
│           └── route.ts      # 우리 서버 API Route (FormData → 외부 서버)
└── comfy-test/
    └── page.tsx              # ComfyUI 테스트 페이지 (UI 예시)
```

---

## API Route 구현 (`/api/comfyui/generate/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';

const EXTERNAL_API_URL = 'https://api.rewardpang.com/thegrim-cms/comfyui/generate';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const workflowName = formData.get('workflow_name') as string;
    const prompt = formData.get('prompt') as string;
    const negativePrompt = (formData.get('negative_prompt') as string) || '';
    const seed = formData.get('seed') as string;
    const imageFile = formData.get('image') as File | null;

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

    if (imageFile) {
      externalFormData.append('image', imageFile);
    }

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
      { error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

---

## 외부 서버 API 스펙

### 이미지 생성 (외부 서버 직접 호출)

**URL**: `https://api.rewardpang.com/thegrim-cms/comfyui/generate`

#### 방법 1: JSON 요청 (base64)

```json
{
  "workflow_name": "workflow.json",
  "prompt": "your prompt here",
  "negative_prompt": "",
  "seed": -1,
  "image_base64": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

#### 방법 2: multipart/form-data (파일 업로드)

```bash
curl -X POST "https://api.rewardpang.com/thegrim-cms/comfyui/generate" \
  -F "workflow_name=workflow.json" \
  -F "prompt=your prompt here" \
  -F "negative_prompt=" \
  -F "seed=-1" \
  -F "image=@/path/to/image.png"
```

### 응답

```json
{
  "image_url": "https://api.rewardpang.com/thegrim-cms/comfyui/images/20251127_221609_24b42e35.png",
  "prompt_id": "2304eeac-0df0-47c8-9d54-f4b125d39069",
  "workflow_name": "workflow.json"
}
```

---

## 파라미터 설명

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| `workflow_name` | string | ✅ | - | 워크플로우 JSON 파일명 |
| `prompt` | string | ✅ | - | 생성할 이미지에 대한 프롬프트 |
| `negative_prompt` | string | ❌ | `""` | 제외할 요소 프롬프트 |
| `seed` | number | ❌ | `-1` | 시드 값 (-1이면 랜덤) |
| `image` | File | ❌ | - | 참조 이미지 파일 (img2img 워크플로우용) |
| `image_base64` | string | ❌ | - | base64 인코딩된 이미지 (대안) |

---

## 타입 정의

```typescript
interface WorkflowInfo {
  name: string;
  size: number;
  modified: string;
}

interface GenerateRequest {
  workflow_name: string;
  prompt: string;
  negative_prompt?: string;
  seed?: number;
  image?: File;           // FormData용
  image_base64?: string;  // JSON용 (대안)
}

interface GenerateResponse {
  image_url: string;
  prompt_id: string;
  workflow_name: string;
}
```

---

## 주의사항

1. **이미지 생성 시간**: 약 4-5초 소요 (복잡한 워크플로우는 더 오래 걸릴 수 있음)
2. **타임아웃**: 기본 300초 (5분)
3. **워크플로우 선택**: 이미지 편집 기능을 사용하려면 img2img 타입 워크플로우 선택 필요
4. **CORS**: 우리 서버 API Route(`/api/comfyui/generate`)를 통해 요청하면 CORS 문제 없음

---

## 참고 파일

- `/app/comfy-test/page.tsx` - 전체 UI 구현 예시
- `/app/api/comfyui/generate/route.ts` - API Route 구현
- `/COMFYUI_API_GUIDE.md` - 상세 API 문서
