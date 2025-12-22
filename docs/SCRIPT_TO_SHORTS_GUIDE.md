# Script-to-Shorts (대본 → 쇼츠 영상) 시스템 문서

## 개요

Script-to-Shorts는 대본(스크립트)을 입력하면 AI를 활용하여 자동으로 쇼츠(세로형 숏폼) 영상을 생성하는 시스템입니다. Gemini AI로 이미지를 생성하고, Google Veo 3로 영상을 생성합니다.

---

## 목차

1. [UX 워크플로우](#ux-워크플로우)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [데이터베이스 스키마](#데이터베이스-스키마)
4. [API 엔드포인트](#api-엔드포인트)
5. [핵심 알고리즘](#핵심-알고리즘)
6. [기술 스택](#기술-스택)

---

## UX 워크플로우

### 전체 흐름

```
[프로젝트 목록] → [새 프로젝트] → [4단계 워크플로우] → [완성된 영상]
```

### 뷰 구성

#### 1. 프로젝트 목록 화면 (view: 'list')

- **기능**: 기존 프로젝트 조회, 새 프로젝트 생성, 프로젝트 삭제
- **UI 요소**:
  - 헤더: "대본 → 쇼츠 영상" 제목 + "새 프로젝트" 버튼
  - 프로젝트 카드 그리드 (md:2열, lg:3열)
  - 각 카드: 제목, 수정일, 대본 미리보기, 상태 배지

- **프로젝트 상태 표시**:
  | 상태 | 설명 | 배지 |
  |------|------|------|
  | `draft` | 초안 | 회색 |
  | `characters_set` | 캐릭터 설정됨 | - |
  | `grid_generated` | 이미지 완료 | 초록색 |
  | `script_generated` | 스크립트 완료 | 초록색 |
  | `video_generating` | 영상 생성중 | 주황색 |
  | `completed` | 완료 | 초록색 |

#### 2. 프로젝트 편집 화면 (view: 'edit')

4개의 탭으로 구성된 단계별 워크플로우:

---

### 탭 1: 대본 입력 (Script)

**목적**: 쇼츠 영상의 원본 대본(스크립트) 입력

**UI 구성**:
```
┌────────────────────────────────────────────────────┐
│ 제목 (선택)           │ 그리드 크기: [2×2] [3×3] │
├────────────────────────────────────────────────────┤
│                                                    │
│  대본 입력 텍스트 영역                              │
│  (장면 전환, 대사 포함)                            │
│                                                    │
├────────────────────────────────────────────────────┤
│                               [저장 및 다음 →]     │
└────────────────────────────────────────────────────┘
```

**그리드 크기 선택**:
| 옵션 | 패널 수 | 씬(영상) 수 | 용도 |
|------|---------|-------------|------|
| 2×2 | 4개 | 3개 | 짧은 스토리 |
| 3×3 | 9개 | 8개 | 긴 스토리 (기본값) |

**입력 예시**:
```
[장면 1: 도시의 밤거리]
주인공이 비오는 거리를 걷고 있다.

[장면 2: 카페 내부]
주인공: '오랜만이야.'
상대방: '그러게, 정말 오랜만이다.'
```

**저장 로직**:
- 새 프로젝트: POST `/api/shorts`
- 기존 프로젝트: PATCH `/api/shorts/[projectId]`
- 저장 후 자동으로 다음 탭(등장인물)으로 이동

---

### 탭 2: 등장인물 설정 (Characters)

**목적**: 캐릭터 정보 및 참조 이미지 등록으로 일관성 있는 캐릭터 생성

**UI 구성**:
```
┌─────────────────────────────────────────────────────────┐
│ 등장인물 설정                          [건너뛰기 →]     │
├─────────────────────────────────────────────────────────┤
│ ┌──────┐  ┌──────────────────────────────────────┐     │
│ │      │  │ 캐릭터 이름 *                         │     │
│ │ 이미지 │ ├──────────────────────────────────────┤     │
│ │ 업로드 │ │ 외모 설명 (예: 검은 단발머리...)       │ [🗑]│
│ └──────┘  └──────────────────────────────────────┘     │
│                                                         │
│ [+ 등장인물 추가]                                        │
│                                    [저장 및 다음 →]      │
└─────────────────────────────────────────────────────────┘
```

**캐릭터 정보 구조**:
```typescript
interface ShortsCharacter {
  name: string;           // 캐릭터 이름 (필수)
  description: string;    // 외모 설명
  imageBase64?: string;   // 참조 이미지 (Base64)
  imageMimeType?: string; // 이미지 MIME 타입
}
```

**기능**:
- 캐릭터 추가/삭제
- 이미지 업로드 (드래그 앤 드롭 또는 클릭)
- "건너뛰기" 옵션: 캐릭터 설정 없이 대본만으로 이미지 생성

**저장 로직**:
- PUT `/api/shorts/[projectId]/characters` (일괄 업데이트)
- 이미지는 Supabase Storage `shorts-videos` 버킷에 저장

---

### 탭 3: 이미지 생성 (Images)

**목적**: 대본을 분석하여 패널 설명 생성 및 그리드 이미지 생성

#### 영상 생성 모드 선택

탭 3 상단에서 영상 생성 모드를 선택할 수 있습니다:

```
┌───────────────────────────────────────────────────────────┐
│ 영상 생성 모드                                             │
│ 컷to컷: 4컷 → 3개 영상 (시작/끝 프레임 전환)               │
│                                                           │
│                         [컷to컷 영상] [컷별 영상]          │
└───────────────────────────────────────────────────────────┘
```

| 모드 | 설명 | 패널 수 → 영상 수 |
|------|------|------------------|
| **컷to컷 영상** | 시작 프레임과 끝 프레임 이미지를 제공하고, 그 사이를 영상으로 생성 | 4컷 → 3영상, 9컷 → 8영상 |
| **컷별 영상** | 각 컷 이미지 하나만 제공하고, 해당 이미지를 애니메이션으로 생성 | 4컷 → 4영상, 9컷 → 9영상 |

**모드별 Veo API 호출 방식**:
- **컷to컷**: `startImageBase64` + `endImageBase64` + 프롬프트 (전환 영상)
- **컷별**: `startImageBase64` + 프롬프트 (단일 이미지 애니메이션)

**2단계 프로세스**:

#### 3-1. 컷 설명 생성

```
┌───────────────────────────────────────────────────────────┐
│ 1단계: 컷 설명 생성                                        │
│ 대본을 분석하여 N개 패널의 상세 설명과 M개 영상 프롬프트 생성│
│                                                           │
│ 모델: [Gemini 2.5 Flash ▼]        [컷 설명 생성]           │
├───────────────────────────────────────────────────────────┤
│ ✅ 9개 패널 설명 생성됨                                     │
│ ┌─────────────┬─────────────┬─────────────┐               │
│ │ 패널 1      │ 패널 2      │ 패널 3      │               │
│ │ (설명...)   │ (설명...)   │ (설명...)   │               │
│ └─────────────┴─────────────┴─────────────┘               │
└───────────────────────────────────────────────────────────┘
```

**Gemini 모델 옵션**:
- `gemini-2.5-flash` (권장)
- `gemini-2.5-flash-lite` (빠름)
- `gemini-2.5-pro` (고성능)
- `gemini-3-flash-preview` (최신)
- `gemini-3-pro-preview` (최신)

**생성되는 VideoScript 구조**:
```typescript
interface VideoScript {
  panels: PanelDescription[];  // 패널별 상세 설명
  scenes: VideoScene[];        // 씬별 전환 정보 + Veo 프롬프트
  totalDuration: number;       // 예상 길이(초)
  style: string;               // 전체 스타일 설명
  gridSize: GridSize;          // 그리드 크기
}

interface PanelDescription {
  panelIndex: number;
  description: string;    // 시각적 설명 (영어)
  characters: string[];   // 등장 캐릭터
  action: string;         // 캐릭터 동작/표정
  environment: string;    // 배경/환경
}

interface VideoScene {
  sceneIndex: number;
  startPanelIndex: number;
  endPanelIndex: number;
  motionDescription: string;  // 카메라/캐릭터 움직임
  dialogue: string;           // 대사 (원본 언어)
  veoPrompt: string;          // Veo 영상 생성 프롬프트
}
```

#### 3-2. 이미지 생성

```
┌───────────────────────────────────────────────────────────┐
│ 2단계: 이미지 생성                                         │
│ 컷 설명을 기반으로 3x3 그리드 이미지 생성                   │
│                                                           │
│ 스타일: [실사풍 ▼]                    [이미지 생성]        │
└───────────────────────────────────────────────────────────┘
```

**스타일 옵션**:
| 스타일 | 설명 |
|--------|------|
| 실사풍 (realistic) | 하이퍼 리얼리스틱, 영화급 사진 품질 |
| 만화풍 (cartoon) | 웹툰/애니메이션 스타일 |

**이미지 생성 결과**:
```
┌─────────────────────────────────────────────────────────┐
│ 생성된 패널 (9개)                     [전체 그리드 다운로드]│
│ ┌───────┬───────┬───────┐                               │
│ │   1   │   2   │   3   │                               │
│ ├───────┼───────┼───────┤                               │
│ │   4   │   5   │   6   │                               │
│ ├───────┼───────┼───────┤                               │
│ │   7   │   8   │   9   │                               │
│ └───────┴───────┴───────┘                               │
│                                                         │
│ 씬 전환 (8개 영상)                                       │
│ [씬1: 1→2] [씬2: 2→3] ... [씬8: 8→9]                    │
│                                                         │
│                         [영상 생성으로 이동 →]           │
└─────────────────────────────────────────────────────────┘
```

**기술 세부사항**:
- Gemini 3 Pro Image Preview 모델 사용
- 2K 해상도, 9:16 세로 비율
- sharp 라이브러리로 그리드를 개별 패널로 분할
- 각 패널은 Supabase Storage에 개별 저장

---

### 탭 4: 영상 생성 (Video)

**목적**: 각 씬의 시작/끝 프레임과 Veo 프롬프트로 영상 생성

**UI 구성**:
```
┌─────────────────────────────────────────────────────────────┐
│ 영상 생성                                                    │
│ 각 씬을 Veo로 영상화합니다.                                   │
│                                                             │
│ [Veo API Key]                         [모든 영상 생성]       │
├─────────────────────────────────────────────────────────────┤
│ 스타일: cinematic style...                                   │
│ 예상 길이: 32초                                              │
├─────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐  │
│ │ ┌───┐ ┌───┐  씬 1                        ✅ 완료        │  │
│ │ │ 🖼 │→│ 🖼 │                                          │  │
│ │ └───┘ └───┘  대사: "오늘 날씨 정말 좋다!"              │  │
│ │              모션: Camera slowly zooms in...          │  │
│ │              프롬프트: Starting from...               │  │
│ │                                    [▶ 재생] [⬇ 다운로드]│  │
│ └────────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ ┌───┐ ┌───┐  씬 2                        [✨ 생성]      │  │
│ │ │ 🖼 │→│ 🖼 │                                          │  │
│ │ └───┘ └───┘  대사: "그러게, 산책하기 딱 좋은 날이야."  │  │
│ └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**씬 상태 표시**:
| 상태 | 아이콘 | 설명 |
|------|--------|------|
| pending | - | 대기 중 |
| generating | 🔄 | 생성 중 |
| completed | ✅ | 완료 |
| error | ⚠️ | 오류 |

**Veo API Key 다이얼로그**:
- 커스텀 API Key 입력 가능
- 비워두면 서버 기본 키 사용
- 현재 상태 표시 (커스텀/기본)

**영상 생성 옵션**:
- 개별 씬 생성: 특정 씬만 생성/재생성
- 모든 영상 생성: 전체 씬 일괄 생성

---

## 시스템 아키텍처

### 컴포넌트 구조

```
app/script-to-shorts/page.tsx (메인 페이지 컴포넌트)
├── 프로젝트 목록 뷰
│   ├── 프로젝트 카드 그리드
│   └── 새 프로젝트 버튼
└── 프로젝트 편집 뷰
    ├── 탭 1: 대본 입력
    ├── 탭 2: 등장인물 설정
    ├── 탭 3: 이미지 생성
    └── 탭 4: 영상 생성
```

### API 레이어

```
app/api/shorts/
├── route.ts                    # GET (목록), POST (생성)
└── [projectId]/
    ├── route.ts                # GET, PATCH, DELETE
    ├── characters/
    │   └── route.ts            # GET, POST, PUT
    ├── generate-grid/
    │   └── route.ts            # POST (이미지 생성)
    ├── generate-script/
    │   └── route.ts            # POST (VideoScript 생성)
    └── generate-video/
        └── route.ts            # POST (Veo 영상 생성)
```

### 유틸리티 레이어

```
lib/video-generation/
├── veo.ts                      # Veo 3 API 래퍼
├── grid-splitter.ts            # 그리드 이미지 분할
└── types.ts                    # 타입 정의

lib/image-generation/
└── providers/
    └── gemini.ts               # Gemini 이미지 생성
```

---

## 데이터베이스 스키마

### shorts_projects (프로젝트)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| title | text | 프로젝트 제목 |
| script | text | 원본 대본 |
| status | text | 프로젝트 상태 |
| video_mode | text | 영상 생성 모드 ('cut-to-cut' / 'per-cut') |
| grid_image_path | text | 그리드 이미지 URL |
| grid_image_base64 | text | 그리드 이미지 Base64 |
| video_script | jsonb | VideoScript JSON |
| created_at | timestamptz | 생성일 |
| updated_at | timestamptz | 수정일 |

### shorts_characters (캐릭터)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| project_id | uuid | FK → shorts_projects |
| name | text | 캐릭터 이름 |
| description | text | 외모 설명 |
| image_path | text | 이미지 URL |
| storage_path | text | Storage 경로 |
| created_at | timestamptz | 생성일 |

### shorts_scenes (씬)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| project_id | uuid | FK → shorts_projects |
| scene_index | int | 씬 순서 (0부터) |
| start_panel_path | text | 시작 프레임 URL |
| end_panel_path | text | 끝 프레임 URL |
| video_prompt | text | Veo 프롬프트 |
| video_path | text | 생성된 영상 URL |
| video_storage_path | text | Storage 경로 |
| status | text | 생성 상태 |
| error_message | text | 에러 메시지 |
| created_at | timestamptz | 생성일 |
| updated_at | timestamptz | 수정일 |

---

## API 엔드포인트

### 1. 프로젝트 관리

#### GET /api/shorts
- **설명**: 모든 프로젝트 목록 조회
- **응답**: `ShortsProjectListItem[]`

#### POST /api/shorts
- **설명**: 새 프로젝트 생성
- **Body**: `{ title?: string, script: string }`
- **응답**: 생성된 프로젝트

#### GET /api/shorts/[projectId]
- **설명**: 단일 프로젝트 상세 조회 (캐릭터, 씬 포함)
- **응답**: `ShortsProject`

#### PATCH /api/shorts/[projectId]
- **설명**: 프로젝트 수정
- **Body**: `{ title?: string, script?: string, status?: string }`

#### DELETE /api/shorts/[projectId]
- **설명**: 프로젝트 삭제

### 2. 캐릭터 관리

#### PUT /api/shorts/[projectId]/characters
- **설명**: 캐릭터 일괄 업데이트 (기존 삭제 후 재생성)
- **Body**: 
  ```typescript
  {
    characters: Array<{
      name: string;
      description?: string;
      imageBase64?: string;
      imageMimeType?: string;
    }>
  }
  ```

### 3. 컨텐츠 생성

#### POST /api/shorts/[projectId]/generate-script
- **설명**: AI로 VideoScript 생성 (패널 설명 + 씬 프롬프트)
- **Body**: `{ model?: string, gridSize?: '2x2' | '3x3' }`
- **응답**: `VideoScript`

#### POST /api/shorts/[projectId]/generate-grid
- **설명**: 그리드 이미지 생성 및 패널 분할
- **Body**: `{ style?: 'realistic' | 'cartoon', gridSize?: '2x2' | '3x3' }`
- **응답**: 
  ```typescript
  {
    gridImagePath: string;
    panels: Array<{ index, row, col }>;
    scenes: Array<{ sceneIndex, startPanelPath, endPanelPath }>;
  }
  ```

#### POST /api/shorts/[projectId]/generate-video
- **설명**: Veo로 영상 생성
- **Body**: `{ sceneIndex?: number, veoApiKey?: string }`
- **응답**: 생성 결과 (성공/실패 정보)

---

## 핵심 알고리즘

### 1. 그리드 이미지 분할 (grid-splitter.ts)

```typescript
// 그리드 크기별 설정
const GRID_CONFIGS = {
  '2x2': { rows: 2, cols: 2, panelCount: 4, sceneCount: 3 },
  '3x3': { rows: 3, cols: 3, panelCount: 9, sceneCount: 8 },
};

// 분할 알고리즘
// 1. sharp로 이미지 메타데이터 로드
// 2. 패널 크기 계산: width/cols, height/rows
// 3. 각 패널 추출 (row, col 순회)
// 4. Base64로 인코딩하여 반환
```

### 2. 패널 페어 생성 (씬 매핑)

```
2x2 그리드 (4패널 → 3씬):
패널: [0] [1] [2] [3]
씬:    ╰─0─╯ ╰─1─╯ ╰─2─╯
       0→1   1→2   2→3

3x3 그리드 (9패널 → 8씬):
패널: [0] [1] [2] [3] [4] [5] [6] [7] [8]
씬:    ╰0╯ ╰1╯ ╰2╯ ╰3╯ ╰4╯ ╰5╯ ╰6╯ ╰7╯
       0→1 1→2 2→3 3→4 4→5 5→6 6→7 7→8
```

### 3. Veo 프롬프트 작성 규칙

Veo 3은 다음 형식을 기대합니다:

```
Starting from [첫 프레임 설명], [카메라/캐릭터 움직임], 
transitioning to [끝 프레임 설명]. 
[캐릭터 설명] says: '[대사]' with [감정/톤]. 
Audio: [환경 사운드 목록], no background music.
```

**핵심 포인트**:
- 시작/끝 프레임 이미지가 제공되므로 전환 설명에 집중
- 대사는 `says: '...'` 형식으로 (Veo 3 립싱크 기능 활성화)
- 환경 오디오 필수: `Audio: forest ambiance, birds chirping...`
- 텍스트 금지: "no text, no subtitles"

### 4. Veo 영상 생성 플로우

```
1. 시작 패널 이미지 다운로드 (첫 프레임)
2. 끝 패널 이미지 다운로드 (마지막 프레임)
3. generateVideos API 호출
   - image: 시작 프레임
   - config.lastFrame: 끝 프레임
   - prompt: Veo 프롬프트
4. 폴링으로 완료 대기 (10분 타임아웃, 15초 간격)
5. 영상 다운로드 및 Storage 저장
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 15 (App Router) |
| UI 라이브러리 | React, Tailwind CSS, shadcn/ui |
| 이미지 생성 | Gemini 3 Pro Image Preview |
| 영상 생성 | Google Veo 3.1 Fast Generate |
| 이미지 처리 | sharp |
| 데이터베이스 | Supabase (PostgreSQL) |
| 파일 저장소 | Supabase Storage (`shorts-videos` 버킷) |
| 상태 관리 | React useState/useCallback |

---

## 사용 예시

### 1. 간단한 2컷 쇼츠 만들기

```
[대본]
장면 1: 카페에서 두 친구가 커피를 마시고 있다.
민수: "요즘 뭐하고 지내?"

장면 2: 친구가 웃으며 대답한다.
지영: "그냥 열심히 살고 있지!"
```

1. 대본 입력 → 그리드 크기 2×2 선택
2. 등장인물 설정: 민수, 지영 (이미지 업로드 선택)
3. 컷 설명 생성 → 이미지 생성 (실사풍)
4. 영상 생성 → 3개 씬 자동 생성

### 2. 스토리 쇼츠 만들기 (3×3)

더 긴 스토리의 경우 3×3 그리드 (9컷, 8개 씬)를 선택하여 더 풍부한 내러티브 구성 가능.

---

## 주의사항 및 제한사항

1. **API 비용**: Gemini 이미지 생성 및 Veo 영상 생성은 유료 API
2. **생성 시간**: 
   - 이미지 생성: 약 30초~2분
   - 영상 생성: 씬당 약 2~5분
3. **해상도**: 
   - 이미지: 2K
   - 영상: 720p (Veo 3 제한)
4. **콘텐츠 필터**: Gemini 안전 필터로 일부 대본이 차단될 수 있음
5. **언어**: 패널 설명과 프롬프트는 영어, 대사만 원본 언어 유지

---

## 향후 개선 방향

1. **TTS 통합**: 대사에 TTS 음성 합성 추가
2. **배경음악**: AI 음악 생성 또는 라이브러리 연동
3. **자막 자동 생성**: 대사 기반 자막 오버레이
4. **영상 편집**: 씬 병합, 트랜지션 효과 추가
5. **템플릿**: 자주 사용하는 스타일/포맷 저장

