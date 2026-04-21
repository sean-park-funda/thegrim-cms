# Shortstoon 개발 계획서

> 카드 #21 — `/webtoonanimation` 코드·UX를 참고해 새로운 `/shortstoon` 만들기
> 작성일: 2026-03-29

---

## 1. 개요

### 무엇을 만드는가?

컷 이미지를 직접 업로드해서 간단한 효과(패닝/줌/흔들림 등)를 입히고, 이어붙여 **쇼츠/릴스용 영상**을 빠르게 만드는 독립 도구.

### webtoonanimation과의 관계

| | webtoonanimation | shortstoon |
|-|-----------------|------------|
| **목적** | AI 풀 애니메이션화 | 빠른 효과 영상 제작 |
| **컷 이미지** | webtoonanimation 전용 | **독립 업로드** (별도 관리) |
| **코드 참고** | — | 코드·UX 패턴 참고용 |
| **AI 효과** | 5090 탭 Wan2.2 | 동일 방식 재사용 |
| **처리 시간** | 컷당 수 분 | FFmpeg 수 초 (AI 선택 시 수 분) |

> webtoonanimation의 컷 데이터는 연동하지 않음. 코드와 UX만 참고.

---

## 2. 핵심 기능

### 2-1. 컷 이미지 업로드
- **벌크 업로드**: 여러 이미지를 드래그앤드롭 또는 파일 선택으로 한번에 추가
- 업로드 순서 = 블록 초기 순서
- 지원 포맷: JPG, PNG, WEBP

### 2-2. 뷰포트 설정 (크롭/패닝)
- 원본 컷 이미지를 **9:16 세로 화면**에 어떻게 보여줄지 설정
- 이미지 드래그로 보여줄 영역 위치 조정
- 슬라이더로 확대/축소 배율 조정
- **실시간 Canvas 미리보기**: 설정 변경 시 즉시 반영

### 2-3. 블록 애니메이션 효과

#### CSS/FFmpeg 효과 (빠름, 비용 없음)
| 효과 | 설명 |
|------|------|
| **없음** | 정적 이미지 |
| **좌우 스크롤** | 이미지가 좌→우 (또는 반대) 이동 |
| **상하 스크롤** | 이미지가 위→아래 이동 (긴 컷 훑기) |
| **줌인** | 중심으로 서서히 확대 |
| **줌아웃** | 중심에서 서서히 축소 |
| **흔들림** | 화면이 좌우로 미세하게 진동 |
| **반짝임** | 밝기 깜빡임 |

#### AI 효과 (Wan2.2 — 5090 탭과 동일 방식)
- 시작/끝 프레임 없이 **레퍼런스 이미지 1장**으로 자연스러운 움직임 생성
- 예: 눈 깜빡임, 머리 흔들림, 호흡
- webtoonanimation 5090 탭의 Wan2.2 API 호출 코드 재사용

### 2-4. 블록 복사
- 동일한 원본 이미지에서 **다른 영역을 보여주는 새 블록** 생성
- 예: 같은 컷에서 왼쪽 캐릭터 → 오른쪽 캐릭터로 시선 이동

### 2-5. 블록 연결 효과 (트랜지션)

| 효과 | FFmpeg xfade 트랜지션 |
|------|------|
| **없음** | 즉시 전환 |
| **페이드** | fade |
| **크로스페이드** | fadeblack / fadewhite |
| **슬라이드 →** | slideleft |
| **슬라이드 ↑** | slidedown |
| **줌 전환** | zoom (커스텀) |

### 2-6. 실시간 미리보기
- 편집 패널에서 Canvas API로 뷰포트+효과를 실시간 렌더링
- 타임라인 재생 버튼으로 전체 흐름 미리보기 (블록 순서대로 자동 전환)

---

## 3. 데이터 구조

### DB 테이블 (신규 — 독립 운영)

