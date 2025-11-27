# ComfyUI API 사용 가이드

Next.js 클라이언트 개발자를 위한 ComfyUI 이미지 생성 API 사용 가이드입니다.

## 목차

1. [개요](#개요)
2. [API 엔드포인트](#api-엔드포인트)
3. [Next.js 통합 예시](#nextjs-통합-예시)
4. [에러 처리](#에러-처리)
5. [사용 예시](#사용-예시)
6. [주의사항](#주의사항)

---

## 개요

ComfyUI API는 텍스트 프롬프트를 받아 AI 이미지를 생성하고, 생성된 이미지의 URL을 반환합니다.

**API Base URL**: `https://api.rewardpang.com/thegrim-cms`

**프론트엔드 주소**: `https://thegrim-cms.vercel.app`

**주요 특징**:
- 비동기 이미지 생성 (약 4-5초 소요)
- 생성된 이미지는 서버에 저장되고 URL 제공
- 워크플로우 기반 이미지 생성
- CORS 설정 완료 (Vercel 프론트엔드에서 바로 사용 가능)

---

## API 엔드포인트

### GET /thegrim-cms/comfyui/workflows

사용 가능한 워크플로우 리스트를 조회하는 엔드포인트입니다.

#### 요청

**URL**: `https://api.rewardpang.com/thegrim-cms/comfyui/workflows`

**Method**: `GET`

#### 응답

**성공 (200 OK)**:
```json
{
  "workflows": [
    {
      "name": "text2img_basic.json",
      "size": 2456,
      "modified": "2025-11-27T12:34:56.789Z"
    },
    {
      "name": "another_workflow.json",
      "size": 3124,
      "modified": "2025-11-27T13:45:12.345Z"
    }
  ]
}
```

**응답 필드**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `workflows` | array | 워크플로우 리스트 |
| `workflows[].name` | string | 워크플로우 파일명 |
| `workflows[].size` | number | 파일 크기 (bytes) |
| `workflows[].modified` | string | 수정 시간 (ISO 8601 형식) |

### POST /thegrim-cms/comfyui/generate

이미지를 생성하는 엔드포인트입니다.

#### 요청

**URL**: `https://api.rewardpang.com/thegrim-cms/comfyui/generate`

**Method**: `POST`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "workflow_name": "text2img_basic.json",
  "prompt": "a beautiful sunset over the ocean",
  "negative_prompt": "blurry, low quality",
  "seed": 12345
}
```

**파라미터**:

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| `workflow_name` | string | 예 | - | 워크플로우 JSON 파일명 |
| `prompt` | string | 예 | - | 생성할 이미지에 대한 텍스트 프롬프트 |
| `negative_prompt` | string | 아니오 | `""` | 제외할 요소에 대한 네거티브 프롬프트 |
| `seed` | number | 아니오 | `-1` | 시드 값 (-1이면 랜덤) |

#### 응답

**성공 (200 OK)**:
```json
{
  "image_url": "https://api.rewardpang.com/thegrim-cms/comfyui/images/20251127_221609_24b42e35.png",
  "prompt_id": "2304eeac-0df0-47c8-9d54-f4b125d39069",
  "workflow_name": "text2img_basic.json"
}
```

**에러 응답**:

- `400 Bad Request`: 잘못된 요청
- `404 Not Found`: 워크플로우 파일을 찾을 수 없음
- `500 Internal Server Error`: 서버 오류
- `504 Gateway Timeout`: 작업 타임아웃 (기본 300초)

### GET /thegrim-cms/comfyui/images/{filename}

생성된 이미지를 제공하는 엔드포인트입니다.

**URL**: `https://api.rewardpang.com/thegrim-cms/comfyui/images/{filename}`

**Method**: `GET`

**예시**:
```
https://api.rewardpang.com/thegrim-cms/comfyui/images/20251127_221609_24b42e35.png
```

**응답**: PNG 이미지 파일 (Content-Type: `image/png`)

---

## Next.js 통합 예시

### 1. 기본 사용법 (Client Component)

```typescript
'use client'

import { useState, useEffect } from 'react'

interface GenerateResponse {
  image_url: string
  prompt_id: string
  workflow_name: string
}

interface WorkflowInfo {
  name: string
  size: number
  modified: string
}

export default function ImageGenerator() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingWorkflows, setLoadingWorkflows] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 컴포넌트 마운트 시 워크플로우 리스트 로드
  useEffect(() => {
    loadWorkflows()
  }, [])

  const loadWorkflows = async () => {
    setLoadingWorkflows(true)
    try {
      const response = await fetch('https://api.rewardpang.com/thegrim-cms/comfyui/workflows')
      if (!response.ok) throw new Error('워크플로우 리스트를 불러올 수 없습니다')
      const data = await response.json()
      setWorkflows(data.workflows)
      if (data.workflows.length > 0) {
        setSelectedWorkflow(data.workflows[0].name)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '워크플로우 리스트 로드 실패')
    } finally {
      setLoadingWorkflows(false)
    }
  }

  const generateImage = async () => {
    if (!prompt.trim()) {
      setError('프롬프트를 입력해주세요')
      return
    }

    if (!selectedWorkflow) {
      setError('워크플로우를 선택해주세요')
      return
    }

    setLoading(true)
    setError(null)
    setImageUrl(null)

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
            prompt: prompt,
            negative_prompt: negativePrompt || '',
            seed: -1, // 랜덤
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || '이미지 생성 실패')
      }

      const data: GenerateResponse = await response.json()
      setImageUrl(data.image_url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">이미지 생성</h1>
      
      <div className="space-y-4">
        <div>
          <label className="block mb-2">워크플로우 선택</label>
          {loadingWorkflows ? (
            <div className="p-2 border rounded bg-gray-50">워크플로우 로딩 중...</div>
          ) : (
            <select
              value={selectedWorkflow}
              onChange={(e) => setSelectedWorkflow(e.target.value)}
              className="w-full p-2 border rounded"
            >
              {workflows.length === 0 ? (
                <option value="">워크플로우가 없습니다</option>
              ) : (
                workflows.map((workflow) => (
                  <option key={workflow.name} value={workflow.name}>
                    {workflow.name}
                  </option>
                ))
              )}
            </select>
          )}
        </div>

        <div>
          <label className="block mb-2">프롬프트</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-2 border rounded"
            rows={3}
            placeholder="예: a beautiful sunset over the ocean"
          />
        </div>

        <div>
          <label className="block mb-2">네거티브 프롬프트 (선택)</label>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            className="w-full p-2 border rounded"
            rows={2}
            placeholder="예: blurry, low quality"
          />
        </div>

        <button
          onClick={generateImage}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
        >
          {loading ? '생성 중...' : '이미지 생성'}
        </button>

        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded">
            오류: {error}
          </div>
        )}

        {imageUrl && (
          <div className="mt-4">
            <h2 className="text-xl font-bold mb-2">생성된 이미지</h2>
            <img
              src={imageUrl}
              alt="Generated"
              className="max-w-full h-auto rounded shadow-lg"
            />
            <p className="mt-2 text-sm text-gray-600">
              이미지 URL: <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">{imageUrl}</a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

### 2. API 유틸리티 함수 (권장)

**`lib/comfyui-api.ts`**:

```typescript
const API_BASE_URL = 'https://api.rewardpang.com/thegrim-cms'

export interface GenerateImageRequest {
  workflow_name: string
  prompt: string
  negative_prompt?: string
  seed?: number
}

export interface GenerateImageResponse {
  image_url: string
  prompt_id: string
  workflow_name: string
}

export interface ApiError {
  detail: string
}

export interface WorkflowInfo {
  name: string
  size: number
  modified: string
}

export interface WorkflowListResponse {
  workflows: WorkflowInfo[]
}

export async function getWorkflows(): Promise<WorkflowListResponse> {
  const response = await fetch(`${API_BASE_URL}/comfyui/workflows`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error: ApiError = await response.json()
    throw new Error(error.detail || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export async function generateImage(
  request: GenerateImageRequest
): Promise<GenerateImageResponse> {
  const response = await fetch(`${API_BASE_URL}/comfyui/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workflow_name: request.workflow_name,
      prompt: request.prompt,
      negative_prompt: request.negative_prompt || '',
      seed: request.seed ?? -1,
    }),
  })

  if (!response.ok) {
    const error: ApiError = await response.json()
    throw new Error(error.detail || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export function getImageUrl(filename: string): string {
  return `${API_BASE_URL}/comfyui/images/${filename}`
}
```

**사용 예시**:

```typescript
'use client'

import { generateImage, getWorkflows } from '@/lib/comfyui-api'
import { useState, useEffect } from 'react'

export default function ImageGenerator() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingWorkflows, setLoadingWorkflows] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    loadWorkflows()
  }, [])

  const loadWorkflows = async () => {
    setLoadingWorkflows(true)
    try {
      const data = await getWorkflows()
      setWorkflows(data.workflows)
      if (data.workflows.length > 0) {
        setSelectedWorkflow(data.workflows[0].name)
      }
    } catch (error) {
      console.error('워크플로우 로드 실패:', error)
    } finally {
      setLoadingWorkflows(false)
    }
  }

  const handleGenerate = async () => {
    if (!selectedWorkflow || !prompt.trim()) {
      alert('워크플로우와 프롬프트를 입력해주세요')
      return
    }

    setLoading(true)
    try {
      const result = await generateImage({
        workflow_name: selectedWorkflow,
        prompt: prompt,
        negative_prompt: 'blurry',
        seed: 12345,
      })
      setImageUrl(result.image_url)
    } catch (error) {
      console.error('이미지 생성 실패:', error)
      alert(error instanceof Error ? error.message : '이미지 생성 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <label className="block mb-2">워크플로우</label>
        <select
          value={selectedWorkflow}
          onChange={(e) => setSelectedWorkflow(e.target.value)}
          className="w-full p-2 border rounded"
          disabled={loadingWorkflows}
        >
          {workflows.map((workflow) => (
            <option key={workflow.name} value={workflow.name}>
              {workflow.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block mb-2">프롬프트</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full p-2 border rounded"
          rows={3}
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !selectedWorkflow}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
      >
        {loading ? '생성 중...' : '이미지 생성'}
      </button>

      {imageUrl && (
        <div>
          <img src={imageUrl} alt="Generated" className="max-w-full" />
        </div>
      )}
    </div>
  )
}
```

### 3. Server Action 사용 (Server Component)

**`app/actions/comfyui.ts`**:

```typescript
'use server'

const API_BASE_URL = 'https://api.rewardpang.com/thegrim-cms'

export interface GenerateImageRequest {
  workflow_name: string
  prompt: string
  negative_prompt?: string
  seed?: number
}

export interface GenerateImageResponse {
  image_url: string
  prompt_id: string
  workflow_name: string
}

export async function generateImageAction(
  request: GenerateImageRequest
): Promise<{ success: true; data: GenerateImageResponse } | { success: false; error: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/comfyui/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_name: request.workflow_name,
        prompt: request.prompt,
        negative_prompt: request.negative_prompt || '',
        seed: request.seed ?? -1,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: error.detail || `HTTP error! status: ${response.status}`,
      }
    }

    const data: GenerateImageResponse = await response.json()
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    }
  }
}
```

**사용 예시**:

```typescript
import { generateImageAction } from '@/app/actions/comfyui'
import ImageGeneratorForm from './ImageGeneratorForm'

export default async function Page() {
  return <ImageGeneratorForm />
}
```

```typescript
'use client'

import { generateImageAction } from '@/app/actions/comfyui'
import { useState } from 'react'

export default function ImageGeneratorForm() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ image_url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (formData: FormData) => {
    setLoading(true)
    setError(null)
    setResult(null)

    const response = await generateImageAction({
      workflow_name: 'text2img_basic.json',
      prompt: formData.get('prompt') as string,
      negative_prompt: (formData.get('negative_prompt') as string) || '',
      seed: -1,
    })

    if (response.success) {
      setResult(response.data)
    } else {
      setError(response.error)
    }

    setLoading(false)
  }

  return (
    <form action={handleSubmit}>
      {/* 폼 내용 */}
    </form>
  )
}
```

### 4. React Hook 사용 (재사용 가능)

**`hooks/useComfyUI.ts`**:

```typescript
import { useState } from 'react'
import { generateImage, GenerateImageRequest, GenerateImageResponse } from '@/lib/comfyui-api'

export function useComfyUI() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateImageResponse | null>(null)

  const generate = async (request: GenerateImageRequest) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await generateImage(request)
      setResult(response)
      return response
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '이미지 생성 실패'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    generate,
    loading,
    error,
    result,
  }
}
```

**사용 예시**:

```typescript
'use client'

import { useComfyUI } from '@/hooks/useComfyUI'
import { useState } from 'react'

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState('')
  const { generate, loading, error, result } = useComfyUI()

  const handleGenerate = async () => {
    try {
      await generate({
        workflow_name: 'text2img_basic.json',
        prompt: prompt,
        negative_prompt: 'blurry',
      })
    } catch (err) {
      // 에러는 hook에서 처리됨
    }
  }

  return (
    <div>
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="프롬프트 입력"
      />
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? '생성 중...' : '생성'}
      </button>
      {error && <div className="error">{error}</div>}
      {result && <img src={result.image_url} alt="Generated" />}
    </div>
  )
}
```

---

## 에러 처리

### 에러 타입별 처리

```typescript
try {
  const response = await generateImage({
    workflow_name: 'text2img_basic.json',
    prompt: 'a cat',
  })
} catch (error) {
  if (error instanceof Error) {
    // HTTP 에러 처리
    if (error.message.includes('404')) {
      console.error('워크플로우를 찾을 수 없습니다')
    } else if (error.message.includes('500')) {
      console.error('서버 오류가 발생했습니다')
    } else if (error.message.includes('504')) {
      console.error('작업이 타임아웃되었습니다. 다시 시도해주세요')
    } else {
      console.error('이미지 생성 실패:', error.message)
    }
  }
}
```

### 타임아웃 처리

이미지 생성은 약 4-5초 정도 소요되지만, 복잡한 워크플로우의 경우 더 오래 걸릴 수 있습니다. 타임아웃을 적절히 설정하세요:

```typescript
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 120000) // 120초

try {
  const response = await fetch(
    'https://api.rewardpang.com/thegrim-cms/comfyui/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ /* ... */ }),
      signal: controller.signal,
    }
  )
  clearTimeout(timeoutId)
  // ...
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    console.error('요청이 타임아웃되었습니다')
  }
}
```

---

## 사용 예시

### 예시 1: 워크플로우 리스트 조회

```typescript
import { getWorkflows } from '@/lib/comfyui-api'

// 워크플로우 리스트 가져오기
const workflowsData = await getWorkflows()

console.log('사용 가능한 워크플로우:')
workflowsData.workflows.forEach((workflow) => {
  console.log(`- ${workflow.name} (${workflow.size} bytes, 수정: ${workflow.modified})`)
})

// 첫 번째 워크플로우 선택
const firstWorkflow = workflowsData.workflows[0]?.name
```

### 예시 2: 간단한 이미지 생성

```typescript
const result = await generateImage({
  workflow_name: 'text2img_basic.json',
  prompt: 'a beautiful sunset',
})

console.log('이미지 URL:', result.image_url)
// 이미지 URL: https://api.rewardpang.com/thegrim-cms/comfyui/images/20251127_221609_24b42e35.png
```

### 예시 3: 네거티브 프롬프트 포함

```typescript
const result = await generateImage({
  workflow_name: 'text2img_basic.json',
  prompt: 'a beautiful landscape with mountains',
  negative_prompt: 'blurry, low quality, distorted, people',
  seed: 12345, // 동일한 시드로 재현 가능
})
```

### 예시 4: 랜덤 시드 사용

```typescript
const result = await generateImage({
  workflow_name: 'text2img_basic.json',
  prompt: 'a cat sitting on a windowsill',
  negative_prompt: 'blurry',
  seed: -1, // 랜덤 시드 (기본값)
})
```

### 예시 5: 이미지 표시

```typescript
const [imageUrl, setImageUrl] = useState<string | null>(null)

const handleGenerate = async () => {
  const result = await generateImage({
    workflow_name: 'text2img_basic.json',
    prompt: 'a beautiful cat',
  })
  setImageUrl(result.image_url)
}

return (
  <div>
    {imageUrl && (
      <img
        src={imageUrl}
        alt="Generated"
        className="w-full h-auto"
        onError={() => console.error('이미지 로드 실패')}
      />
    )}
  </div>
)
```

---

## 주의사항

### 1. CORS 설정

**프론트엔드 주소**: `https://thegrim-cms.vercel.app`

현재 API는 모든 Origin을 동적으로 허용하도록 설정되어 있습니다. `thegrim-cms.vercel.app`에서의 요청은 CORS 문제 없이 정상적으로 작동합니다.

**CORS 헤더**:
- `Access-Control-Allow-Origin`: 요청한 Origin에 맞춰 동적으로 설정됨
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`
- `Access-Control-Allow-Headers: Authorization,Content-Type,X-Requested-With`

**Preflight 요청 (OPTIONS)**: 브라우저가 자동으로 보내는 OPTIONS 요청도 정상적으로 처리됩니다.

### 2. 요청 제한

- 이미지 생성은 비동기 작업이므로 약 4-5초 정도 소요됩니다
- 동시에 여러 요청을 보내면 ComfyUI 서버의 부하가 증가할 수 있습니다
- 필요시 요청 큐를 구현하거나 debounce를 사용하세요

### 3. 에러 처리

- 네트워크 오류, 타임아웃, 서버 오류 등 다양한 상황을 고려하여 에러 처리를 구현하세요
- 사용자에게 명확한 에러 메시지를 표시하세요

### 4. 이미지 URL

- 생성된 이미지 URL은 영구적으로 유지됩니다
- 이미지 파일은 서버에 저장되므로 삭제가 필요하면 별도 API가 필요할 수 있습니다

### 5. 프롬프트 작성 팁

- **Positive Prompt**: 원하는 이미지의 특징을 구체적으로 설명
  - 예: "a beautiful sunset over the ocean, vibrant colors, dramatic clouds"
- **Negative Prompt**: 제외하고 싶은 요소를 명시
  - 예: "blurry, low quality, distorted, ugly, bad anatomy"

### 6. 시드 값

- `seed: -1`: 매번 다른 이미지 생성 (랜덤)
- `seed: 숫자`: 동일한 시드로 동일한 이미지 재현 가능
- 동일한 프롬프트와 시드로 재현 가능한 이미지 생성

---

## 타입 정의

TypeScript를 사용하는 경우 다음 타입을 사용할 수 있습니다:

```typescript
// 요청 타입
interface GenerateImageRequest {
  workflow_name: string
  prompt: string
  negative_prompt?: string
  seed?: number
}

// 응답 타입
interface GenerateImageResponse {
  image_url: string
  prompt_id: string
  workflow_name: string
}

// 워크플로우 타입
interface WorkflowInfo {
  name: string
  size: number
  modified: string
}

interface WorkflowListResponse {
  workflows: WorkflowInfo[]
}

// 에러 타입
interface ApiError {
  detail: string
}
```

---

## 빠른 시작 예시

가장 간단한 사용 예시:

```typescript
'use client'

import { useState } from 'react'

export default function QuickExample() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        'https://api.rewardpang.com/thegrim-cms/comfyui/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflow_name: 'text2img_basic.json',
            prompt: 'a beautiful cat',
            negative_prompt: 'blurry',
          }),
        }
      )
      const data = await res.json()
      setImageUrl(data.image_url)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={generate} disabled={loading}>
        {loading ? '생성 중...' : '이미지 생성'}
      </button>
      {imageUrl && <img src={imageUrl} alt="Generated" />}
    </div>
  )
}
```

---

## 추가 리소스

- **API 문서**: `https://api.rewardpang.com/thegrim-cms/docs` (Swagger UI)
- **Health Check**: `https://api.rewardpang.com/thegrim-cms/health`

---

## 문의

문제가 발생하거나 질문이 있으시면 개발팀에 문의해주세요.

