# WebtoonAnimation 영상 생성 시스템 분석 문서

> 작성일: 2026-03-29 | 현재 구현 기준

---

## 1. 전체 아키텍처

```
Frontend (Next.js)
    │
    ▼ HTTP POST
Next.js API Routes (/api/webtoonanimation/*)
    │
    ├─→ Veo 3.1 API (Google) — 세그먼트, 테스트
    ├─→ Fal.ai — 테스트랩 11개 모델
    ├─→ Gemini API — 프레임 생성, 프롬프트 생성
    └─→ Lightsail Relay (api.rewardpang.com)
              │
              └─→ ComfyUI (로컬) — WAN 2.2 / LTX 2.3
                       │
                       └─→ Supabase Storage + DB 업데이트
```

---

## 2. 4개 탭 구조

### 탭 1: 5090 탭 (WAN 2.2 / LTX 2.3)
ComfyUI 기반 영상 생성. 컷별 프레임 준비 후 영상 생성.

**작업 순서:**
1. Step 1 (Colorize): Gemini로 흑백 컷 → 컬러화
2. Step 2 (Anchor Frame): Gemini로 앵커 프레임 생성
3. Step 3 (Other Frame): Gemini로 시작/끝 프레임 생성 (frame_role 따라)
4. Before Frame (선택): 이전 컷 상태 예측 프레임
5. 영상 생성: ComfyUI(WAN 2.2) 또는 LTX 2.3

### 탭 2: testlab (VideoTestLab)
11개 AI 모델로 빠른 실험.

**지원 모델 (Fal.ai 기반):**

| 모델 | 입력 모드 | 비용/초 | 안전성 |
|------|---------|---------|--------|
| Veo 3.1 Fast | single / start_end | - | moderate |
| Kling 2.0 | single | $0.04 | moderate |
| Kling O3 Pro | single / character_ref | $0.112 | moderate |
| Kling O3 Standard | single / character_ref | $0.056 | moderate |
| Pika 2.2 | single | $0.07 | moderate |
| Luma Ray 2 | single / start_end | $0.05 | moderate |
| Wan 2.1 FLF2V | start_end | $0.03 | lenient |
| Wan 2.1 I2V | single | $0.03 | lenient |
| Hunyuan I2V | single | $0.04 | lenient |
| Veo 3.1 (Ref) | character_ref | $0.20 | moderate |
| Vidu Q1 (Ref) | character_ref | $0.08 | moderate |

**입력 모드:**
- `single_image`: 컷 1장 (start)
- `start_end_frame`: 시작+끝 컷
- `multi_reference`: 여러 컷 (모두 reference)
- `character_reference`: 캐릭터 이미지 참조

### 탭 3: segments (SegmentPlanner)
컷 쌍 → 개별 영상 → FFmpeg 병합.

- **모델**: Veo 3.1 고정
- **프롬프트**: Gemini 자동 생성
- 개별/일괄 생성 후 merge

### 탭 4: seedance (SeedancePromptEditor)
Seedance API용 프롬프트 생성만 가능 (API 미연동).

- Gemini로 컷 범위 → 스토리보드 이미지 생성 → Seedance 프롬프트 생성
- 결과물: 텍스트 프롬프트만 (실제 영상 생성 없음)

---

## 3. 영상 생성 플로우별 상세

### 3.1 5090 탭 (ComfyUI WAN 2.2)

```
POST /api/webtoonanimation/generate-comfyui-video
Body: { cutId, seed? }

→ Lightsail relay로 비동기 제출 (즉시 반환)
→ 프론트 DB 폴링 (8초 간격, 최대 10분)
→ comfyui_video_url 업데이트 감지 시 완료
```

**Lightsail에 전달되는 파라미터:**
```json
{
  "cut_id": "uuid",
  "start_url": "앵커 프레임 URL",
  "end_url": "끝 프레임 URL",
  "prompt": "video_prompt",
  "seed": 123456,
  "num_frames": 113,
  "prefix": "cut_xxx_seed",
  "storage_path": "webtoonanimation/{projectId}/{cutId}/comfyui_123456.mp4",
  "supabase_url": "...",
  "supabase_key": "..."
}
```

### 3.2 5090 탭 (LTX 2.3)

```
POST /api/webtoonanimation/generate-ltx23-video
Body: { cutId, seed? }

→ 동일한 Lightsail relay 경로
→ 960x544, 25fps, 97프레임 (~4초)
```

### 3.3 testlab 탭 (Fal.ai / Veo)