```sql
-- 숏스툰 프로젝트
CREATE TABLE shortstoon_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  aspect_ratio TEXT DEFAULT '9:16',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 숏스툰 블록 (컷 1개 = 블록 1개)
CREATE TABLE shortstoon_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shortstoon_project_id UUID REFERENCES shortstoon_projects(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,

  -- 원본 이미지 (직접 업로드)
  image_path TEXT NOT NULL,      -- Supabase Storage 경로
  image_url TEXT NOT NULL,       -- 공개 URL
  file_name TEXT NOT NULL,

  -- 뷰포트 (원본에서 어떤 부분을 어떻게 보여줄지)
  viewport JSONB DEFAULT '{"scale": 1.0, "offset_x": 0.5, "offset_y": 0.5}',
  -- scale: 확대 배율 (1.0 = fit)
  -- offset_x: 0.0(왼쪽) ~ 1.0(오른쪽), 0.5 = 중앙
  -- offset_y: 0.0(위) ~ 1.0(아래), 0.5 = 중앙

  -- 애니메이션 효과
  effect_type TEXT DEFAULT 'none',
  -- none | scroll_h | scroll_v | zoom_in | zoom_out | shake | flash | ai_motion
  effect_params JSONB DEFAULT '{}',
  -- scroll_h: { direction: 'left'|'right', speed: 0.3 }
  -- scroll_v: { direction: 'up'|'down', speed: 0.3 }
  -- zoom_in:  { from: 1.0, to: 1.3 }
  -- zoom_out: { from: 1.3, to: 1.0 }
  -- shake:    { amplitude: 8, frequency: 8 }
  -- flash:    { interval: 0.5, min_brightness: 0.7 }
  -- ai_motion:{ motion_type: 'blink'|'hair'|'breathing', prompt: '' }

  duration_ms INTEGER DEFAULT 3000,

  -- 트랜지션 (이 블록 → 다음 블록)
  transition_type TEXT DEFAULT 'none',
  -- none | fade | fadeblack | fadewhite | slideleft | slidedown | zoom
  transition_duration_ms INTEGER DEFAULT 500,

  -- 렌더링 결과
  status TEXT DEFAULT 'pending',
  -- pending | rendering | completed | failed
  video_url TEXT,
  video_path TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### TypeScript 타입

```typescript
export type ShortstoonEffectType =
  'none' | 'scroll_h' | 'scroll_v' | 'zoom_in' | 'zoom_out' | 'shake' | 'flash' | 'ai_motion';

export type ShortstoonTransitionType =
  'none' | 'fade' | 'fadeblack' | 'fadewhite' | 'slideleft' | 'slidedown' | 'zoom';

export interface ShortstoonViewport {
  scale: number;      // 확대 배율 (1.0 = 화면에 맞춤)
  offset_x: number;  // 가로 중심 0~1 (0.5 = 중앙)
  offset_y: number;  // 세로 중심 0~1 (0.5 = 중앙)
}

