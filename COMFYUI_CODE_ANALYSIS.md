# ComfyUI 서비스 코드 분석 문서

이 문서는 thegrim-cms 프로젝트에서 ComfyUI 서비스를 사용하는 코드를 분석하고 정리한 문서입니다.

## 목차

1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [코드 구조](#코드-구조)
4. [API 엔드포인트 사용 현황](#api-엔드포인트-사용-현황)
5. [주요 컴포넌트 분석](#주요-컴포넌트-분석)
6. [데이터 흐름](#데이터-흐름)
7. [에러 처리](#에러-처리)
8. [개선 사항 및 권장사항](#개선-사항-및-권장사항)

---

## 개요

### ComfyUI 서비스란?

ComfyUI는 워크플로우 기반 AI 이미지 생성 서비스입니다. 이 프로젝트에서는 외부 API 서버(`https://api.rewardpang.com/thegrim-cms/comfyui/`)를 통해 ComfyUI 기능을 사용합니다.

### 현재 사용 현황

- **사용 위치**: 테스트 페이지(`/comfy-test`)에서만 사용
- **프로덕션 기능**: 이미지 재생성 등 주요 기능에서는 Gemini/Seedream API 사용
- **목적**: 워크플로우 테스트 및 이미지 생성 기능 검증

### 외부 API 서버 정보

- **Base URL**: `https://api.rewardpang.com/thegrim-cms/comfyui/`
- **CORS**: `https://thegrim-cms.vercel.app`에서 접근 가능
- **타임아웃**: 기본 300초 (5분)

---

## 아키텍처

### 전체 구조

```
┌─────────────────┐
│  Next.js App    │
│  (Frontend)     │
└────────┬────────┘
         │
         │ HTTP Request
         │
┌────────▼────────────────────────┐
│  External ComfyUI API Server     │
│  api.rewardpang.com/thegrim-cms │
│  /comfyui/*                     │
└─────────────────────────────────┘
         │
         │
┌────────▼────────┐
│   ComfyUI       │
│   Backend       │
└─────────────────┘
```

### 통신 방식

- **프로토콜**: HTTPS
- **인증**: 현재 인증 없음 (공개 API)
- **데이터 형식**: JSON
- **이미지 제공**: 생성된 이미지는 서버에 저장되고 URL로 제공

---

## 코드 구조

### 파일 구조

```
thegrim-cms/
├── app/
│   └── comfy-test/
│       └── page.tsx          # ComfyUI 테스트 페이지
├── components/
│   └── Navigation.tsx         # 네비게이션 (ComfyUI 테스트 링크)
└── COMFYUI_API_GUIDE.md      # API 사용 가이드 문서
```

### 주요 파일

#### 1. `app/comfy-test/page.tsx`

ComfyUI 테스트를 위한 전용 페이지 컴포넌트입니다.

**주요 기능:**
- 워크플로우 리스트 조회
- 이미지 생성 (프롬프트 기반)
- 워크플로우 테스트 (프롬프트 없이)
- 생성된 이미지 표시 및 URL 복사

**상태 관리:**
```typescript
- workflows: WorkflowInfo[]           // 워크플로우 리스트
- selectedWorkflow: string            // 선택된 워크플로우
- prompt: string                      // 프롬프트
- negativePrompt: string              // 네거티브 프롬프트
- seed: string                        // 시드 값
- useRandomSeed: boolean              // 랜덤 시드 사용 여부
- loading: boolean                    // 이미지 생성 중
- testLoading: boolean                // 워크플로우 테스트 중
- imageUrl: string | null             // 생성된 이미지 URL
- error: string | null                // 에러 메시지
```

#### 2. `components/Navigation.tsx`

네비게이션 바에 ComfyUI 테스트 페이지 링크를 포함합니다.

```166:168:components/Navigation.tsx
                onClick={() => router.push('/comfy-test')}
                className="flex items-center gap-2"
                title="ComfyUI 테스트"
```

---

## API 엔드포인트 사용 현황

### 1. GET `/comfyui/workflows`

**용도**: 사용 가능한 워크플로우 리스트 조회

**사용 위치**: `app/comfy-test/page.tsx`

**코드:**
```40:59:app/comfy-test/page.tsx
  // 워크플로우 리스트 로드
  const loadWorkflows = async () => {
    setLoadingWorkflows(true);
    setError(null);
    try {
      const response = await fetch('https://api.rewardpang.com/thegrim-cms/comfyui/workflows');
      if (!response.ok) {
        throw new Error('워크플로우 리스트를 불러올 수 없습니다');
      }
      const data = await response.json();
      setWorkflows(data.workflows || []);
      if (data.workflows && data.workflows.length > 0 && !selectedWorkflow) {
        setSelectedWorkflow(data.workflows[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '워크플로우 리스트 로드 실패');
    } finally {
      setLoadingWorkflows(false);
    }
  };
```

**응답 형식:**
```typescript
{
  workflows: Array<{
    name: string;        // 워크플로우 파일명
    size: number;        // 파일 크기 (bytes)
    modified: string;    // 수정 시간 (ISO 8601)
  }>
}
```

### 2. POST `/comfyui/generate`

**용도**: 프롬프트를 사용하여 이미지 생성

**사용 위치**: `app/comfy-test/page.tsx`

**코드:**
```72:123:app/comfy-test/page.tsx
  const generateImage = async () => {
    if (!selectedWorkflow) {
      setError('워크플로우를 선택해주세요');
      return;
    }
    if (!prompt.trim()) {
      setError('프롬프트를 입력해주세요');
      return;
    }

    setLoading(true);
    setError(null);
    setImageUrl(null);

    try {
      const response = await fetch(
        'https://api.rewardpang.com/thegrim-cms/comfyui/generate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workflow_name: selectedWorkflow,
            prompt: prompt.trim(),
            negative_prompt: negativePrompt.trim() || '',
            seed: useRandomSeed ? -1 : parseInt(seed) || -1,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const data: GenerateResponse = await response.json();
      setImageUrl(data.image_url);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('504') || err.name === 'AbortError') {
          setError('작업이 타임아웃되었습니다. 다시 시도해주세요.');
        } else {
          setError(err.message);
        }
      } else {
        setError('알 수 없는 오류가 발생했습니다');
      }
    } finally {
      setLoading(false);
    }
  };
```

**요청 형식:**
```typescript
{
  workflow_name: string;      // 워크플로우 파일명 (필수)
  prompt: string;             // 프롬프트 (필수)
  negative_prompt?: string;    // 네거티브 프롬프트 (선택)
  seed?: number;              // 시드 값 (-1이면 랜덤)
}
```

**응답 형식:**
```typescript
{
  image_url: string;          // 생성된 이미지 URL
  prompt_id: string;           // 프롬프트 ID (UUID)
  workflow_name: string;       // 사용된 워크플로우 이름
}
```

### 3. POST `/comfyui/test`

**용도**: 프롬프트 주입 없이 워크플로우 테스트

**사용 위치**: `app/comfy-test/page.tsx`

**코드:**
```125:170:app/comfy-test/page.tsx
  // 워크플로우 테스트 (프롬프트 없이)
  const testWorkflow = async () => {
    if (!selectedWorkflow) {
      setError('워크플로우를 선택해주세요');
      return;
    }

    setTestLoading(true);
    setError(null);
    setImageUrl(null);

    try {
      const response = await fetch(
        'https://api.rewardpang.com/thegrim-cms/comfyui/test',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workflow_name: selectedWorkflow,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const data: GenerateResponse = await response.json();
      setImageUrl(data.image_url);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('504') || err.name === 'AbortError') {
          setError('작업이 타임아웃되었습니다. 다시 시도해주세요.');
        } else {
          setError(err.message);
        }
      } else {
        setError('알 수 없는 오류가 발생했습니다');
      }
    } finally {
      setTestLoading(false);
    }
  };
```

**요청 형식:**
```typescript
{
  workflow_name: string;  // 워크플로우 파일명 (필수)
}
```

**응답 형식:**
```typescript
{
  image_url: string;      // 생성된 이미지 URL
  prompt_id: string;      // 프롬프트 ID (UUID)
  workflow_name: string; // 사용된 워크플로우 이름
}
```

### 4. GET `/comfyui/images/{filename}`

**용도**: 생성된 이미지 제공

**사용 위치**: 이미지 URL을 통해 직접 접근

**예시:**
```
https://api.rewardpang.com/thegrim-cms/comfyui/images/20251127_221609_24b42e35.png
```

**응답**: PNG 이미지 파일 (Content-Type: `image/png`)

---

## 주요 컴포넌트 분석

### ComfyTestPage 컴포넌트

**위치**: `app/comfy-test/page.tsx`

**역할**: ComfyUI 테스트를 위한 UI 제공

**주요 기능:**

1. **워크플로우 관리**
   - 워크플로우 리스트 자동 로드 (컴포넌트 마운트 시)
   - 워크플로우 수동 새로고침
   - 워크플로우 선택

2. **이미지 생성**
   - 프롬프트 입력
   - 네거티브 프롬프트 입력
   - 시드 값 설정 (랜덤/고정)
   - 이미지 생성 실행

3. **워크플로우 테스트**
   - 프롬프트 주입 없이 워크플로우 실행
   - 워크플로우 기본 설정으로 이미지 생성

4. **결과 표시**
   - 생성된 이미지 표시
   - 이미지 URL 표시 및 복사
   - 새 창에서 이미지 열기

5. **에러 처리**
   - 네트워크 에러 처리
   - 타임아웃 에러 처리
   - 사용자 친화적 에러 메시지 표시

**UI 구조:**
```
┌─────────────────────────────────────┐
│  헤더 (돌아가기, 제목)               │
└─────────────────────────────────────┘
┌──────────────────┬──────────────────┐
│  입력 패널        │  결과 패널        │
│  - 워크플로우     │  - 로딩 상태      │
│  - 프롬프트       │  - 생성 이미지    │
│  - 네거티브       │  - 이미지 URL    │
│  - 시드 설정      │                  │
│  - 생성 버튼      │                  │
└──────────────────┴──────────────────┘
┌─────────────────────────────────────┐
│  사용 가이드                          │
└─────────────────────────────────────┘
```

**인증:**
- 로그인한 사용자만 접근 가능
- 미로그인 시 `/login`으로 리다이렉트

```66:70:app/comfy-test/page.tsx
  // 로그인 확인
  if (!user || !profile) {
    router.push('/login');
    return null;
  }
```

---

## 데이터 흐름

### 이미지 생성 플로우

```
1. 사용자 입력
   ├─ 워크플로우 선택
   ├─ 프롬프트 입력
   ├─ 네거티브 프롬프트 입력 (선택)
   └─ 시드 값 설정

2. API 요청
   POST /comfyui/generate
   {
     workflow_name: "...",
     prompt: "...",
     negative_prompt: "...",
     seed: -1
   }

3. 외부 API 서버 처리
   ├─ 워크플로우 파일 로드
   ├─ 프롬프트 주입
   ├─ ComfyUI 실행
   ├─ 이미지 생성
   └─ 이미지 저장

4. 응답 수신
   {
     image_url: "https://...",
     prompt_id: "...",
     workflow_name: "..."
   }

5. UI 업데이트
   ├─ 이미지 URL 저장
   ├─ 이미지 표시
   └─ 로딩 상태 해제
```

### 워크플로우 리스트 로드 플로우

```
1. 컴포넌트 마운트
   └─ useEffect 실행

2. API 요청
   GET /comfyui/workflows

3. 응답 수신
   {
     workflows: [
       { name: "...", size: ..., modified: "..." },
       ...
     ]
   }

4. 상태 업데이트
   ├─ workflows 상태 업데이트
   └─ 첫 번째 워크플로우 자동 선택
```

---

## 에러 처리

### 에러 타입별 처리

#### 1. 네트워크 에러

```typescript
catch (err) {
  if (err instanceof Error) {
    // 타임아웃 에러
    if (err.message.includes('504') || err.name === 'AbortError') {
      setError('작업이 타임아웃되었습니다. 다시 시도해주세요.');
    } else {
      // 기타 네트워크 에러
      setError(err.message);
    }
  } else {
    setError('알 수 없는 오류가 발생했습니다');
  }
}
```

#### 2. HTTP 에러

```typescript
if (!response.ok) {
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
}
```

#### 3. 유효성 검사 에러

```typescript
// 워크플로우 미선택
if (!selectedWorkflow) {
  setError('워크플로우를 선택해주세요');
  return;
}

// 프롬프트 미입력
if (!prompt.trim()) {
  setError('프롬프트를 입력해주세요');
  return;
}
```

### 에러 표시

에러는 UI에 빨간색 배경의 메시지로 표시됩니다:

```338:342:app/comfy-test/page.tsx
              {/* 에러 메시지 */}
              {error && (
                <div className="p-3 text-sm bg-destructive/10 text-destructive rounded-md">
                  {error}
                </div>
              )}
```

---

## 개선 사항 및 권장사항

### 현재 문제점

1. **코드 중복**
   - API URL이 하드코딩되어 있음
   - 에러 처리 로직이 중복됨

2. **타입 안정성**
   - API 응답 타입이 컴포넌트 내부에만 정의됨
   - 재사용 가능한 타입 정의 부재

3. **에러 처리**
   - 타임아웃 설정이 없음 (기본 브라우저 타임아웃에 의존)
   - 재시도 로직 없음

4. **코드 구조**
   - API 호출 로직이 컴포넌트에 직접 포함됨
   - 재사용 가능한 유틸리티 함수 부재

### 권장 개선 사항

#### 1. API 유틸리티 함수 생성

**`lib/api/comfyui.ts`** 파일 생성:

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_COMFYUI_API_URL || 
  'https://api.rewardpang.com/thegrim-cms';

export interface WorkflowInfo {
  name: string;
  size: number;
  modified: string;
}

export interface GenerateImageRequest {
  workflow_name: string;
  prompt: string;
  negative_prompt?: string;
  seed?: number;
}

export interface GenerateImageResponse {
  image_url: string;
  prompt_id: string;
  workflow_name: string;
}

export async function getWorkflows(): Promise<WorkflowInfo[]> {
  const response = await fetch(`${API_BASE_URL}/comfyui/workflows`);
  if (!response.ok) {
    throw new Error('워크플로우 리스트를 불러올 수 없습니다');
  }
  const data = await response.json();
  return data.workflows || [];
}

export async function generateImage(
  request: GenerateImageRequest
): Promise<GenerateImageResponse> {
  const response = await fetch(`${API_BASE_URL}/comfyui/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow_name: request.workflow_name,
      prompt: request.prompt,
      negative_prompt: request.negative_prompt || '',
      seed: request.seed ?? -1,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export async function testWorkflow(
  workflowName: string
): Promise<GenerateImageResponse> {
  const response = await fetch(`${API_BASE_URL}/comfyui/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow_name: workflowName }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}
```

#### 2. 커스텀 훅 생성

**`lib/hooks/useComfyUI.ts`** 파일 생성:

```typescript
import { useState } from 'react';
import { 
  getWorkflows, 
  generateImage, 
  testWorkflow,
  type WorkflowInfo,
  type GenerateImageRequest,
  type GenerateImageResponse 
} from '@/lib/api/comfyui';

export function useComfyUI() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const loadWorkflows = async () => {
    setLoadingWorkflows(true);
    setError(null);
    try {
      const data = await getWorkflows();
      setWorkflows(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '워크플로우 로드 실패';
      setError(message);
      throw err;
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const generate = async (request: GenerateImageRequest) => {
    setLoading(true);
    setError(null);
    setImageUrl(null);
    try {
      const result = await generateImage(request);
      setImageUrl(result.image_url);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '이미지 생성 실패';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const test = async (workflowName: string) => {
    setTestLoading(true);
    setError(null);
    setImageUrl(null);
    try {
      const result = await testWorkflow(workflowName);
      setImageUrl(result.image_url);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '워크플로우 테스트 실패';
      setError(message);
      throw err;
    } finally {
      setTestLoading(false);
    }
  };

  return {
    workflows,
    loadingWorkflows,
    loading,
    testLoading,
    error,
    imageUrl,
    loadWorkflows,
    generate,
    test,
    clearError: () => setError(null),
    clearImage: () => setImageUrl(null),
  };
}
```

#### 3. 타임아웃 설정

```typescript
const TIMEOUT_MS = 300000; // 5분

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('요청이 타임아웃되었습니다');
    }
    throw error;
  }
}
```

#### 4. 환경 변수 설정

**`.env.local`** 파일에 추가:

```env
NEXT_PUBLIC_COMFYUI_API_URL=https://api.rewardpang.com/thegrim-cms
```

### 향후 확장 가능성

1. **이미지 재생성 기능 통합**
   - 현재는 Gemini/Seedream만 사용
   - ComfyUI도 옵션으로 추가 가능

2. **워크플로우 관리**
   - 워크플로우 업로드 기능
   - 워크플로우 편집 기능

3. **배치 처리**
   - 여러 이미지 동시 생성
   - 큐 시스템 구현

4. **히스토리 관리**
   - 생성된 이미지 히스토리 저장
   - 재사용 가능한 프롬프트 저장

---

## 참고 자료

- [ComfyUI API 사용 가이드](./COMFYUI_API_GUIDE.md) - API 사용법 및 예시
- [프로젝트 구조 문서](./PROJECT_STRUCTURE.md) - 전체 프로젝트 구조
- [아키텍처 문서](./ARCHITECTURE.md) - 시스템 아키텍처

---

## 변경 이력

- 2025-01-XX: 초기 문서 작성

