# 세그먼트 기반 웹툰 영상 생성 계획

## 배경
Seedance 2.0은 content safety violation이 빈번하고, API 출시도 무기한 연기됨.
웹툰은 이미 캐릭터 일관성이 확보된 이미지이므로, 인접 컷 쌍을 이용한 세그먼트 방식이 더 적합.

## API 추천 (조사 결과)

| API | 시작/끝 프레임 | 해상도 | 콘텐츠 안전 | 비용(5초) | 상태 |
|-----|-------------|--------|-----------|---------|------|
| **Veo 3.1 Fast** | ✅ / ✅ | 720p | 보통 | ~$0.75 | ✅ 이미 통합됨 |
| **Seedance 1.5 Pro** | ✅ / ✅ | 720p | **관대** | ~$0.26 | inference.sh 사용 가능 |
| **LTX-2** | ✅ / ✅ | 4K | **가장 관대** | ~$0.20 | fal.ai / 공식 API |
| Kling 2.1 | ✅ / ✅ | 1080p | ❌ 매우 엄격 | ~$0.56 | 비추 |
| Runway Gen-4 | ✅ / ❌ | 1080p | 엄격 | ~$0.50 | 끝 프레임 미지원 |

**추천**: Veo 3.1 Fast(기본, 이미 통합) + 향후 Seedance 1.5 Pro/LTX-2 추가 가능한 구조

## 핵심 아키텍처: 세그먼트 기반 생성

```
컷1 → 컷2 : 세그먼트 1 (4초 클립)
컷2 → 컷3 : 세그먼트 2 (4초 클립)
컷3 → 컷5 : 세그먼트 3 (6초 클립, 건너뛰기 가능)
컷5 (단독) : 세그먼트 4 (끝 프레임 없이)
                ↓
        FFmpeg로 자동 합치기 → 최종 영상
```

## 구현 계획

### 1단계: DB 스키마 추가

```sql
CREATE TABLE webtoonanimation_video_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES webtoonanimation_prompt_groups(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,          -- 순서
  start_cut_index INTEGER NOT NULL,        -- 시작 컷 인덱스
  end_cut_index INTEGER,                   -- 끝 컷 인덱스 (NULL = 단독 시작 프레임)
  prompt TEXT NOT NULL DEFAULT '',          -- 영상 프롬프트
  api_provider TEXT DEFAULT 'veo',         -- 'veo' | 'seedance15' | 'ltx2'
  duration_seconds INTEGER DEFAULT 4,      -- 클립 길이
  aspect_ratio VARCHAR(10) DEFAULT '16:9',
  status TEXT DEFAULT 'pending',           -- pending | generating | completed | failed
  video_path TEXT,                         -- Supabase Storage 경로
  video_url TEXT,                          -- 공개 URL
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(group_id, segment_index)
);
```

### 2단계: API 라우트 추가

**`POST /api/webtoonanimation/auto-segments`** — 자동 세그먼트 생성
- 입력: projectId, rangeStart, rangeEnd, duration
- 동작: 연속 컷 쌍으로 세그먼트 자동 생성 + Gemini로 각 세그먼트 프롬프트 생성
- 출력: 세그먼트 배열

**`POST /api/webtoonanimation/generate-segment-video`** — 단일 세그먼트 영상 생성
- 입력: segmentId
- 동작:
  1. 시작/끝 컷 이미지 다운로드
  2. Veo 3.1 Fast API 호출 (start_image + end_image + prompt)
  3. 결과 영상을 Supabase Storage에 저장
  4. status 업데이트
- 출력: 영상 URL

**`POST /api/webtoonanimation/merge-segment-videos`** — 세그먼트 영상 합치기
- 입력: groupId (또는 segmentId 배열)
- 동작: completed 세그먼트 영상들을 FFmpeg로 합치기 (기존 merge-videos 로직 재활용)
- 출력: 합쳐진 영상 다운로드

### 3단계: 프롬프트 생성 (Gemini)

기존 Seedance용 프롬프트 대신, **세그먼트별 짧은 프롬프트** 생성:
- 입력: 시작 컷 이미지 + 끝 컷 이미지 (2장만)
- Gemini에게 "이 두 프레임 사이의 자연스러운 전환 동작을 영어로 1-2문장 묘사해줘" 요청
- 기존 cinematic language 규칙 유지 (content safety 우회용)
- 짧고 단순한 프롬프트 → violation 확률 대폭 감소

### 4단계: UI 변경

**기존 Seedance 모드 유지 + 새 탭 추가:**

```
[Seedance 프롬프트] [세그먼트 영상]  ← 탭 전환
```

**세그먼트 영상 탭 UI:**
```
┌─────────────────────────────────────────────────┐
│ 📊 세그먼트 플래너                                │
│ [자동 생성] 버튼 (연속 쌍으로 자동 분할)            │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ #1  [컷1 썸네일] → [컷2 썸네일]  4초          │ │
│ │     "Slow dolly push, figure turns..."       │ │
│ │     [생성] [✅완료] [🔄재생성] [❌삭제]         │ │
│ ├──────────────────────────────────────────────┤ │
│ │ #2  [컷2 썸네일] → [컷3 썸네일]  4초          │ │
│ │     "Wide tracking shot, camera pans..."     │ │
│ │     [생성] [대기중]                            │ │
│ ├──────────────────────────────────────────────┤ │
│ │ #3  [컷3 썸네일] → [컷5 썸네일]  6초          │ │
│ │     (프롬프트 직접 편집 가능)                   │ │
│ │     [생성] [대기중]                            │ │
│ ├──────────────────────────────────────────────┤ │
│ │ [+ 세그먼트 추가]                              │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [전체 생성] [합치기 & 다운로드]                     │
└─────────────────────────────────────────────────┘
```

**각 세그먼트 행:**
- 시작/끝 컷 썸네일 (드롭다운으로 변경 가능)
- 프롬프트 텍스트 (편집 가능, AI 자동생성 가능)
- 길이 선택 (4/6/8초)
- 상태: 대기 → 생성중 → 완료/실패
- 완료 시 미리보기 재생 가능

### 5단계: 파일 구조

```
lib/video-generation/
  veo.ts                  (기존 - 변경 없음)
  types.ts                (기존 - 변경 없음)

app/api/webtoonanimation/
  auto-segments/route.ts         (NEW)
  generate-segment-video/route.ts (NEW)
  merge-segment-videos/route.ts  (NEW)

components/webtoonanimation/
  SegmentPlanner.tsx       (NEW - 세그먼트 편집기)
  SegmentRow.tsx           (NEW - 개별 세그먼트 행)
  VideoPreview.tsx         (NEW - 영상 미리보기)

app/webtoonanimation/page.tsx  (MODIFY - 탭 추가)
```

## 장점

1. **Content safety 위반 대폭 감소**: 짧고 단순한 프롬프트 + 이미지 쌍 방식
2. **실패 격리**: 한 세그먼트 실패해도 나머지 영향 없음, 개별 재생성 가능
3. **유연한 편집**: 세그먼트 추가/삭제/순서변경/건너뛰기 자유
4. **점진적 결과**: 생성되는 대로 바로 미리보기 가능
5. **확장 가능**: API provider 필드로 향후 Seedance 1.5 Pro, LTX-2 등 쉽게 추가
6. **기존 인프라 활용**: Veo 통합 + FFmpeg 합치기 모두 이미 구현됨
