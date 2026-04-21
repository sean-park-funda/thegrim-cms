# 5090 탭 상세 분석 문서

> 작성일: 2026-03-29 | 코드 기준 분석

---

## 1. 전체 워크플로우 개요

```
컷 업로드
    │
    ▼
[설정] 역할·비율·컬러화 여부
    │
    ▼
[전체 프롬프트 자동 생성] — Gemini-2.5-flash
    │
    ├─ STEP 1: 컬러화    (Gemini image → color_image_url)
    ├─ STEP 2: 앵커 프레임  (Gemini image → start/end_frame_url)
    ├─ STEP 3: 나머지 프레임 (Gemini image → 반대쪽 frame_url)
    └─ STEP 4: 영상 생성  (ComfyUI WAN 2.2 or LTX 2.3)
```

---

## 2. UI 구성 요소 및 상태 매핑

### 헤더 설정 영역

| UI 요소 | 상태 변수 | 저장 방식 | 비고 |
|--------|---------|---------|------|
| 연출 설명 Textarea | `synopsis` | debounce 600ms | `cut_synopsis` |
| 이전 컷 이어받기 Switch | `usePrevCut` | 즉시 | `use_prev_cut_as_start` |
| 원본 컷 역할 (시작/끝/중간) | `frameRole` | debounce | `frame_role` |
| 비율 (16:9 / 9:16) | `aspectRatio` | debounce | `aspect_ratio` |
| 컬러화 Switch | `useColorize` | debounce | `use_colorize` |
| 컬러화 레퍼런스 이미지 | `colorizeRefUrl` | 즉시 | `colorize_reference_url` |

### 조건부 렌더링 규칙

```
STEP 1 (컬러화)    : useColorize === true일 때만 표시
STEP 3 (나머지 프레임):
    - usePrevCut === true  → PrevCutCard 표시 (이전 컷 끝 프레임, 읽기 전용)
    - frameRole !== 'middle' → StepCard 표시
    - frameRole === 'middle' && usePrevCut=false → 숨김
```

### frameRole 의미 정리

| frame_role | STEP 2 결과 | STEP 3 결과 | 영상 start | 영상 end |
|-----------|------------|------------|-----------|---------|
| `'end'` (기본) | end_frame_url | start_frame_url | start | end |
| `'start'` | start_frame_url | end_frame_url | start | end |
| `'middle'` | start_frame_url = end_frame_url | 없음 | anchor | anchor |

---

## 3. 프롬프트 자동 생성

**API:** `POST /api/webtoonanimation/generate-cut-prompts`
**모델:** Gemini-2.5-flash (비전)

**입력:** 컷 이미지 + 연출 설명 + 설정값
**출력:** 5종 프롬프트 (각각 EN + KO)

| 프롬프트 | DB 필드 | 용도 |
|---------|--------|------|
| gemini_colorize | `gemini_colorize_prompt` | STEP 1 |
| gemini_expand | `gemini_expand_prompt` | STEP 2 |
| gemini_other_frame | `gemini_start_frame_prompt` | STEP 3 |
| video_prompt | `video_prompt` | STEP 4 |

**프롬프트 생성 지침 (서버 내부):**
- `gemini_colorize`: useColorize=false면 빈 문자열, colorize_reference_url 있으면 "색상 매치" 지시 포함
- `gemini_expand`: "비율 확장, 배경만 연장, 캐릭터 추가 금지" 고정 방향
- `gemini_other_frame`: frame_role='end'이면 "액션 전 상태", 'start'이면 "액션 완료 후 상태"
- `video_prompt`: "Anime style, Korean webtoon aesthetic"으로 시작, 모션+감정+카메라 2~4문장

---

## 4. STEP별 구현 상세

### STEP 1: 컬러화

**API:** `POST /api/webtoonanimation/generate-frames { cutId, step: 'colorize' }`
**모델:** Gemini-3.1-flash-image-preview

**Gemini 입력 구성:**
```
1. text: gemini_colorize_prompt (+ 수정 지시 있으면 append)
2. (프로젝트에 character_ref_url이 있으면) image: 캐릭터시트 + 설명 텍스트
3. (컷에 colorize_reference_url이 있으면) image: 배경/환경 레퍼런스 + 설명 텍스트
4. image: 원본 라인아트 (필수, 마지막에)
```

**저장:** `color_image_url` 업데이트
**Storage 경로:** `webtoonanimation/{projectId}/{cutId}/color_{timestamp}.png`

---

### STEP 2: 앵커 프레임 확장

**API:** `POST /api/webtoonanimation/generate-frames { cutId, step: 'anchor' }`
**모델:** Gemini-3.1-flash-image-preview