export interface ShortstoonBlock {
  id: string;
  shortstoon_project_id: string;
  order_index: number;
  image_url: string;
  file_name: string;
  viewport: ShortstoonViewport;
  effect_type: ShortstoonEffectType;
  effect_params: Record<string, unknown>;
  duration_ms: number;
  transition_type: ShortstoonTransitionType;
  transition_duration_ms: number;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  video_url: string | null;
}
```

---

## 4. 화면 구성

### 4-1. 프로젝트 목록 (`/shortstoon`)

```
┌────────────────────────────────────────┐
│ 숏스툰                    [+ 새 프로젝트]│
├────────────────────────────────────────┤
│ ┌──────┐ 작품 A 쇼츠      12블록 · 36초│
│ │썸네일│                  [편집] [삭제] │
│ └──────┘                              │
│ ┌──────┐ 작품 B 티저       8블록 · 24초│
│ │썸네일│                  [편집] [삭제] │
│ └──────┘                              │
└────────────────────────────────────────┘
```

### 4-2. 편집 페이지 (`/shortstoon/[id]`)

```
┌──────────────────────────────────────────────────────────┐
│ [← 목록]  프로젝트 이름              [▶ 미리보기] [렌더링]│
├───────────────────┬──────────────────────────────────────┤
│                   │                                      │
│  블록 목록        │   편집 패널                          │
│  (세로 스크롤)    │                                      │
│                   │   ┌──────────────────────────────┐  │
│  ┌─────────────┐  │   │   뷰포트 편집기 (Canvas)     │  │
│  │[썸네일]     │  │   │                              │  │
│  │블록 #1 선택 │◀─┼───│   ┌──────────┐              │  │
│  │3.0초 · 줌인 │  │   │   │  9:16    │              │  │
│  │→ 크로스페이드│  │   │   │  실시간  │              │  │
│  │[복사] [×]   │  │   │   │  미리보기│              │  │
│  └─────────────┘  │   │   └──────────┘              │  │
│                   │   │   드래그로 위치 조정          │  │
│  ┌─────────────┐  │   │   배율: [────●──────] 1.5x  │  │
│  │[썸네일]     │  │   └──────────────────────────────┘  │
│  │블록 #2      │  │                                      │
│  │3.0초 · 없음 │  │   효과    [줌인           ▼]        │
│  └─────────────┘  │   시간    [3.0초          ▼]        │
│                   │                                      │
│  ↕ 드래그 정렬    │   전환 효과   [크로스페이드   ▼]    │
│                   │   전환 시간   [0.5초          ▼]    │
│  [+ 컷 추가]      │                                      │
│  (벌크 업로드)    │   [이 블록 렌더링]                   │
└───────────────────┴──────────────────────────────────────┘
```

### 4-3. 실시간 미리보기

- **블록 편집 시**: 뷰포트+효과를 Canvas에 즉시 시뮬레이션 (requestAnimationFrame 루프)
- **전체 미리보기 버튼**: 블록을 순서대로 자동 전환하며 타이밍 확인
- AI 효과는 렌더링 후 video 태그로 확인

---

## 5. 렌더링 방식

### 5-1. FFmpeg 효과 (서버 사이드)

```bash
# 좌우 스크롤: 입력 2배 너비로 스케일 후 크롭 이동
ffmpeg -loop 1 -i input.jpg \
  -vf "scale=2160:1920,crop=1080:1920:'(2160-1080)*t/3':0" \
  -t 3 -r 30 output.mp4

# 줌인 (1.0 → 1.3, 3초)
ffmpeg -loop 1 -i input.jpg \
  -vf "zoompan=z='1+0.3*t/3':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=30" \
  -t 3 output.mp4

# 흔들림
ffmpeg -loop 1 -i input.jpg \
  -vf "scale=1160:2020,crop=1080:1920:'40+40*sin(2*PI*8*t)':50" \
  -t 3 -r 30 output.mp4
```

### 5-2. AI 효과 (Wan2.2 — 5090 탭 방식 재사용)
- `webtoonanimation/generate-test-video` 또는 유사 API 참고
- 레퍼런스 이미지 1장 + 모션 프롬프트 → Wan2.2 → MP4
- 결과를 Supabase Storage에 저장

### 5-3. 트랜지션 병합

```bash
# xfade 필터 체이닝 (N개 클립)
ffmpeg -i clip1.mp4 -i clip2.mp4 -i clip3.mp4 \
  -filter_complex "
    [0][1]xfade=transition=fade:duration=0.5:offset=2.5[v01];
    [v01][2]xfade=transition=slideleft:duration=0.5:offset=5.0[out]
  " -map "[out]" output.mp4
