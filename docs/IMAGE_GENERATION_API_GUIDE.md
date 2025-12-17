# 이미지 생성 API 가이드

이 문서는 TheGrim CMS 프로젝트에서 구현된 모든 이미지 생성 기능을 정리한 것입니다.

## 목차

1. [개요](#개요)
2. [공통 라이브러리](#공통-라이브러리)
3. [API 엔드포인트](#api-엔드포인트)
4. [프론트엔드 컴포넌트](#프론트엔드-컴포넌트)
5. [Hooks](#hooks)

---

## 개요

이 프로젝트는 **두 가지 AI 이미지 생성 서비스**를 지원합니다:

| 제공자 | 모델 | 특징 |
|--------|------|------|
| **Gemini** | `gemini-3-pro-image-preview` | Google AI, 참조 이미지 기반 생성, 텍스트+이미지 멀티모달 지원 |
| **Seedream** | `seedream-4-5-251128` | ByteDance ARK API, 고품질 이미지 생성, 워터마크 지원 |

### 환경 변수

```env
GEMINI_API_KEY=your_gemini_api_key
SEEDREAM_API_KEY=your_seedream_api_key
SEEDREAM_API_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3
```

---

## 공통 라이브러리

### 📁 `lib/image-generation/`

이미지 생성 API 호출을 위한 공통 라이브러리입니다.

#### 파일 구조

```
lib/image-generation/
├── index.ts              # 메인 진입점, 공통 함수 export
├── types.ts              # 타입 정의
├── utils.ts              # 유틸리티 함수 (타임아웃, 재시도 등)
└── providers/
    ├── gemini.ts         # Gemini API 프로바이더
    └── seedream.ts       # Seedream API 프로바이더
```

#### 주요 함수

```typescript
// 자동 프로바이더 선택
import { generateImage } from '@/lib/image-generation';

// 특정 프로바이더 사용
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';
```

#### 타입 정의

```typescript
type ImageProvider = 'gemini' | 'seedream';

interface GenerateImageResult {
  base64: string;      // 생성된 이미지 (Base64)
  mimeType: string;    // MIME 타입 (image/png, image/jpeg 등)
  provider: ImageProvider;
  model: string;
  elapsedMs: number;   // 소요 시간
}
```

#### Gemini 요청 예시

```typescript
const result = await generateGeminiImage({
  provider: 'gemini',
  model: 'gemini-3-pro-image-preview',
  contents: [
    {
      role: 'user',
      parts: [
        { text: '프롬프트 텍스트' },
        { inlineData: { mimeType: 'image/png', data: base64Data } }
      ]
    }
  ],
  config: {
    responseModalities: ['IMAGE', 'TEXT'],
    imageConfig: { imageSize: '1K', aspectRatio: '16:9' },
    temperature: 1.0,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 32768
  },
  timeoutMs: 120000,
  retries: 3
});
```

#### Seedream 요청 예시

```typescript
const result = await generateSeedreamImage({
  provider: 'seedream',
  model: 'seedream-4-5-251128',
  prompt: '프롬프트 텍스트',
  images: ['data:image/png;base64,...'],  // 참조 이미지 (선택사항)
  size: '2048x2048',
  responseFormat: 'url',
  watermark: true,
  timeoutMs: 60000,
  retries: 1
});
```

---

## API 엔드포인트

### 1. 캐릭터 이미지 미리보기 생성

**엔드포인트**: `POST /api/generate-character-image-preview`

**기능**: 캐릭터 이름과 설명을 기반으로 웹툰 스타일 캐릭터 이미지를 생성합니다. 저장하지 않고 미리보기만 제공합니다.

**요청 본문**:
```json
{
  "name": "캐릭터 이름",
  "description": "캐릭터 설명 (선택)"
}
```

**응답**:
```json
{
  "success": true,
  "imageUrl": "data:image/png;base64,...",
  "mimeType": "image/png",
  "imageData": "base64..."
}
```

**사용처**: `ScriptToStoryboard.tsx` 컴포넌트

---

### 2. 캐릭터 이미지 생성 및 저장

**엔드포인트**: `POST /api/characters/[characterId]/generate-image`

**기능**: 특정 캐릭터에 대한 AI 이미지를 생성하고 캐릭터 시트로 저장합니다.

**요청 본문**: 없음 (characterId는 URL 파라미터)

**응답**:
```json
{
  "success": true,
  "sheetId": "uuid",
  "imageUrl": "https://..."
}
```

**사용 프로바이더**: Gemini

---

### 3. 캐릭터 시트 생성 (4방향 뷰)

**엔드포인트**: `POST /api/generate-character-sheet`

**기능**: 업로드된 캐릭터 참조 이미지를 기반으로 4방향(정면, 측면, 뒷면, 3/4 각도) 캐릭터 시트를 생성합니다.

**요청 본문**:
```json
{
  "imageBase64": "base64...",
  "imageMimeType": "image/png",
  "apiProvider": "gemini" // 또는 "seedream", "auto"
}
```

**응답**:
```json
{
  "imageData": "base64...",
  "mimeType": "image/png"
}
```

**특징**:
- 21:9 비율의 가로형 이미지 생성
- 패션 모델 비율 (1:8 ~ 1:9) 적용
- 전신 이미지 (머리부터 발끝까지)

**사용처**: `CharacterSheetDialog.tsx` 컴포넌트

---

### 4. 괴수 이미지 생성

**엔드포인트**: `POST /api/generate-monster-image`

**기능**: AI가 생성한 프롬프트를 기반으로 괴수/몬스터 이미지를 생성합니다.

**요청 본문**:
```json
{
  "prompt": "괴수 설명 프롬프트",
  "aspectRatio": "1:1",
  "cutId": "uuid",
  "userId": "uuid (선택)",
  "apiProvider": "gemini" // 또는 "seedream", "auto" (기본값: auto)
}
```

**응답**:
```json
{
  "fileId": "uuid",
  "fileUrl": "https://...",
  "imageData": "base64...",
  "mimeType": "image/png"
}
```

**특징**:
- Gemini/Seedream API 선택 가능 (헤더 전역 모델 설정 사용)
- 자동으로 임시 파일로 저장 (is_temp = true)
- Storage에 업로드 및 DB 기록

**사용처**: `MonsterGenerator.tsx` 컴포넌트

**관련 API**: `POST /api/generate-monster-prompt` (프롬프트 자동 생성)

---

### 5. 이미지 재생성 (단일)

**엔드포인트**: `POST /api/regenerate-image`

**기능**: 기존 이미지를 참조하여 새로운 스타일이나 변형된 이미지를 생성합니다.

**요청 본문**:
```json
{
  "imageUrl": "https://...",
  "prompt": "스타일 변환 프롬프트",
  "aspectRatio": "16:9",
  "cutId": "uuid",
  "processId": "uuid",
  "apiProvider": "gemini",
  "referenceImages": [{ "id": "uuid" }],
  "characterSheets": [{ "sheetId": "uuid" }],
  "useOriginalImageAsReference": true
}
```

**응답**:
```json
{
  "fileId": "uuid",
  "filePath": "storage/path",
  "fileUrl": "https://...",
  "imageData": "base64...",
  "mimeType": "image/png"
}
```

**특징**:
- 레퍼런스 이미지 지원 (최대 여러 개)
- 캐릭터 시트 참조 지원
- 원본 이미지 비율 자동 감지
- 이미지 리사이징 캐시

**사용처**: `useImageRegeneration.ts` 훅, `FileDetailDialog.tsx`

---

### 6. 이미지 재생성 (배치)

**엔드포인트**: `POST /api/regenerate-image-batch`

**기능**: 여러 이미지를 동시에 재생성합니다. Gemini와 Seedream을 병렬로 처리합니다.

**요청 본문**:
```json
{
  "cutId": "uuid",
  "processId": "uuid",
  "requests": [
    {
      "imageUrl": "https://...",
      "prompt": "프롬프트 1",
      "apiProvider": "gemini"
    },
    {
      "imageUrl": "https://...",
      "prompt": "프롬프트 2",
      "apiProvider": "seedream"
    }
  ]
}
```

**응답**:
```json
{
  "images": [
    {
      "success": true,
      "index": 0,
      "fileId": "uuid",
      "fileUrl": "https://...",
      "mimeType": "image/png"
    }
  ]
}
```

**특징**:
- Gemini/Seedream 그룹별 병렬 처리
- 실패 시 개별 에러 반환
- 배치 크기 최적화

**사용처**: `useImageRegeneration.ts` 훅

---

### 7. 스토리보드 컷 이미지 생성

**엔드포인트**: `POST /api/storyboard-cut-image`

**기능**: 스토리보드의 컷 설명을 기반으로 콘티 스케치 이미지를 생성합니다.

**요청 본문**:
```json
{
  "title": "컷 제목",
  "background": "배경 설명",
  "description": "연출/구도 설명",
  "dialogue": "대사/내레이션",
  "storyboardId": "uuid",
  "cutIndex": 0,
  "selectedCharacterSheets": { "캐릭터명": 0 },
  "apiProvider": "gemini"
}
```

**응답**:
```json
{
  "imageUrl": "data:image/png;base64,...",
  "mimeType": "image/png"
}
```

**특징**:
- 흑백 스케치 스타일 콘티 생성
- 캐릭터 시트 자동 참조 (대사에서 캐릭터 이름 추출)
- 스토리보드 이미지 DB 자동 저장
- Gemini/Seedream 선택 가능

**사용처**: `ScriptToStoryboard.tsx` 컴포넌트

---

### 8. 3D 캐릭터 자세 변환

**엔드포인트**: `POST /api/convert-3d-character`

**기능**: 캐릭터 시트와 3D 포즈 이미지를 합성하여 특정 자세의 캐릭터 이미지를 생성합니다.

**요청 본문**:
```json
{
  "characterSheetImage": {
    "base64": "...",
    "mimeType": "image/png"
  },
  "poseImage": {
    "base64": "...",
    "mimeType": "image/png"
  },
  "aspectRatio": "portrait",
  "cutId": "uuid",
  "processId": "uuid",
  "webtoonId": "uuid",
  "additionalPrompt": "감정, 표정 등 추가 설명"
}
```

**응답**:
```json
{
  "success": true,
  "image": {
    "base64": "...",
    "mimeType": "image/png"
  },
  "fileId": "uuid",
  "filePath": "storage/path",
  "fileUrl": "https://..."
}
```

**특징**:
- 캐릭터 시트의 외모/의상 + 3D 포즈의 자세/구도 합성
- 가로/세로/정사각형 비율 선택 가능
- 임시 파일로 자동 저장

**사용처**: `app/3d-viewer/page.tsx`

---

## 프론트엔드 컴포넌트

### 1. CharacterSheetDialog

**파일**: `components/CharacterSheetDialog.tsx`

**기능**: 캐릭터 시트 생성 다이얼로그

**사용 API**: `/api/generate-character-sheet`

---

### 2. ScriptToStoryboard

**파일**: `components/ScriptToStoryboard.tsx`

**기능**: 대본을 스토리보드 콘티로 변환

**사용 API**:
- `/api/script-to-storyboard` (텍스트 분석)
- `/api/generate-character-image-preview` (캐릭터 미리보기)
- `/api/storyboard-cut-image` (콘티 이미지 생성)

---

### 3. MonsterGenerator

**파일**: `components/MonsterGenerator.tsx`

**기능**: 괴수/몬스터 이미지 생성

**사용 API**:
- `/api/generate-monster-prompt` (프롬프트 생성)
- `/api/generate-monster-image` (이미지 생성)
- `/api/regenerate-image-save` (선택 이미지 저장)
- `/api/regenerate-image-history` (히스토리 조회)

---

### 4. ImageRegenerationWorkspace

**파일**: `components/ImageRegenerationWorkspace.tsx`

**기능**: 이미지 재생성 워크스페이스 (스타일 변환, 배치 생성)

**사용 Hook**: `useImageRegeneration`

---

### 5. FileDetailDialog

**파일**: `components/FileDetailDialog.tsx`

**기능**: 파일 상세 보기 및 이미지 재생성

**사용 Hook**: `useImageRegeneration`

---

### 6. 3D Viewer Page

**파일**: `app/3d-viewer/page.tsx`

**기능**: 3D 모델 뷰어 및 캐릭터 자세 생성

**사용 API**:
- `/api/convert-3d-character`
- `/api/regenerate-image-save`

---

## Hooks

### useImageRegeneration

**파일**: `lib/hooks/useImageRegeneration.ts`

**기능**: 이미지 재생성 상태 관리 및 API 호출

**주요 함수**:
```typescript
const {
  regeneratingImage,      // 재생성 중인 이미지 ID
  regeneratedImages,      // 생성된 이미지 목록
  selectedImageIds,       // 선택된 이미지 ID Set
  handleRegenerate,       // 재생성 실행
  handleSaveSelectedImages, // 선택 이미지 저장
  handleSelectImage,      // 이미지 선택/해제
  handleSelectAll,        // 전체 선택/해제
} = useImageRegeneration({
  fileToView,
  selectedCutId,
  generationCount,
  onFilesReload,
  currentUserId
});
```

**사용 API**:
- `/api/regenerate-image` (단일 생성)
- `/api/regenerate-image-batch` (배치 생성)
- `/api/regenerate-image-save` (저장)

---

## 지원 이미지 비율

### Gemini
- 가로형: `21:9`, `16:9`, `4:3`, `3:2`, `5:4`
- 정사각형: `1:1`
- 세로형: `9:16`, `3:4`, `2:3`, `4:5`

### Seedream
- 가로형: `21:9`, `16:9`, `4:3`, `3:2`
- 정사각형: `1:1`
- 세로형: `9:16`, `3:4`, `2:3`

---

## 에러 처리 및 재시도

모든 이미지 생성 API는 다음 에러에 대해 자동 재시도를 수행합니다:

- 네트워크 에러: `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `ECONNREFUSED`, `EAI_AGAIN`
- 서버 에러: HTTP 500, 502, 503, 504
- 타임아웃: 설정된 시간 초과

재시도 전략: **Exponential Backoff** (최대 10초 간격)

---

## 관련 데이터베이스 테이블

| 테이블 | 설명 |
|--------|------|
| `files` | 생성된 이미지 파일 정보 (is_temp 필드로 임시/영구 구분) |
| `character_sheets` | 캐릭터 시트 이미지 |
| `episode_script_storyboard_images` | 스토리보드 컷 이미지 |
| `regenerated_image_history` | 이미지 재생성 히스토리 |

---

## 저장소 (Supabase Storage)

**버킷**: `webtoon-files`

**경로 구조**: `{cutId}/{processId}/{fileName}`

**파일 명명 규칙**:
- 괴수 이미지: `monster-{uuid}.{ext}`
- 캐릭터 자세: `character-pose-{timestamp}-{uuid}.{ext}`
- 재생성 이미지: `regenerated-{uuid}.{ext}`
