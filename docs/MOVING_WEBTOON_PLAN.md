# 무빙웹툰 기능 고도화 계획

> 기반 문서: `docs/methodology-conti-to-video.md`
> 작성일: 2026-03-20

---

## 현재 상태 분석

`/app/webtoonanimation`에 이미 기본 파이프라인이 존재한다:

- 프로젝트 관리 + 컷 이미지 업로드
- 탭 구조: Seedance 프롬프트 / Test Lab / Segment 플래너
- fal.ai API 경유 영상 생성 (Kling, Veo, Seedance)
- 세그먼트 모드: 컷 쌍(start→end) 선택 후 영상 생성

**빠진 것**: 라인아트 → 컬러 프레임 자동 생성 파이프라인, 구조화된 4종 프롬프트 시스템, 다중 해석 베리에이션 생성

---

## 핵심 도입 아이디어 (방법론 → CMS 적용)

### 1. Gemini 프레임 생성 파이프라인

방법론의 Phase 3를 CMS에 통합한다. 현재는 컷 이미지를 직접 start/end로 사용하는데, Gemini를 거쳐 **컬러화 → 16:9 확장 → Start Frame**을 자동 생성하는 단계를 추가한다.

```
현재: [컷 이미지(라인아트)] → 직접 영상 생성
개선: [컷 이미지(라인아트)] → Gemini 컬러화 → Gemini 16:9 확장(End Frame) → Gemini Start Frame → 영상 생성
```

**장점**: 라인아트 컷에서 바로 영상 생성 가능. 별도 채색 작업 없이 AI가 처리.

---

### 2. 4종 프롬프트 구조화

현재 단일 프롬프트 에디터를 4종으로 구조화:

| 프롬프트 | 용도 | 입력 | 출력 |
|---------|------|------|------|
| `gemini_colorize` | 라인아트 컬러화 | 컬러 레퍼런스 + 라인아트 | 컬러 이미지 |
| `gemini_expand` | 16:9 확장 | 컬러 이미지 | End Frame (1376×768) |
| `gemini_start_frame` | Start Frame 생성 | End Frame | Start Frame (동일 카메라 뷰) |
| `video_prompt` | 영상 생성 | Start + End Frame | 7초 영상 |

각 컷마다 4종 프롬프트를 저장하는 DB 구조 필요.

---

### 3. 캐릭터 컬러 레퍼런스 관리

현재 프로젝트 단위로 캐릭터 레퍼런스가 없다. 프로젝트에 캐릭터 레퍼런스 이미지를 등록하고, Gemini 컬러화 시 자동으로 첨부한다.

---

### 4. 에이전트 베리에이션 시스템

방법론의 Phase 5. 동일한 콘티를 여러 해석으로 자동 생성:

- **단일 생성**: 기존 방식 유지 (직접 프롬프트 작성 후 1개 생성)
- **베리에이션 생성**: 콘티 기획서를 AI에게 주면 N개의 독립적 프롬프트 세트 자동 작성 → 각각 영상 생성
- 각 베리에이션은 색감이 아니라 **카메라 워크, 모션 강도, 액션 해석**이 달라짐

---

### 5. Wan 2.2 (ComfyUI) 엔진 추가

현재 fal.ai 기반 영상 생성에 **로컬 ComfyUI (5090 PC)** 옵션 추가:

- 비용: fal.ai 유료 vs ComfyUI 무료 (전기세만)
- 속도: 컷당 ~60초 (Distill LoRA 4-step)
- 방법론에 ComfyUI 워크플로우 JSON이 완전히 문서화되어 있어 바로 적용 가능
- 기존 API 라우트에 `engine: 'comfyui' | 'fal'` 옵션 추가

---

### 6. 콘티 기획서 입력 필드

프로젝트 단위로 **콘티 기획서 텍스트** 입력란 추가. 에피소드 서사, 컷별 설명, 등장인물 설정을 저장한다. 베리에이션 생성 시 이 텍스트가 AI 브리프로 활용된다.

---

### 7. 컷별 기획 입력 → 4종 프롬프트 자동 생성