```
POST /api/webtoonanimation/generate-test-video
Body: {
  projectId, provider, inputMode,
  cutIndices, prompt, duration, aspectRatio,
  beforeFrameUrl?, characterRefs?
}

→ API 서버에서 직접 Fal.ai/Veo 폴링 (5초 간격, 최대 10분)
→ 완료 시 영상 다운로드 → Supabase Storage → DB 저장
→ webtoonanimation_video_tests 테이블 상태 업데이트
```

### 3.4 segments 탭 (Veo)

```
POST /api/webtoonanimation/auto-segments
Body: { projectId, rangeStart, rangeEnd, durationSeconds, aspectRatio }
→ 컷 범위 → 연속 쌍 생성 → Gemini 프롬프트 자동 생성
→ webtoonanimation_video_segments 테이블 저장 (status: pending)

POST /api/webtoonanimation/generate-segment-video
Body: { segmentId }
→ 시작/끝 컷 이미지 다운로드 → Veo 호출 (동기)
→ 완료 시 Storage 업로드 → status: completed

POST /api/webtoonanimation/merge-segment-videos
Body: { groupId }
→ 세그먼트 영상들 → FFmpeg 병합 → 최종 영상
```

### 3.5 타임라인 렌더링

```
POST /api/webtoonanimation/render-timeline
Body: {
  projectId,
  items: [{ cutId, videoUrl, trimStart, trimEnd, transition }]
}

→ Lightsail relay로 비동기 제출 (즉시 반환)
→ 프론트 DB 폴링 (8초 간격, 최대 10분)
→ timeline_rendered_url 업데이트 감지 시 완료
```

---

## 4. 폴링 방식 비교

| 방식 | 위치 | 간격 | 타임아웃 | 사용처 |
|------|------|------|---------|--------|
| DB 폴링 | 프론트엔드 | 8초 | 10분 | ComfyUI, LTX 2.3, 타임라인 |
| Fal.ai 폴링 | API 서버 | 5초 | 10분 | testlab (Kling/Pika/Luma 등) |
| Veo 스트림 | API 서버 | (스트림) | 10분 | segments, testlab(Veo) |

**DB 폴링 문제점:**
- Lightsail background task 타임아웃이 5분 → 대기열 쌓이면 2~3번째 요청부터 소실
- 자세한 개선 계획: `docs/concurrent-video-generation-plan.md` 참고

---

## 5. 저장 구조

**Supabase Storage (`webtoon-files` 버킷):**
```
webtoonanimation/{projectId}/
├─ {cutId}/
│  ├─ comfyui_{seed}.mp4       (WAN 2.2 결과)
│  ├─ ltx23_{seed}.mp4         (LTX 2.3 결과)
│  ├─ before-frame-{idx}-{ts}.png
│  └─ 각 프레임 이미지들
├─ test-{testId}-{ts}.mp4      (testlab 결과)
├─ segment-{groupId}-{idx}-{ts}.mp4  (segments 결과)
├─ timeline_{ts}.mp4           (타임라인 최종 렌더)
└─ prompt-group/storyboard-{groupId}-{ts}.png
```

**DB 테이블 목록:**
- `webtoonanimation_projects` — 프로젝트, timeline_rendered_url
- `webtoonanimation_cuts` — 컷 이미지, comfyui_video_url, video_history[]
- `webtoonanimation_prompt_groups` — Seedance 프롬프트 그룹
- `webtoonanimation_cut_prompts` — 컷별 세부 프롬프트
- `webtoonanimation_video_tests` — testlab 결과
- `webtoonanimation_video_segments` — segments 결과

---

## 6. 영상 이력 관리

```
comfyui_video_url  → 현재 최신 영상 URL
video_history[]    → 이전 버전들 (최신순)

새 생성 시:
  이전 URL → video_history에 push
  comfyui_video_url = null (생성 중)
  생성 완료 → comfyui_video_url = 새 URL

타임라인에서:
  video_history를 순환하며 버전 선택 가능
```

---

## 7. 현재 미구현 / 알려진 이슈

| 항목 | 상태 | 비고 |
|------|------|------|
| Seedance API 연동 | 미구현 | 프롬프트 생성만 가능 |
| 동시 다중 사용자 큐잉 | 미구현 | 상세: concurrent-video-generation-plan.md |
| WebSocket 실시간 상태 | 미구현 | 현재 8초 폴링 |
| ComfyUI 워크플로우 다양화 | 고려 안 됨 | WAN 2.2 / LTX 2.3 고정 |
| 프레임 이미지 캐싱 | 미흡 | 매번 재생성 가능 |