**입력 이미지 결정 로직:**
```
useColorize=true AND step='anchor' 단독 실행:
    → color_image_url 이미지 재사용 (STEP1 재생성 방지)

useColorize=true AND step 없음(전체 실행):
    → STEP1에서 방금 생성한 컬러 이미지 사용

useColorize=false:
    → 원본 라인아트 직접 사용
```

**Gemini 입력:** `gemini_expand_prompt` + 위 이미지 + (배경 레퍼런스 있으면 추가)

**저장 (frame_role에 따라):**
- `'start'` → `start_frame_url`
- `'end'` → `end_frame_url`
- `'middle'` → `start_frame_url` = `end_frame_url` (같은 이미지)

---

### STEP 3: 나머지 프레임

**API:** `POST /api/webtoonanimation/generate-frames { cutId, step: 'other' }`
**모델:** Gemini-3.1-flash-image-preview

**실행 조건 (서버):**
- `frameRole !== 'middle'`
- `usePrevCut === false`

**입력:** `gemini_start_frame_prompt` + STEP 2에서 생성한 앵커 이미지

**저장 (frame_role에 따라 반대쪽):**
- `'end'` → `start_frame_url`
- `'start'` → `end_frame_url`

**PrevCutCard (usePrevCut=true일 때):**
- 이전 컷의 `end_frame_url` (또는 `color_image_url`)을 start 프레임으로 고정 표시
- STEP 3 자체 생성 없음 (이미 이전 컷 프레임 사용)

---

### STEP 4: 영상 생성

#### WAN 2.2 (ComfyUI)

**API:** `POST /api/webtoonanimation/generate-comfyui-video { cutId, seed? }`

**서버 처리:**
```
1. frame_role에 따라 start/end URL 결정
   - 'middle' → start = end = start_frame_url
   - 그 외 → start = start_frame_url, end = end_frame_url

2. video_history 처리:
   기존 comfyui_video_url → video_history에 prepend
   comfyui_video_url = null (생성 중 표시)

3. Lightsail relay로 비동기 제출:
   POST api.rewardpang.com/comfyui/generate-video
   {
     cut_id, start_url, end_url, prompt,
     seed, num_frames (duration * 16 + 1),
     storage_path, supabase_url, supabase_key
   }

4. 즉시 반환: { polling: true }
```

**영상 길이 선택:** 3, 5, 7, 9, 10초 (사용자 선택)
**fps:** 16fps → 7초 = 113 프레임

#### LTX 2.3

**API:** `POST /api/webtoonanimation/generate-ltx23-video { cutId, seed? }`

**차이점:**
- `num_frames`: 97 고정 (~4초 @ 25fps)
- relay 엔드포인트: `/comfyui/generate-video-ltx23`
- 영상 길이 선택 UI 없음
- 오디오 자동 포함
- 해상도: 960×544

---

## 5. 폴링 로직

**위치:** `Wan22CutCard.tsx` `handleGenVideo()` 내부

```typescript
// polling: true 받으면 시작
while (Date.now() - startTime < 5 * 60 * 1000) {  // 5분 제한
  await sleep(10000);                               // 10초 대기

  const poll = await GET /api/webtoonanimation/cuts/{cutId}
  if (poll.comfyui_video_url) {
    // 완료: 상태 업데이트 후 종료
    setVideoUrl(poll.comfyui_video_url);
    setVideoHistory(poll.video_history || []);
    break;
  }
}
// 5분 초과 → 타임아웃 에러
```

**GET /api/webtoonanimation/cuts/[cutId]:**
→ `id, comfyui_video_url, video_history, start_frame_url, end_frame_url` 반환

---

## 6. 영상 히스토리 관리

**저장 구조:**
- `comfyui_video_url`: 최신 영상 URL (또는 null = 생성 중)
- `video_history[]`: 이전 영상 URL들 (최신순)

**생성 시 흐름:**
```
기존 URL → video_history에 prepend
comfyui_video_url = null
...(생성 중)...
Lightsail이 comfyui_video_url = 새 URL로 업데이트
```

**UI:**
```
allVideos = [videoUrl, ...videoHistory]

최신 | #1 | #2 | ...  ← 버튼으로 선택 가능
```

---

## 7. 데이터 저장 방식

### Debounced 저장 (600ms)
텍스트 입력, 버튼 선택 등 UX 중 발생:
- `PATCH /api/webtoonanimation/generate-cut-prompts { cutId, field, value }`
- 화이트리스트 방식 (허용된 필드만 업데이트)

### 즉시 저장
API 결과 반영 후:
- `onCutUpdated({ ...cut, ...patch })` → 부모 `setCuts` 호출
- UI가 낙관적으로 업데이트됨 (서버 응답 값으로 직접 세팅)

---

## 8. AI 프롬프트 수정 (Refine)

**STEP 카드마다 Wand 아이콘 → 수정 지시 입력 → 재생성**