컷 단위로 **기획 텍스트**(구도, 액션, 감정, 등장인물)를 입력하면 AI가 4종 프롬프트를 자동 생성한다.

**입력 → 출력 흐름**:
```
[컷별 기획 텍스트]
  예) "복도 등장. 희원이 오른쪽에서 걸어 들어와 중앙에서 멈춘다. 빈 복도, 긴장감."
  + 캐릭터 설정 (프로젝트에 등록된 것 자동 참조)
         │
         ▼
    AI (Claude/Gemini)
         │
         ▼
[4종 프롬프트 자동 초안]
  - gemini_colorize
  - gemini_expand
  - gemini_start_frame
  - video_prompt
```

**UI**: 컷 카드에 "기획 메모" 입력란 → "프롬프트 생성" 버튼 → 4종 프롬프트 에디터에 초안 채워짐 → 사용자가 수정 후 확정

**AI 브리프 구조**:
```
아래 컷 기획을 읽고 4종 프롬프트를 작성해주세요.

[컷 기획]: {cut_synopsis}
[캐릭터 설정]: {character_settings}
[컷 유형]: {frame_strategy} (등장/퇴장/표정변화/빈배경→액션)

주의사항:
- gemini_colorize: 캐릭터 색상 정확히 명시, 화풍 지정
- gemini_expand: 16:9 확장 방향, 추가 배경 요소, 캐릭터 위치
- gemini_start_frame: End Frame과 동일 카메라 뷰 유지 필수
- video_prompt: "Anime style, Korean webtoon aesthetic"으로 시작, 구체적 모션 서술
```

**DB**: `webtoon_animation_cuts.cut_synopsis text` 컬럼 추가

---

## 구현 단계

### Phase A — Gemini 프레임 파이프라인 (우선순위 1)

**대상 파일**: `/app/api/webtoonanimation/` 신규 라우트, Gemini SDK 연동

1. `POST /api/webtoonanimation/generate-frames` 엔드포인트 생성
   - 입력: `cut_id`, `colorize_prompt`, `expand_prompt`, `start_frame_prompt`
   - Gemini 3단계 순차 실행 (컬러화 → 확장 → Start Frame)
   - 결과 이미지를 Supabase Storage에 저장, URL 반환

2. UI: 컷 카드에 "프레임 생성" 버튼 추가
   - 생성 중 로딩 상태 표시
   - color / end_frame / start_frame 미리보기

3. 캐릭터 레퍼런스: 프로젝트 설정에 레퍼런스 이미지 업로드 필드

**DB 변경**: `webtoon_animation_cuts` 테이블에 컬럼 추가
```sql
ALTER TABLE webtoon_animation_cuts ADD COLUMN color_image_url text;
ALTER TABLE webtoon_animation_cuts ADD COLUMN end_frame_url text;
ALTER TABLE webtoon_animation_cuts ADD COLUMN start_frame_url text;
ALTER TABLE webtoon_animation_cuts ADD COLUMN gemini_colorize_prompt text;
ALTER TABLE webtoon_animation_cuts ADD COLUMN gemini_expand_prompt text;
ALTER TABLE webtoon_animation_cuts ADD COLUMN gemini_start_frame_prompt text;
ALTER TABLE webtoon_animation_cuts ADD COLUMN video_prompt text;
```

---

### Phase B — ComfyUI 엔진 연동 (우선순위 2)

**대상 파일**: `/app/api/webtoonanimation/generate-video/route.ts` (신규 또는 기존 수정)

1. `engine` 파라미터 추가: `'fal' | 'comfyui'`
2. ComfyUI 엔진 선택 시:
   - SCP로 start/end 프레임을 5090 PC로 전송
   - ComfyUI REST API에 Wan 2.2 MoE 워크플로우 JSON 제출
   - 10초 간격 폴링 → 완료 시 SCP 다운로드
   - Supabase Storage에 업로드
3. UI: 영상 생성 모달에 엔진 선택 토글