```

### 5-4. Canvas 미리보기 (클라이언트)

```typescript
// requestAnimationFrame으로 효과 시뮬레이션
function renderFrame(ctx: CanvasRenderingContext2D, block: ShortstoonBlock, t: number) {
  const { scale, offset_x, offset_y } = block.viewport;
  // viewport 기반 크롭 계산
  // effect_type에 따라 t(시간)에 맞는 transform 적용
  // drawImage로 Canvas에 렌더링
}
```

---

## 6. 구현 단계

### Phase 1 — 기반 + 업로드
- [ ] DB 마이그레이션 (`shortstoon_projects`, `shortstoon_blocks`)
- [ ] `/app/shortstoon/page.tsx` — 프로젝트 목록
- [ ] `/app/shortstoon/[id]/page.tsx` — 편집 페이지 기본 구조
- [ ] `/app/api/shortstoon/route.ts` — CRUD
- [ ] 벌크 이미지 업로드 (drag & drop, Supabase Storage `shortstoon-files` 버킷)
- [ ] 블록 순서 드래그 재정렬

### Phase 2 — 뷰포트 편집 + 실시간 미리보기
- [ ] `ViewportEditor.tsx` — Canvas 기반 뷰포트 편집기
  - 9:16 고정 프리뷰 컨테이너
  - 이미지 드래그 → offset_x/y 업데이트
  - 슬라이더 → scale 업데이트
  - 실시간 Canvas 렌더
- [ ] `EffectPreview.tsx` — 효과 애니메이션 시뮬레이션 (requestAnimationFrame)
- [ ] 효과 + 트랜지션 선택 UI
- [ ] 블록 복사 기능

### Phase 3 — 렌더링
- [ ] `/app/api/shortstoon/render/route.ts` — 개별 블록 FFmpeg 렌더링
  - viewport → FFmpeg crop 파라미터 변환 로직
  - effect_type → FFmpeg 필터 적용
  - Supabase Storage 업로드
- [ ] `/app/api/shortstoon/ai-render/route.ts` — AI 모션 효과 (Wan2.2)
  - webtoonanimation 5090 탭 코드 참고
- [ ] `/app/api/shortstoon/merge/route.ts` — 전체 병합 (xfade 트랜지션)

### Phase 4 — 마무리
- [ ] 전체 미리보기 플레이어 (블록 자동 전환)
- [ ] 더그림 네비게이션에 숏스툰 링크 추가
- [ ] 오류 처리 및 UX 정리

---

## 7. 파일 구조 (완성 후)

```
app/
├── shortstoon/
│   ├── page.tsx                          # 프로젝트 목록
│   └── [id]/
│       └── page.tsx                      # 편집 페이지
├── api/
│   └── shortstoon/
│       ├── route.ts                      # CRUD
│       ├── render/
│       │   └── route.ts                  # FFmpeg 블록 렌더링
│       ├── ai-render/
│       │   └── route.ts                  # Wan2.2 AI 효과
│       └── merge/
│           └── route.ts                  # 트랜지션 병합

components/
└── shortstoon/
    ├── ViewportEditor.tsx                # 크롭/패닝 Canvas 편집기
    ├── EffectPreview.tsx                 # 효과 실시간 시뮬레이션
    ├── EffectSelector.tsx                # 효과 선택 UI
    ├── TransitionSelector.tsx            # 트랜지션 선택 UI
    ├── BlockCard.tsx                     # 블록 카드 (목록)
    └── BlockUploader.tsx                 # 벌크 업로드

supabase/
└── migrations/
    └── YYYYMMDD_shortstoon_tables.sql
```

---

## 8. 재사용할 기존 코드

| 기존 코드 | 재사용 방법 |
|-----------|-------------|
| `app/api/webtoonanimation/moving-webtoon/merge/route.ts` | FFmpeg 병합 로직 참고 |
| `components/webtoonanimation/CutUploader.tsx` | 벌크 업로드 UI 참고 |
| 5090 탭 Wan2.2 API 호출 부분 | AI 모션 효과 API 재사용 |
| `@dnd-kit` 드래그 정렬 | 블록 순서 재정렬 |