**API:** `POST /api/webtoonanimation/refine-frame-prompt`
**모델:** Gemini-2.5-flash

**입력:** 기존 프롬프트(EN+KO) + 수정 지시
**출력:** 개선된 프롬프트(EN+KO)
**저장:** 즉시 UI 반영 + DB 저장

---

## 9. 이전 컷 이어받기 (usePrevCut)

**토글 ON 시:**
1. 이전 컷의 `end_frame_url` (없으면 `color_image_url`)을 colorize_reference_url로 자동 설정
2. 기존 colorize 프롬프트를 새 레퍼런스에 맞게 자동 수정 (refineColorizeForRef)
3. `frame_role`을 `'end'`로 강제 (시작 프레임 불필요)
4. STEP 3: 이전 컷 끝 프레임 표시 (읽기 전용)
5. 영상 생성 시: `start_frame_url = 이전 컷 end_frame_url`로 PATCH 후 영상 생성

**영상 생성 직전 처리:**
```typescript
if (usePrevCut && prevCut?.end_frame_url) {
  // start_frame_url을 이전 컷 끝 프레임으로 임시 교체
  await PATCH(cutId, 'start_frame_url', prevCut.end_frame_url);
}
```

---

## 10. 알려진 이슈 / 개선 포인트

| 항목 | 현황 | 비고 |
|------|------|------|
| 폴링 타임아웃 | 5분 | Lightsail 처리 시간이 5분 넘으면 실패로 표시되나 실제론 계속 처리됨 |
| 동시 생성 | 미구현 | 여러 컷 동시 생성 시 큐 없음 |
| 중간 프레임(middle) LTX | 미검증 | start=end 로 동일 이미지 전달 시 WAN 2.2에서만 검증됨 |
| Seedance 연동 | 없음 | 프롬프트 생성까지만 가능 |
| WAN 2.2 실제 모델 | Lightsail 내부 | 코드에서 직접 확인 불가 (relay 통해 처리됨) |

---

## 11. 배경 일관성 이슈 (usePrevCut 시나리오)

### 발생 조건

`usePrevCut=true`인 컷에서 배경이 고정되고 캐릭터 연출만 변하는 씬.

### 현재 프레임 생성 경로

```
STEP 3 (시작 프레임) = 이전 컷 end_frame_url  ← 이전 컷의 워크플로우 산물
STEP 2 (끝 프레임)  = 현재 컷 라인아트 → 컬러화 → 확장  ← 현재 컷 워크플로우 산물
```

두 이미지가 **서로 다른 워크플로우**에서 생성되므로 배경이 미묘하게 달라짐.

그나마 비슷한 이유: STEP 1 컬러화 시 이전 컷 end_frame_url을 colorize_reference_url로 사용했기 때문. 하지만 레퍼런스는 "참조"일 뿐이므로 완전 일치 보장 불가.

### 근본 원인

현재 컷 라인아트 기반으로 독립적으로 배경을 재생성하는 구조이기 때문.

### 개선 방향: 끝프레임 확장 시 시작프레임을 배경 레퍼런스로 선택적 전달

**전제:**
- 카메라 구도가 바뀌는 씬은 배경을 일치시킬 필요 없음 → 항상 켜면 안 됨
- "배경 레퍼런스를 줄 곳"은 **끝프레임 확장(STEP 2)** 단계 하나
- 줄 이미지는 이미 존재하는 **시작프레임(STEP 3 = 이전 컷 end_frame_url)** — 별도 생성 불필요

**구현 방식:**

STEP 2 expand API 호출 시, 기존 `colorize_reference_url`과 별도로 시작프레임 이미지를 배경 레퍼런스로 추가 전달.

```
끝프레임 Expand Gemini 입력 (배경 일치 ON):
  1. text: gemini_expand_prompt
  2. image: 입력 이미지 (컬러화된 현재 컷)
  3. image: 시작프레임(이전 컷 end_frame_url)  ← 추가
             "[Background reference — match the background, environment, and lighting exactly from this image]"
  4. (기존 colorize_reference_url 있으면 그대로 유지)
```

**UX 설계:**
- STEP 2 카드에 토글 추가: "시작프레임 배경 일치"
- `usePrevCut=true`이고 시작프레임이 존재할 때만 활성화
- 기본값: OFF (카메라 구도 변경 씬에서 의도치 않은 배경 고정 방지)
- 사용자가 씬 성격에 따라 컷별로 ON/OFF 선택

**DB 변경:**
- `webtoonanimation_cuts`에 `use_start_frame_bg_ref boolean default false` 컬럼 추가

**한계:**
- Gemini가 "참조" 수준으로 처리하므로 픽셀 수준 일치는 아님
- 그러나 현재 colorize_reference_url 방식과 동일한 수준이고, 현재도 그 정도 유사도로 실용적으로 사용 중 → 유효할 가능성 높음