**참고**: 워크플로우 JSON은 방법론 문서 §6에 완전히 정의되어 있음. 변수는 `{START_IMG}`, `{END_IMG}`, `{PROMPT}`, `{SEED}`, `{PREFIX}` 5개뿐.

---

### Phase C — 베리에이션 시스템 (우선순위 3)

**대상 파일**: `/components/webtoonanimation/VariationGenerator.tsx` (신규), `/app/api/webtoonanimation/generate-variations/route.ts` (신규)

1. 콘티 기획서 입력 UI (프로젝트 설정 탭)
2. "베리에이션 생성" 버튼: N개(기본 3) 설정 → AI가 독립적으로 N세트 프롬프트 생성
3. 세트별 프레임 생성 + 영상 생성을 순차/병렬 실행
4. **결과 비교 뷰**: 컷별로 N개 영상을 나란히 표시, 원하는 버전 선택/즐겨찾기

**AI 브리프 구조** (방법론 §7 참조):
```
당신은 애니메이션 영상 PD입니다.
아래 콘티 기획서를 읽고 각 컷에 대해 4종 프롬프트를 작성해주세요.
[콘티 기획서]
[캐릭터 설정]
주의: Start/End 카메라 뷰 동일, 퇴장 컷은 프레임 역할 반전
```

---

## 데이터 모델 변경 요약

### `webtoon_animation_projects` 테이블 추가 컬럼
```sql
ALTER TABLE webtoon_animation_projects
  ADD COLUMN synopsis text,               -- 콘티 기획서 전문
  ADD COLUMN character_ref_url text,      -- 캐릭터 컬러 레퍼런스 이미지
  ADD COLUMN character_settings jsonb;    -- 등장인물 설정 (이름, 색상 등)
```

### `webtoon_animation_cuts` 테이블 추가 컬럼
```sql
ALTER TABLE webtoon_animation_cuts
  ADD COLUMN color_image_url text,
  ADD COLUMN end_frame_url text,
  ADD COLUMN start_frame_url text,
  ADD COLUMN gemini_colorize_prompt text,
  ADD COLUMN gemini_expand_prompt text,
  ADD COLUMN gemini_start_frame_prompt text,
  ADD COLUMN video_prompt text,
  ADD COLUMN frame_strategy text;  -- 'enter'|'exit'|'expression'|'empty_to_action'
```

### 신규 테이블: `webtoon_animation_variations`
```sql
CREATE TABLE webtoon_animation_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES webtoon_animation_projects(id),
  cut_id uuid REFERENCES webtoon_animation_cuts(id),
  variation_label text,           -- 'vA', 'vB', 'vC'
  prompts jsonb,                  -- 4종 프롬프트
  color_image_url text,
  end_frame_url text,
  start_frame_url text,
  video_url text,
  seed bigint,
  engine text DEFAULT 'comfyui',  -- 'comfyui' | 'fal'
  created_at timestamptz DEFAULT now()
);
```

---

## 핵심 교훈 (방법론 §9) 반영 포인트

1. **카메라 뷰 일치 강제**: Start/End 프레임 생성 프롬프트에 "동일 원근법 유지" 문구를 기본값으로 삽입
2. **Cut 유형 분류 UI**: 등장/퇴장/표정변화/빈배경→액션 중 선택 → 퇴장 컷은 프레임 역할 자동 반전
3. **컬러 레퍼런스 필수화**: 레퍼런스 없이 Gemini 컬러화 실행 시 경고 표시
4. **진행 저장**: 컷/베리에이션 단위로 중간 결과 자동 저장 (실패 시 재시작 가능)

---

## 구현 우선순위

```
1순위 (Phase A) — 가장 즉시 가치 창출
  └─ Gemini 3단계 프레임 생성 API + 4종 프롬프트 UI + 캐릭터 레퍼런스

2순위 (Phase B) — 비용 절감
  └─ ComfyUI Wan 2.2 엔진 연동 (방법론 JSON 그대로 활용 가능)

3순위 (Phase C) — 크리에이티브 워크플로우 강화
  └─ 베리에이션 시스템 + 결과 비교 뷰
```
