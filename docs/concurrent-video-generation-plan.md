# 다중 사용자 동시 영상 생성 처리 계획

## 현재 구조 분석

### 흐름 요약
```
CMS 브라우저 → Vercel API Route → Lightsail FastAPI → ComfyUI (5090 PC)
```

### 현재 타임아웃 위험

| 구간 | 현재 방식 | 위험 |
|------|-----------|------|
| CMS → Vercel | `maxDuration = 60` (60초) | WAN 2.2 영상 생성 1~5분 → 즉시 504 |
| Vercel → Lightsail | `fetch(relayUrl, ...)` 즉시 반환 (비동기) | Lightsail이 background task로 처리 중 → 이미 해결됨 |
| Lightsail 백그라운드 태스크 | ComfyUI `/history` 8초 간격 폴링, 5분 타임아웃 | **핵심 위험**: 대기열에 5개 쌓이면 1개당 10~15분 → Lightsail 태스크가 먼저 포기 |
| CMS 프론트엔드 | DB 폴링 (`comfyui_video_url` 감시) | 폴링은 계속하지만 진행 상태를 알 수 없음 |

---

## ComfyUI 자체 큐 동작

- ComfyUI는 `/prompt` 제출을 내부 큐에 순서대로 쌓는다.
- GPU는 1개이므로 동시에 1개만 렌더링, 나머지는 `queue_remaining`에 대기.
- ComfyUI 입장에서는 아무 문제 없음 — 모두 순서대로 처리됨.
- **문제는 ComfyUI가 아니라 위 레이어들의 타임아웃 설정.**

---

## 시나리오별 현상

### 시나리오 A: 3명이 동시 생성 요청
1. 3개 요청이 Lightsail에 도달 → 3개 background task 시작
2. ComfyUI 큐: [작업1(처리중), 작업2(대기), 작업3(대기)]
3. 각 작업 소요: WAN 2.2 ≈ 7~15분, LTX 2.3 ≈ 3~5분
4. Lightsail background task는 5분 타임아웃 → 작업2, 3이 타임아웃으로 실패
5. CMS 프론트엔드: `comfyui_video_url`이 영원히 null → 사용자는 "왜 안 되지?" 상태

### 시나리오 B: 혼자 연속 재생성 (현재 가장 흔한 케이스)
1. 이전 생성 완료 전에 재생성 버튼 클릭
2. 새 작업이 ComfyUI 큐에 추가됨 (이전 작업도 여전히 처리 중)
3. DB의 `comfyui_video_url`은 null로 초기화됨
4. 이전 작업 완료 시 DB 업데이트 → 잠시 보이다가 새 작업 완료 시 덮어씀
5. 작동은 하지만 불필요한 GPU 낭비

---

## 개선 계획

### 1. DB에 작업 상태 테이블 추가

```sql
CREATE TABLE video_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cut_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  -- queued | processing | done | failed | timeout
  model text NOT NULL, -- 'wan22' | 'ltx23'
  seed integer,
  comfy_prompt_id text,
  queue_position integer,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### 2. Lightsail 백그라운드 태스크 개선

**현재**: 5분 타임아웃 하드코딩, 실패 시 그냥 종료

**개선안**:
- 타임아웃을 WAN 2.2는 20분, LTX 2.3은 10분으로 늘림
- 시작 시 `jobs` 테이블에 `status=processing`, `comfy_prompt_id` 저장
- ComfyUI `/queue` API로 `queue_position` 주기적으로 업데이트
- 완료 시 `comfyui_video_url` 업데이트 + `status=done`
- 실패/타임아웃 시 `status=failed`, `error_message` 저장

### 3. CMS 프론트엔드 폴링 개선

**현재**: `comfyui_video_url != null`이 될 때까지 5초 간격 DB 폴링

**개선안**:
- `jobs` 테이블도 같이 폴링
- 대기 중일 때: "대기열 X번째" 표시
- 처리 중일 때: 진행 스피너 + 경과 시간 표시
- 실패 시: 에러 메시지 표시 + 재시도 버튼

### 4. 중복 생성 방지 (선택 사항)

- 같은 `cut_id`에 `status=queued|processing`인 작업이 있으면 새 요청 거부
- 또는 경고 다이얼로그: "이미 생성 중입니다. 취소하고 다시 시작할까요?"

---

## 우선순위

| 우선순위 | 항목 | 이유 |
|----------|------|------|
| 🔴 높음 | Lightsail 타임아웃 연장 (20분) | 현재 다중 사용자 시 작업 소실 |
| 🔴 높음 | jobs 테이블 + status 저장 | 실패 감지 불가 문제 해결 |
| 🟡 중간 | 프론트엔드 대기열 위치 표시 | UX 개선 |
| 🟡 중간 | 실패 시 에러 표시 | 현재 "무한 로딩" 방지 |
| 🟢 낮음 | 중복 요청 방지 | 단독 사용 시 불필요 |

---

## 단기 임시 해결 (개발 전 즉시 적용 가능)

1. Lightsail `POLLING_TIMEOUT` 환경변수를 `1200`(20분)으로 변경
2. CMS에서 생성 버튼 클릭 후 "생성 중..." 상태를 최소 20분 유지
3. 팀 내 규칙: 동시에 1명만 생성 (운영 정책)
