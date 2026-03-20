# 콘티 → AI 애니메이션 영상 생성 방법론

> 스토리보드(콘티) + 컷 이미지로부터 다양한 해석의 AI 애니메이션 영상을 자동 생성하는 전체 프로세스
>
> 적용 사례: 용사생활기록부 1화 (6컷, 66개 영상 생성)
>
> Date: 2026-03-20

---

## 목차

0. [인프라 구성: 물리적 환경](#0-인프라-구성-물리적-환경)
1. [개요: 무엇을 하는가](#1-개요-무엇을-하는가)
2. [입력 자료: 콘티와 컷 이미지](#2-입력-자료-콘티와-컷-이미지)
3. [Phase 1: 장면 해석 — 콘티를 읽고 각 컷의 의미를 파악](#3-phase-1-장면-해석)
4. [Phase 2: 프롬프트 설계 — 4종 프롬프트 생성](#4-phase-2-프롬프트-설계)
5. [Phase 3: 프레임 생성 — Gemini로 Start/End 프레임 제작](#5-phase-3-프레임-생성)
6. [Phase 4: 영상 생성 — Wan 2.2 MoE로 애니메이션 렌더링](#6-phase-4-영상-생성)
7. [Phase 5: 서브 에이전트 오가닉 베리에이션](#7-phase-5-서브-에이전트-오가닉-베리에이션)
8. [전체 자동화 코드](#8-전체-자동화-코드)
9. [실험 결과 요약](#9-실험-결과-요약)

---

## 0. 인프라 구성: 물리적 환경

이 파이프라인은 **2대의 머신**이 Tailscale VPN으로 연결된 환경에서 동작한다. AI 에이전트(Claude Code)가 Mac Mini에서 실행되며, GPU 작업만 원격 5090 PC에 위임한다.

### 네트워크 토폴로지

```
┌─────────────────────────────────────────────────────────────────┐
│  Tailscale VPN (100.x.x.x 대역, WireGuard 기반)                │
│                                                                 │
│  ┌──────────────────────┐     ┌──────────────────────────────┐  │
│  │  Mac Mini M2 Pro     │     │  Windows Desktop (5090 PC)   │  │
│  │  100.91.172.14       │ ←──→│  100.79.136.74               │  │
│  │                      │ SSH │  (desktop-g2fm85o)            │  │
│  │  역할:               │ SCP │                              │  │
│  │  - Claude Code 실행  │     │  역할:                        │  │
│  │  - Gemini API 호출   │     │  - ComfyUI 서버 (포트 8188)   │  │
│  │  - 프롬프트 관리     │     │  - Wan 2.2 MoE 모델 로드      │  │
│  │  - 결과 업로드       │     │  - GPU 렌더링 (32GB VRAM)     │  │
│  │                      │     │                              │  │
│  │  OS: macOS           │     │  OS: Windows                 │  │
│  │  RAM: 32GB           │     │  GPU: RTX 5090 32GB          │  │
│  │  저장: ~/Projects/   │     │  RAM: 96GB                   │  │
│  │        ai-pd/        │     │  ComfyUI: C:\AI\ComfyUI\     │  │
│  └──────────────────────┘     └──────────────────────────────┘  │
│                                                                 │
│              ┌──────────────────────────┐                       │
│              │  PeterVoice API Server   │                       │
│              │  peter-voice.vercel.app  │                       │
│              │                          │                       │
│              │  역할:                    │                       │
│              │  - 영상 파일 업로드/호스팅│                       │
│              │  - Supabase Storage 연동 │                       │
│              │  - 공유 URL 생성         │                       │
│              └──────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### SSH 설정

Mac Mini의 `~/.ssh/config`에 5090 PC가 `gpu`라는 별칭으로 등록되어 있다:

```
Host gpu
    HostName 100.79.136.74          # Tailscale 내부 IP
    User admin
    IdentityFile ~/.ssh/id_ed25519_migration
```

이를 통해 스크립트에서 `ssh gpu`, `scp gpu:경로` 명령으로 간단하게 원격 접근한다.

### ComfyUI 서버

5090 PC에서 ComfyUI가 상시 실행되며, **포트 8188**에서 REST API를 제공한다.

```
ComfyUI REST API 엔드포인트:

POST http://100.79.136.74:8188/prompt
  → JSON 워크플로우를 제출하고 prompt_id를 반환받음

GET  http://100.79.136.74:8188/history/{prompt_id}
  → 작업 상태를 폴링 (10초 간격)
  → 완료 시 outputs → gifs[0].filename 으로 결과 파일명 확인

파일 시스템 경로 (Windows):
  입력: C:\AI\ComfyUI\input\    ← SCP로 Start/End 프레임 업로드
  출력: C:\AI\ComfyUI\output\   ← 생성된 MP4 다운로드
```

Tailscale VPN 덕분에 Mac Mini에서 `100.79.136.74:8188`로 직접 HTTP 요청이 가능하다. 방화벽/포트포워딩 설정 없이 로컬 네트워크처럼 동작한다.

### 파일 업로드 (공유 URL 생성)

생성된 영상을 외부에서 접근 가능한 URL로 만들기 위해, PeterVoice API 서버의 파일 업로드 엔드포인트를 사용한다:

```python
# ~/.claude-daemon/config.json 에서 API 정보 로드
config_path = os.path.expanduser("~/.claude-daemon/config.json")
with open(config_path) as f:
    config = json.load(f)
api_url = config["api_url"]   # https://peter-voice.vercel.app
api_key = config["api_key"]   # pv_xxxxx...

# FormData로 파일 업로드
resp = requests.post(
    f"{api_url}/api/files/upload",
    headers={"Authorization": f"Bearer {api_key}"},
    files={"file": ("cut1vA_final.mp4", open(path, "rb"), "video/mp4")}
)
url = resp.json()["url"]
# → https://gfzprzvynxixekmsadqe.supabase.co/storage/v1/object/public/files/uploads/...mp4
```

업로드된 파일은 Supabase Storage에 저장되며, 퍼블릭 URL이 반환된다. 50MB 제한.

### 데이터 흐름 요약

```
Mac Mini (Claude Code)                    5090 PC (ComfyUI)
========================                  ========================

1. 콘티 라인아트 읽기
   (~/Projects/ai-pd/
    extracted_egg/*.png)
           │
           ▼
2. Gemini API 호출 ──────→ Google Cloud
   (컬러화/확장/시작프레임)   (gemini-3.1-flash-image-preview)
           │
           ▼
3. 생성된 PNG 로컬 저장
   (extracted_egg/
    cut1vA_color.png
    cut1vA_end.png
    cut1vA_start.png)
           │
           ▼
4. SCP 전송 ─────────────→ C:\AI\ComfyUI\input\
   (start.png + end.png)     cut1vA_start.png
                              cut1vA_end.png
           │
           ▼
5. HTTP POST ────────────→ :8188/prompt
   (JSON 워크플로우)          (워크플로우 큐잉)
           │                       │
           ▼                       ▼
6. HTTP GET ─────────────→ :8188/history/{id}
   (10초 간격 폴링)          (GPU 렌더링 ~60초)
           │                       │
           ▼                       ▼
7. SCP 다운로드 ←────────── C:\AI\ComfyUI\output\
   (cut1vA_final.mp4)        cut1vA_final_00001.mp4
           │
           ▼
8. HTTP POST ────────────→ peter-voice.vercel.app
   (파일 업로드)              /api/files/upload
           │
           ▼
9. 공유 URL 반환
   (Supabase Storage)
```

### GPU 머신의 모델 구성

5090 PC의 ComfyUI에 미리 설치되어 있어야 하는 모델:

```
C:\AI\ComfyUI\models\
├── diffusion_models\
│   ├── wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors   (MoE high expert)
│   └── wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors    (MoE low expert)
├── loras\
│   ├── wan2.2_i2v_A14b_high_noise_lora_rank64_lightx2v_4step_1022.safetensors
│   └── wan2.2_i2v_A14b_low_noise_lora_rank64_lightx2v_4step_1022.safetensors
├── text_encoders\
│   └── umt5-xxl-enc-bf16.safetensors                     (T5 텍스트 인코더)
└── vae\
    └── Wan2_1_VAE_bf16.safetensors                        (VAE 디코더)
```

---

## 1. 개요: 무엇을 하는가

**문제**: 콘티(스토리보드) 라인아트 이미지가 주어졌을 때, 이를 7초짜리 고품질 AI 애니메이션 영상으로 변환하고 싶다. 단순히 하나의 영상이 아니라, 동일한 콘티를 **여러 관점에서 해석**한 다양한 버전을 만들어 그중 최선을 선택하고 싶다.

**해법**: 5단계 파이프라인

```
[콘티 라인아트]
    │
    ▼ Phase 1: 장면 해석
[각 컷의 의미/구도/액션/감정 파악]
    │
    ▼ Phase 2: 프롬프트 설계
[컬러화 프롬프트 + 확장 프롬프트 + 시작프레임 프롬프트 + 영상 프롬프트]
    │
    ▼ Phase 3: 프레임 생성 (Gemini)
[라인아트 → 컬러 → 16:9 End Frame → Start Frame]
    │
    ▼ Phase 4: 영상 생성 (Wan 2.2 MoE)
[Start + End Frame → 7초 MP4 애니메이션]
    │
    ▼ Phase 5: 서브 에이전트 베리에이션
[N명의 독립 에이전트가 동일 콘티를 각자 해석 → 자연스럽게 다른 결과물]
```

**핵심 인사이트**: 동일한 콘티에서도 "어떻게 해석하느냐"에 따라 결과 영상이 크게 달라진다. 장면 해석 → 프롬프트 작성까지를 여러 에이전트에게 독립적으로 맡기면, 인위적인 테마 설정 없이도 자연스럽게 다양한 버전을 얻을 수 있다.

---

## 2. 입력 자료: 콘티와 컷 이미지

### 필요한 자료

| 자료 | 설명 | 예시 |
|------|------|------|
| **콘티 라인아트** | 각 컷의 흑백 라인 드로잉 (PNG) | `20260317_120420_1.png` ~ `_6.png` |
| **캐릭터 컬러 레퍼런스** | 등장인물의 확정된 색상을 보여주는 이미지 | `character_color_ref.jpg` |
| **콘티 기획서** | 각 컷의 서사적 맥락, 구도, 액션, 감정 설명 | 텍스트 (아래 예시 참조) |

### 콘티 기획서 예시 (용사생활기록부 1화)

```
에피소드 1: "첫날" — 소심한 소년 윤희원의 학교 첫날

Cut 1 (복도 등장): 빈 학교 복도. 희원이 오른쪽에서 조심스럽게 걸어 들어와 중앙에서 멈춘다.
Cut 2 (불량배 밀치기): 큰 체격의 조연1이 갑자기 나타나 희원을 거칠게 밀친다.
Cut 3 (동전 건네기): 뒷모습 3인 구도. 희원이 마지못해 동전을 건넨다. 불량배들이 떠나간다.
Cut 4 (고독): 어두운 복도를 혼자 걸어가는 희원의 뒷모습. 줌인.
Cut 5 (표정 변화): 희원의 얼굴 클로즈업. 체념에서 수줍은 미소로 변하는 미세한 표정.
Cut 6 (마소희): 교실 로우앵글. 마소희가 자신감 있게 손을 든다. 뒤에서 희원이 바라본다.

등장인물:
- 윤희원: 네이비블루 머리 + 시안 하이라이트, 흰 폴로셔츠 + 초록 칼라
- 조연1: 검정 머리, 큰 체격
- 조연2: 반삭 검정 머리
- 마소희: 긴 머리 + 아호게, 여자 교복
```

---

## 3. Phase 1: 장면 해석

콘티 라인아트를 보고 **각 컷이 의미하는 바**를 분석한다. 이 단계가 전체 파이프라인의 기반이 되며, 에이전트마다 해석이 달라지는 지점이기도 하다.

### 해석해야 할 요소

| 요소 | 질문 | 왜 중요한가 |
|------|------|------------|
| **구도** | 카메라 위치, 앵글, 프레이밍은? | Start/End 프레임의 카메라 뷰가 일치해야 자연스러운 모션 |
| **등장인물** | 누가 어디에 있는가? | 컬러화 프롬프트에 캐릭터별 위치/색상 지정 필요 |
| **액션** | 어떤 동작이 일어나는가? | 영상 프롬프트의 모션 디스크립션 |
| **감정** | 인물의 감정 상태는? | 프롬프트의 분위기 설정 |
| **조명** | 빛의 방향, 색온도, 분위기는? | 컬러화 시 조명 느낌 결정 |
| **시작→끝** | 프레임 A에서 B로 무엇이 변하는가? | Start Frame과 End Frame의 차이점 설계 |

### 컷 유형별 Start/End 전략

프레임 전략이 컷의 성격에 따라 달라진다:

| 유형 | Start Frame | End Frame | 해당 예시 |
|------|------------|-----------|-----------|
| **캐릭터 등장** | 빈 배경 (캐릭터 제거) | 캐릭터가 있는 완성 이미지 | Cut 1, 4 |
| **캐릭터 추가 등장** | 기존 인물만 (추가 인물 제거) | 모든 인물이 있는 완성 이미지 | Cut 2 |
| **캐릭터 퇴장** | 모든 인물이 있는 이미지 | 남은 인물만 (퇴장 인물 제거) | Cut 3 |
| **표정 변화** | 이전 감정 상태 (약간 줌아웃) | 변화된 감정 상태 | Cut 5 |
| **빈 배경 → 액션** | 빈 교실/장소 | 인물이 포즈를 취한 완성 이미지 | Cut 6 |

> **Cut 3 주의**: 이 컷은 "3인이 있다가 불량배가 퇴장"하는 장면이므로, Gemini로 만든 이미지의 역할이 반전된다:
> - Gemini가 만든 **3인 이미지 = Start Frame** (퇴장 전)
> - Gemini가 만든 **혼자 이미지 = End Frame** (퇴장 후)
> - 코드에서 `start_path`와 `end_path`를 swap해야 한다

---

## 4. Phase 2: 프롬프트 설계

각 컷에 대해 **4종의 프롬프트**를 작성한다. 이 프롬프트가 Phase 3~4의 입력이 된다.

### 프롬프트 4종 구조

```
┌─────────────────────────────────────────────────────────┐
│ 1. gemini_colorize                                      │
│    라인아트를 컬러 이미지로 변환하는 프롬프트              │
│    입력: 컬러 레퍼런스 + 라인아트                         │
│    출력: 컬러화된 정사각형 이미지                          │
├─────────────────────────────────────────────────────────┤
│ 2. gemini_expand                                        │
│    정사각형 이미지를 16:9로 확장하는 프롬프트              │
│    입력: 컬러 이미지                                     │
│    출력: 1376×768 와이드 이미지 (= End Frame)             │
├─────────────────────────────────────────────────────────┤
│ 3. gemini_start_frame                                   │
│    End Frame에서 Start Frame을 만드는 프롬프트            │
│    입력: End Frame                                       │
│    출력: 카메라 뷰 동일, 내용만 다른 Start Frame          │
├─────────────────────────────────────────────────────────┤
│ 4. video_prompt                                         │
│    Wan 2.2에 전달할 영상 생성 프롬프트                    │
│    Start→End 사이의 모션을 텍스트로 설명                  │
│    출력: 7초 애니메이션 영상                              │
└─────────────────────────────────────────────────────────┘
```

### 프롬프트 작성 원칙

#### 1. gemini_colorize (컬러화)

```
핵심 요소:
- 캐릭터별 정확한 색상 명시 (머리색, 의상, 피부)
- 배경의 조명/분위기 설명
- 화풍 지정 (Korean webtoon style, cel shading, flat color 등)
- 컬러 레퍼런스 이미지를 첫 번째 입력으로 제공
```

에이전트별 비교 예시는 아래 Phase 5에서 상세히 다룬다.

#### 2. gemini_expand (16:9 확장)

```
핵심 요소:
- 확장 방향 명시 (좌/우/양측)
- 추가될 배경 요소 설명 (사물함, 벽, 창문 등)
- 캐릭터 위치 지정 (중앙/중앙-좌/중앙-우)
- 기존 조명/팔레트 유지 지시
- 새 캐릭터 추가 금지 명시
```

#### 3. gemini_start_frame (시작 프레임)

```
핵심 원칙:
⚠️ 카메라 뷰(원근법)가 End Frame과 반드시 동일해야 한다.
    FLF2V(First-Last-Frame-to-Video)가 두 프레임 사이의 모션을 보간하므로,
    카메라 위치가 다르면 어색한 왜곡이 발생한다.

핵심 요소:
- 제거할 대상 명확히 지정
- 빈 공간을 무엇으로 채울지 설명
- "같은 조명, 같은 원근법, 같은 분위기 유지" 명시
```

#### 4. video_prompt (영상)

```
핵심 요소:
- 화풍: "Anime style, Korean webtoon aesthetic"
- 인물 외형 설명 (특히 첫 등장 시)
- 구체적 모션 디스크립션 (걸어 들어온다, 밀친다, 떠난다 등)
- 감정/분위기 (quiet, tense, lonely 등)
- 카메라 (static camera, slow push-in, fixed 등)
- 네거티브 프롬프트 (별도): "live action, 3D render, blurry, distorted face,
  bad anatomy, extra limbs, watermark, text, low quality, choppy motion"
```

---

## 5. Phase 3: 프레임 생성 (Gemini)

### 기술 스택

| 항목 | 값 |
|------|-----|
| 모델 | `gemini-3.1-flash-image-preview` |
| API | Google GenAI Python SDK |
| 입력 | 텍스트 프롬프트 + 이미지 (최대 2장) |
| 출력 | PNG 이미지 |

> **주의**: `gemini-3-flash-preview`는 이미지 출력을 지원하지 않는다. 반드시 `gemini-3.1-flash-image-preview`를 사용할 것.

### 3단계 순차 처리

```
Step A: 컬러화
  Input:  [컬러 레퍼런스 JPG] + [라인아트 PNG]
  Prompt: gemini_colorize
  Output: 컬러 이미지 (~1000×1000)

Step B: 16:9 확장 → End Frame
  Input:  [컬러 이미지]
  Prompt: gemini_expand
  Output: 와이드 이미지 (1376×768) = End Frame

Step C: Start Frame 생성
  Input:  [End Frame]
  Prompt: gemini_start_frame
  Output: Start Frame (1376×768, 동일 카메라 뷰)
```

### 코드

```python
from google import genai
from google.genai import types
import PIL.Image

client = genai.Client(api_key=os.environ['GEMINI_API_KEY'])

def gemini_generate(prompt, images, output_path, max_retries=3):
    """Gemini에 프롬프트 + 이미지를 전달하고 생성된 이미지를 저장한다."""
    pil_images = [PIL.Image.open(img) for img in images]

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model='gemini-3.1-flash-image-preview',
                contents=[prompt] + pil_images,
                config=types.GenerateContentConfig(
                    response_modalities=['IMAGE', 'TEXT']
                )
            )
            for part in response.candidates[0].content.parts:
                if (hasattr(part, 'inline_data')
                    and part.inline_data
                    and part.inline_data.mime_type.startswith('image')):
                    with open(output_path, 'wb') as f:
                        f.write(part.inline_data.data)
                    return True
        except Exception as e:
            print(f"Error (attempt {attempt+1}): {e}")
            time.sleep(5)  # Gemini 500 에러 대비 재시도
    return False

# 실행 순서
# Step A: 컬러화
gemini_generate(
    prompt=prompts["gemini_colorize"],
    images=["character_color_ref.jpg", "lineart.png"],
    output_path="color.png"
)

# Step B: 16:9 확장 → End Frame
gemini_generate(
    prompt=prompts["gemini_expand"],
    images=["color.png"],
    output_path="end_frame.png"
)

# Step C: Start Frame
gemini_generate(
    prompt=prompts["gemini_start_frame"],
    images=["end_frame.png"],
    output_path="start_frame.png"
)
```

### 에러 핸들링

- **Gemini 500 INTERNAL**: 간헐적 서버 에러. 5초 대기 후 최대 3회 재시도로 해결.
- **이미지 미생성**: `response_modalities`에 `'IMAGE'`가 없으면 텍스트만 반환됨.
- **컬러 불일치**: 컬러 레퍼런스 이미지를 **항상** 첫 번째 입력으로 전달해야 캐릭터 색상이 일관됨.

---

## 6. Phase 4: 영상 생성 (Wan 2.2 MoE)

### 기술 스택

| 항목 | 값 |
|------|-----|
| GPU | NVIDIA RTX 5090 (32GB VRAM) |
| 소프트웨어 | ComfyUI + Wan 2.2 I2V MoE |
| 모드 | FLF2V (First-Last-Frame-to-Video) |
| 아키텍처 | 2-Pass MoE (high_noise → low_noise) |
| LoRA | Distill 4-step (고속 추론) |
| 접근 | SSH + ComfyUI REST API |

### 왜 Wan 2.2 MoE + Distill LoRA인가

- **MoE 2-Pass**: 두 전문가 모델이 순차적으로 처리 (high_noise expert → low_noise expert)
- **Distill LoRA**: 30스텝 → 4스텝으로 압축. 품질 유사, 속도 7~8배 빠름
- **FLF2V**: Start/End 두 프레임을 주면 그 사이를 자연스럽게 보간
- 컷당 **~60초**에 7초 영상 생성 → 빠른 반복 가능

### ComfyUI 워크플로우 상세

#### 노드 구성도 (12개 노드, ID 기반 연결)

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                     ComfyUI Workflow (API Format)                   │
 │                                                                     │
 │  ┌─────────────┐    ┌─────────────┐                                │
 │  │ Node 1      │    │ Node 2      │                                │
 │  │ LoadImage   │    │ LoadImage   │                                │
 │  │ (start)     │    │ (end)       │                                │
 │  └──────┬──────┘    └──────┬──────┘                                │
 │         │                  │                                        │
 │         │   ┌──────────────┼───────────────────────────┐           │
 │         │   │              │                           │           │
 │         │   │  ┌───────────┴────────┐                  │           │
 │         │   │  │ Node 5             │                  │           │
 │         │   │  │ WanVideoVAELoader  │                  │           │
 │         │   │  │ (Wan2_1_VAE_bf16)  │                  │           │
 │         │   │  └─────────┬──────────┘                  │           │
 │         │   │            │                             │           │
 │         ▼   ▼            ▼                             │           │
 │  ┌──────────────────────────────────────┐              │           │
 │  │ Node 8                               │              │           │
 │  │ WanVideoImageToVideoEncode           │              │           │
 │  │                                      │              │           │
 │  │ width=832, height=480                │              │           │
 │  │ num_frames=113 (7초×16fps+1)         │              │           │
 │  │ noise_aug_strength=0.0               │              │           │
 │  │ start_latent_strength=1.0            │              │           │
 │  │ end_latent_strength=1.0              │              │           │
 │  │ fun_or_fl2v_model=True  ← FLF2V활성화│              │           │
 │  │                                      │              │           │
 │  │ start_image ← Node 1 (output 0)     │              │           │
 │  │ end_image   ← Node 2 (output 0)     │              │           │
 │  │ vae         ← Node 5 (output 0)     │              │           │
 │  └──────────────────┬───────────────────┘              │           │
 │                     │ image_embeds                      │           │
 │                     │                                   │           │
 │  ┌──────────────────┼───────────────────────────────┐  │           │
 │  │                  │                               │  │           │
 │  │  ┌───────────────┴──────┐                        │  │           │
 │  │  │ Node 6               │                        │  │           │
 │  │  │ LoadWanVideoT5       │                        │  │           │
 │  │  │ TextEncoder          │                        │  │           │
 │  │  │ (umt5-xxl-enc-bf16)  │                        │  │           │
 │  │  └──────────┬───────────┘                        │  │           │
 │  │             │                                    │  │           │
 │  │             ▼                                    │  │           │
 │  │  ┌──────────────────────┐                        │  │           │
 │  │  │ Node 7               │                        │  │           │
 │  │  │ WanVideoTextEncode   │                        │  │           │
 │  │  │                      │                        │  │           │
 │  │  │ positive_prompt=...  │                        │  │           │
 │  │  │ negative_prompt=...  │                        │  │           │
 │  │  │ t5 ← Node 6 (out 0) │                        │  │           │
 │  │  └──────────┬───────────┘                        │  │           │
 │  │             │ text_embeds                        │  │           │
 │  │             │                                    │  │           │
 │  │  ┌──────────┴──────────┐  ┌───────────────────┐  │  │           │
 │  │  │ Node 13             │  │ Node 14           │  │  │           │
 │  │  │ WanVideoLoraSelect  │  │ WanVideoLoraSelect│  │  │           │
 │  │  │ (high_noise 4step)  │  │ (low_noise 4step) │  │  │           │
 │  │  └──────────┬──────────┘  └────────┬──────────┘  │  │           │
 │  │             │                      │             │  │           │
 │  │             ▼                      ▼             │  │           │
 │  │  ┌──────────────────┐  ┌──────────────────────┐  │  │           │
 │  │  │ Node 3            │  │ Node 4              │  │  │           │
 │  │  │ WanVideoModel     │  │ WanVideoModel       │  │  │           │
 │  │  │ Loader            │  │ Loader              │  │  │           │
 │  │  │ (high_noise_14B   │  │ (low_noise_14B      │  │  │           │
 │  │  │  fp8_scaled)      │  │  fp8_scaled)        │  │  │           │
 │  │  │ lora←Node13       │  │ lora←Node14         │  │  │           │
 │  │  │ sageattn          │  │ sageattn            │  │  │           │
 │  │  └────────┬─────────┘  └──────────┬───────────┘  │  │           │
 │  │           │ model                 │ model        │  │           │
 │  └───────────┼───────────────────────┼──────────────┘  │           │
 │              │                       │                  │           │
 │              ▼                       │                  │           │
 │  ┌────────────────────────────┐      │                  │           │
 │  │ Node 9                     │      │                  │           │
 │  │ WanVideoSampler (Pass 1)  │      │                  │           │
 │  │                            │      │                  │           │
 │  │ model      ← Node 3 (0)   │      │                  │           │
 │  │ image_embeds ← Node 8 (0) │      │                  │           │
 │  │ text_embeds  ← Node 7 (0) │      │                  │           │
 │  │                            │      │                  │           │
 │  │ steps=4, cfg=1.0           │      │                  │           │
 │  │ shift=5.0, seed=RANDOM     │      │                  │           │
 │  │ scheduler=euler            │      │                  │           │
 │  │ end_step=2  ← 스텝 0~2만   │      │                  │           │
 │  └──────────────┬─────────────┘      │                  │           │
 │                 │ samples             │                  │           │
 │                 ▼                     ▼                  │           │
 │  ┌─────────────────────────────────────┐                │           │
 │  │ Node 10                             │                │           │
 │  │ WanVideoSampler (Pass 2)           │                │           │
 │  │                                     │                │           │
 │  │ model      ← Node 4 (0)            │                │           │
 │  │ image_embeds ← Node 8 (0)          │                │           │
 │  │ text_embeds  ← Node 7 (0)          │                │           │
 │  │ samples    ← Node 9 (0)  ← Pass1!  │                │           │
 │  │                                     │                │           │
 │  │ start_step=2  ← 스텝 2~4만          │                │           │
 │  │ add_noise_to_samples=False          │                │           │
 │  │ (나머지 동일: cfg=1.0 등)            │                │           │
 │  └──────────────┬──────────────────────┘                │           │
 │                 │ samples                               │           │
 │                 ▼                                        │           │
 │  ┌──────────────────────────────────┐                   │           │
 │  │ Node 11                          │                   │           │
 │  │ WanVideoDecode                   │                   │           │
 │  │                                  │                   │           │
 │  │ vae     ← Node 5 (0)            │                   │           │
 │  │ samples ← Node 10 (0)           │                   │           │
 │  │ enable_vae_tiling=False          │                   │           │
 │  └──────────────┬───────────────────┘                   │           │
 │                 │ images                                │           │
 │                 ▼                                        │           │
 │  ┌──────────────────────────────────┐                   │           │
 │  │ Node 12                          │                   │           │
 │  │ VHS_VideoCombine                 │                   │           │
 │  │                                  │                   │           │
 │  │ frame_rate=16, crf=19            │                   │           │
 │  │ format=video/h264-mp4            │                   │           │
 │  │ pix_fmt=yuv420p                  │                   │           │
 │  │ filename_prefix=cut1vA_final     │                   │           │
 │  └──────────────────────────────────┘                   │           │
 │                 │                                        │           │
 │                 ▼                                        │           │
 │        C:\AI\ComfyUI\output\cut1vA_final_00001.mp4      │           │
 └─────────────────────────────────────────────────────────┘           │
```

#### 노드 연결 규칙 (ComfyUI API Format)

ComfyUI API에서 노드 간 연결은 `["노드ID", 출력인덱스]` 배열로 표현한다:

```
"start_image": ["1", 0]   →  Node 1의 0번째 출력(=이미지)을 여기에 연결
"model": ["3", 0]          →  Node 3의 0번째 출력(=모델)을 여기에 연결
"samples": ["9", 0]        →  Node 9의 0번째 출력(=latent)을 여기에 연결
```

이 방식으로 12개 노드가 DAG(방향 비순환 그래프)를 구성한다. ComfyUI가 의존 관계를 분석해 자동으로 실행 순서를 결정한다.

#### 완전한 워크플로우 JSON

아래는 `POST http://100.79.136.74:8188/prompt`에 제출하는 실제 JSON이다.
`{START_IMG}`, `{END_IMG}`, `{PROMPT}`, `{SEED}`, `{PREFIX}` 부분만 치환하면 된다:

```json
{
  "prompt": {
    "1": {
      "class_type": "LoadImage",
      "inputs": {
        "image": "{START_IMG}"
      }
    },
    "2": {
      "class_type": "LoadImage",
      "inputs": {
        "image": "{END_IMG}"
      }
    },
    "13": {
      "class_type": "WanVideoLoraSelect",
      "inputs": {
        "lora": "wan2.2_i2v_A14b_high_noise_lora_rank64_lightx2v_4step_1022.safetensors",
        "strength": 1.0
      }
    },
    "14": {
      "class_type": "WanVideoLoraSelect",
      "inputs": {
        "lora": "wan2.2_i2v_A14b_low_noise_lora_rank64_lightx2v_4step_1022.safetensors",
        "strength": 1.0
      }
    },
    "3": {
      "class_type": "WanVideoModelLoader",
      "inputs": {
        "model": "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
        "base_precision": "bf16",
        "quantization": "disabled",
        "load_device": "offload_device",
        "attention_mode": "sageattn",
        "lora": ["13", 0]
      }
    },
    "4": {
      "class_type": "WanVideoModelLoader",
      "inputs": {
        "model": "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
        "base_precision": "bf16",
        "quantization": "disabled",
        "load_device": "offload_device",
        "attention_mode": "sageattn",
        "lora": ["14", 0]
      }
    },
    "5": {
      "class_type": "WanVideoVAELoader",
      "inputs": {
        "model_name": "Wan2_1_VAE_bf16.safetensors",
        "precision": "bf16"
      }
    },
    "6": {
      "class_type": "LoadWanVideoT5TextEncoder",
      "inputs": {
        "model_name": "umt5-xxl-enc-bf16.safetensors",
        "precision": "bf16",
        "load_device": "offload_device"
      }
    },
    "7": {
      "class_type": "WanVideoTextEncode",
      "inputs": {
        "positive_prompt": "{PROMPT}",
        "negative_prompt": "live action, 3D render, blurry, distorted face, bad anatomy, extra limbs, watermark, text, low quality, choppy motion",
        "t5": ["6", 0],
        "force_offload": true
      }
    },
    "8": {
      "class_type": "WanVideoImageToVideoEncode",
      "inputs": {
        "width": 832,
        "height": 480,
        "num_frames": 113,
        "noise_aug_strength": 0.0,
        "start_latent_strength": 1.0,
        "end_latent_strength": 1.0,
        "force_offload": true,
        "vae": ["5", 0],
        "start_image": ["1", 0],
        "end_image": ["2", 0],
        "fun_or_fl2v_model": true
      }
    },
    "9": {
      "class_type": "WanVideoSampler",
      "inputs": {
        "model": ["3", 0],
        "image_embeds": ["8", 0],
        "text_embeds": ["7", 0],
        "steps": 4,
        "cfg": 1.0,
        "shift": 5.0,
        "seed": "{SEED}",
        "scheduler": "euler",
        "riflex_freq_index": 0,
        "force_offload": true,
        "end_step": 2
      }
    },
    "10": {
      "class_type": "WanVideoSampler",
      "inputs": {
        "model": ["4", 0],
        "image_embeds": ["8", 0],
        "text_embeds": ["7", 0],
        "steps": 4,
        "cfg": 1.0,
        "shift": 5.0,
        "seed": "{SEED}",
        "scheduler": "euler",
        "riflex_freq_index": 0,
        "force_offload": true,
        "samples": ["9", 0],
        "start_step": 2,
        "add_noise_to_samples": false
      }
    },
    "11": {
      "class_type": "WanVideoDecode",
      "inputs": {
        "vae": ["5", 0],
        "samples": ["10", 0],
        "enable_vae_tiling": false,
        "tile_x": 272,
        "tile_y": 272,
        "tile_stride_x": 144,
        "tile_stride_y": 128
      }
    },
    "12": {
      "class_type": "VHS_VideoCombine",
      "inputs": {
        "images": ["11", 0],
        "frame_rate": 16,
        "loop_count": 0,
        "filename_prefix": "{PREFIX}",
        "format": "video/h264-mp4",
        "pingpong": false,
        "save_output": true,
        "pix_fmt": "yuv420p",
        "crf": 19,
        "save_metadata": true,
        "trim_to_audio": false
      }
    }
  }
}
```

#### MoE 2-Pass 동작 원리

Wan 2.2 MoE는 두 개의 전문가(expert) 모델이 디노이징 과정을 나눠서 처리한다:

```
노이즈 레벨:   높음 ──────────────────────────────→ 낮음

               ┌─── Pass 1 (Node 9) ───┐┌─── Pass 2 (Node 10) ──┐
               │ high_noise expert      ││ low_noise expert       │
               │ step 0 → step 2       ││ step 2 → step 4       │
               │                        ││                        │
               │ 거친 구조, 전체 레이아웃  ││ 세밀한 디테일, 질감     │
               │ 모션의 큰 흐름 결정     ││ 얼굴, 머리카락 디테일   │
               └────────────────────────┘└────────────────────────┘

- Pass 1 출력(samples)이 Pass 2의 입력(samples)으로 전달됨
- Pass 2는 add_noise_to_samples=False → Pass 1 결과에 노이즈 추가 없이 이어서 처리
- 같은 seed를 양쪽에 사용해야 일관된 결과
```

#### API 호출 및 결과 수집 흐름

```python
# 1. 워크플로우 제출
import urllib.request, json

payload = json.dumps(workflow).encode()
req = urllib.request.Request(
    "http://100.79.136.74:8188/prompt",
    data=payload,
    headers={"Content-Type": "application/json"}
)
resp = urllib.request.urlopen(req, timeout=30)
prompt_id = json.loads(resp.read())["prompt_id"]
# → "a1b2c3d4-e5f6-..."

# 2. 결과 폴링 (10초 간격)
while True:
    time.sleep(10)
    resp = urllib.request.urlopen(
        f"http://100.79.136.74:8188/history/{prompt_id}")
    data = json.loads(resp.read())

    if prompt_id in data:
        # 완료 시 응답 구조:
        # {
        #   "a1b2c3d4-...": {
        #     "status": {"status_str": "success", "completed": true},
        #     "outputs": {
        #       "12": {              ← Node 12 (VHS_VideoCombine)
        #         "gifs": [{
        #           "filename": "cut1vA_final_00001.mp4",
        #           "subfolder": "",
        #           "type": "output"
        #         }]
        #       }
        #     }
        #   }
        # }
        outputs = data[prompt_id]["outputs"]
        filename = outputs["12"]["gifs"][0]["filename"]
        break

# 3. 결과 파일 다운로드 (SCP)
# 파일 위치: C:\AI\ComfyUI\output\cut1vA_final_00001.mp4
subprocess.run([
    "scp",
    "gpu:C:/AI/ComfyUI/output/" + filename,
    "./result.mp4"
])
```

> **주의**: ComfyUI API의 `outputs` 키에서 `"gifs"`라는 이름은 VHS_VideoCombine 노드의 레거시 필드명이다. MP4를 출력하더라도 `gifs` 키에 결과가 담긴다.

### 핵심 파라미터

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| width × height | 832 × 480 | 16:9, 480p 네이티브 |
| num_frames | 113 | 7초 × 16fps + 1 |
| steps | 4 | Pass 1에서 2스텝, Pass 2에서 2스텝 |
| cfg | 1.0 | Distill LoRA 전용 (일반은 5.0) |
| shift | 5.0 | 노이즈 스케줄 시프트 |
| scheduler | euler | |
| fun_or_fl2v_model | True | FLF2V 모드 활성화 |
| attention_mode | sageattn | SageAttention 가속 |
| frame_rate | 16 | fps |
| crf | 19 | H.264 품질 |

### 코드: ComfyUI API 호출

```python
import urllib.request, json, time

COMFYUI_URL = "http://100.79.136.74:8188"

def submit_comfyui(start_img, end_img, prompt_text, seed, prefix):
    """ComfyUI에 Wan 2.2 MoE FLF2V 워크플로우를 제출한다."""
    workflow = {
        "1": {"class_type": "LoadImage",
              "inputs": {"image": start_img}},
        "2": {"class_type": "LoadImage",
              "inputs": {"image": end_img}},

        # Distill LoRA (4-step)
        "13": {"class_type": "WanVideoLoraSelect", "inputs": {
            "lora": "wan2.2_i2v_A14b_high_noise_lora_rank64_lightx2v_4step_1022.safetensors",
            "strength": 1.0}},
        "14": {"class_type": "WanVideoLoraSelect", "inputs": {
            "lora": "wan2.2_i2v_A14b_low_noise_lora_rank64_lightx2v_4step_1022.safetensors",
            "strength": 1.0}},

        # MoE Expert 모델 (14B fp8)
        "3": {"class_type": "WanVideoModelLoader", "inputs": {
            "model": "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
            "base_precision": "bf16", "quantization": "disabled",
            "load_device": "offload_device", "attention_mode": "sageattn",
            "lora": ["13", 0]}},
        "4": {"class_type": "WanVideoModelLoader", "inputs": {
            "model": "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
            "base_precision": "bf16", "quantization": "disabled",
            "load_device": "offload_device", "attention_mode": "sageattn",
            "lora": ["14", 0]}},

        # VAE + Text Encoder
        "5": {"class_type": "WanVideoVAELoader", "inputs": {
            "model_name": "Wan2_1_VAE_bf16.safetensors", "precision": "bf16"}},
        "6": {"class_type": "LoadWanVideoT5TextEncoder", "inputs": {
            "model_name": "umt5-xxl-enc-bf16.safetensors", "precision": "bf16",
            "load_device": "offload_device"}},

        # 프롬프트 인코딩
        "7": {"class_type": "WanVideoTextEncode", "inputs": {
            "positive_prompt": prompt_text,
            "negative_prompt": "live action, 3D render, blurry, distorted face, "
                             "bad anatomy, extra limbs, watermark, text, "
                             "low quality, choppy motion",
            "t5": ["6", 0], "force_offload": True}},

        # FLF2V 이미지 인코딩
        "8": {"class_type": "WanVideoImageToVideoEncode", "inputs": {
            "width": 832, "height": 480, "num_frames": 113,
            "noise_aug_strength": 0.0,
            "start_latent_strength": 1.0, "end_latent_strength": 1.0,
            "force_offload": True,
            "vae": ["5", 0],
            "start_image": ["1", 0], "end_image": ["2", 0],
            "fun_or_fl2v_model": True}},

        # 2-Pass Sampling (MoE)
        "9": {"class_type": "WanVideoSampler", "inputs": {
            "model": ["3", 0],           # high_noise expert
            "image_embeds": ["8", 0], "steps": 4, "cfg": 1.0,
            "shift": 5.0, "seed": seed, "force_offload": True,
            "scheduler": "euler", "riflex_freq_index": 0,
            "text_embeds": ["7", 0],
            "end_step": 2}},              # Pass 1: step 0→2
        "10": {"class_type": "WanVideoSampler", "inputs": {
            "model": ["4", 0],           # low_noise expert
            "image_embeds": ["8", 0], "steps": 4, "cfg": 1.0,
            "shift": 5.0, "seed": seed, "force_offload": True,
            "scheduler": "euler", "riflex_freq_index": 0,
            "text_embeds": ["7", 0],
            "samples": ["9", 0],         # Pass 1 결과를 이어받음
            "start_step": 2,             # Pass 2: step 2→4
            "add_noise_to_samples": False}},

        # 디코드 + 영상 출력
        "11": {"class_type": "WanVideoDecode", "inputs": {
            "vae": ["5", 0], "samples": ["10", 0],
            "enable_vae_tiling": False,
            "tile_x": 272, "tile_y": 272,
            "tile_stride_x": 144, "tile_stride_y": 128}},
        "12": {"class_type": "VHS_VideoCombine", "inputs": {
            "images": ["11", 0], "frame_rate": 16, "loop_count": 0,
            "filename_prefix": prefix, "format": "video/h264-mp4",
            "pingpong": False, "save_output": True,
            "pix_fmt": "yuv420p", "crf": 19,
            "save_metadata": True, "trim_to_audio": False}},
    }

    payload = json.dumps({"prompt": workflow}).encode()
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt", data=payload,
        headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=30)
    return json.loads(resp.read()).get("prompt_id")


def poll_comfyui(prompt_id, timeout=600):
    """ComfyUI 작업 완료를 폴링한다. 10초 간격."""
    for i in range(timeout // 10):
        time.sleep(10)
        try:
            resp = urllib.request.urlopen(
                f"{COMFYUI_URL}/history/{prompt_id}", timeout=10)
            data = json.loads(resp.read())
            if prompt_id in data:
                outputs = data[prompt_id].get("outputs", {})
                if "12" in outputs:
                    gifs = outputs["12"].get("gifs", [])
                    if gifs:
                        return gifs[0]["filename"]
                status = data[prompt_id].get("status", {})
                if status.get("status_str") == "error":
                    return None
        except:
            pass
    return None
```

### 파일 전송 (SCP)

```python
import subprocess

def scp_to_gpu(local_path, remote_name):
    """로컬 → 5090 PC ComfyUI input 폴더로 전송"""
    subprocess.run([
        "scp", str(local_path),
        f"gpu:C:/AI/ComfyUI/input/{remote_name}"
    ], capture_output=True, timeout=30)

def scp_from_gpu(remote_filename, local_path):
    """5090 PC ComfyUI output → 로컬로 다운로드"""
    subprocess.run([
        "scp", f"gpu:C:/AI/ComfyUI/output/{remote_filename}",
        str(local_path)
    ], capture_output=True, timeout=60)
```

---

## 7. Phase 5: 서브 에이전트 오가닉 베리에이션

### 왜 서브 에이전트인가

**실패한 접근: 인위적 테마 베리에이션**

처음에는 동일한 프롬프트에 인위적인 테마를 씌우는 방식을 시도했다:
- v6: "골든아워" — 따뜻한 금빛 조명 테마
- v7: "쿨블루" — 차가운 푸른 조명 테마
- v8: "드라마틱 석양" — 강렬한 오렌지 역광 테마

**문제**: 너무 인위적이다. 색감만 바꿨을 뿐, **연출 자체가 다른 게 아니다**. 콘티의 장면을 "어떻게 연출할 것인가"의 해석은 동일한 채로, 위에 필터만 씌운 것에 불과하다.

**성공한 접근: 독립 에이전트의 연출 해석**

서브 에이전트 방식의 핵심은 **색감이나 톤의 차이가 아니라, 연출의 해석이 달라지는 것**이다:

- **카메라 워크**: 고정 카메라 vs 슬로우 푸시인 vs 카메라 셰이크
- **캐릭터 동작**: 팔이 벌어지는 폭, 몸이 반동하는 정도, 어깨가 처지는 타이밍
- **배경 구성**: 16:9 확장 시 사물함을 넣을지, 빈 벽을 넣을지, 창문 빛을 넣을지
- **액션 디테일**: 동전을 "건네는" 것과 "떨어뜨리는" 것, 불량배가 "돌아서 가는" 것과 "슬쩍 가는" 것

3명의 서브 에이전트에게 **동일한 콘티 기획서**를 주고, 각자 독립적으로 장면을 해석하고 4종 프롬프트를 작성하게 하면, 같은 스토리보드에서 **연출 자체가 자연스럽게 분기**된다.

### 서브 에이전트에게 전달하는 브리프

각 에이전트에게 동일하게 전달하는 내용:

```
당신은 애니메이션 영상 PD입니다.

아래 콘티 기획서와 캐릭터 설정을 읽고, 각 컷에 대해 4종의 프롬프트를
작성해주세요:

1. gemini_colorize: 라인아트를 컬러화하는 프롬프트
2. gemini_expand: 정사각형 이미지를 16:9로 확장하는 프롬프트
3. gemini_start_frame: End Frame에서 Start Frame을 만드는 프롬프트
4. video_prompt: 영상 생성 프롬프트 (Start→End 사이 모션)

[콘티 기획서 전문]
[캐릭터 컬러 설정]
[각 컷의 라인아트 이미지]

프롬프트 작성 시 주의사항:
- 캐릭터 외형은 컬러 레퍼런스를 정확히 따를 것
- Start/End 프레임의 카메라 뷰(원근법)는 반드시 동일하게 유지
- Cut 3은 퇴장 장면이므로 3인 이미지=Start, 혼자 이미지=End
- 영상 프롬프트는 "Anime style, Korean webtoon aesthetic"으로 시작
- 자연스럽게, 당신만의 해석으로 작성해주세요
```

### 에이전트별 연출 해석 차이: 실제 비교

서브 에이전트가 만들어내는 차이는 색감이 아니라 **연출 판단**이다. 동일한 콘티 컷을 놓고 카메라, 동작, 분위기를 다르게 해석한 실제 사례를 보자.

#### Cut 2 — 불량배가 밀치는 장면

콘티 원본은 "큰 체격의 불량배가 희원을 밀친다"라는 한 줄이다. 세 에이전트는 이 장면의 **카메라 처리**와 **충격의 강도**를 각각 다르게 연출했다:

**Agent A — 감정 중심 연출**:
```
The shove is abrupt and rough. 희원's body recoils backward, arms flailing
slightly for balance, face showing shock and fear. The bully's motion is
aggressive and dominant. Tense, threatening atmosphere.
```
→ 카메라 언급 없음(기본 고정). **얼굴 표정**(shock and fear)과 **감정**(threatening)에 집중.

**Agent B — 카메라 연출 강조**:
```
The smaller boy stumbles backward, arms raised slightly in surprise and fear.
The push is abrupt and rough — the smaller boy's body reacts with momentum,
hair shifting. Two-shot composition, mid-body framing.
Slight camera shake on impact. Tense, uncomfortable atmosphere.
```
→ **"camera shake on impact"** — 충격 순간 카메라가 흔들리는 연출 추가. **"two-shot, mid-body framing"** — 구체적 프레이밍 지시. 머리카락이 밀리는 물리적 디테일(hair shifting).

**Agent C — 사운드 디자인적 해석**:
```
The push is rough and abrupt. The bully looms over him. Camera is static,
two-shot composition. Tension is sudden and uncomfortable.
No music implied — just the sound of footsteps and impact.
```
→ **"No music implied — just the sound of footsteps and impact"** — 소리 연출까지 지시. **"Camera is static"** — 의도적으로 카메라를 고정해서 관객이 목격자처럼 느끼게.

> **연출 분기점**: 같은 "밀치기" 장면인데, A는 감정 클로즈업, B는 카메라 셰이크로 물리적 충격 강조, C는 침묵과 고정 카메라로 불편한 관찰자 시점. 이 차이는 색감이 아니라 **장면을 어떤 영화 문법으로 풀 것인가**의 차이다.

#### Cut 3 — 동전 건네기 + 불량배 퇴장

콘티: "뒷모습 3인 구도. 동전을 건네고, 불량배가 퇴장한다."

**Agent A**: "reluctantly extends his hand to pass coins" + "the two bullies **exchange a look** and then walk away"
→ 불량배끼리 **눈짓을 교환**하는 비트를 추가. 공모의 느낌.

**Agent B**: "reluctantly extends his hand and **drops coins into the palm**" + "The motion is **slow and deflating** — the boy's shoulders sag"
→ 동전을 "건네는" 게 아니라 **"손바닥에 떨어뜨리는"** 동작으로 해석. 더 굴욕적. 어깨가 **떠나가는 타이밍에 맞춰** 처지는 디테일.

**Agent C**: "reluctantly holds out coins, **which the large bully on the right takes**" + "The departure of the bullies creates **a slow, heavy silence**"
→ 동전을 받아가는 동작을 불량배 시점에서 서술. 퇴장 후 남는 것이 감정이 아니라 **"무거운 침묵"**이라는 공간적 연출.

> **연출 분기점**: 동전 건네는 동작(pass vs drop into palm vs hold out), 불량배 퇴장의 연출(눈짓 교환 vs 주머니에 넣기 vs 묵묵히 떠남), 퇴장 후 남는 것(감정 vs 신체반응 vs 침묵).

#### Cut 5 — 표정 변화 (클로즈업)

콘티: "체념에서 수줍은 미소로 변하는 미세한 표정."

**Agent A — 내면 서사 중심**:
```
almost imperceptibly, something catches his attention. His eyes shift slightly.
His expression softens — the dejection gives way to a faint, involuntary
shyness, a subtle warmth. The transition is slow and internal.
No dramatic movement, just the quiet language of a face changing.
```
→ **"involuntary shyness"** — 본인도 모르게 나오는 수줍음. **"quiet language of a face"** — 문학적 표현. 카메라 움직임 없음.

**Agent B — 미세한 카메라 움직임 추가**:
```
his eyes lift slightly, a faint blush colors his cheeks, his expression
softens into shy embarrassment. The transition is subtle and human, not
dramatic. Minimal camera movement — perhaps an extremely slow, barely
perceptible push in. Warm, gentle lighting.
```
→ **"barely perceptible push in"** — 극도로 느린 줌인으로 친밀감 상승. 볼 붉어짐(blush) 명시. 조명이 따뜻하게 전환(warm lighting).

**Agent C — 숨결까지 포함한 신체 연출**:
```
the corners of his lips softening, eyes glancing slightly to the side.
The transition is gentle and internal, like a small feeling breaking through.
Minimal movement — perhaps a slight shift of his eyes, a small breath.
Emotional and intimate moment.
```
→ **"a small breath"** — 숨을 내쉬는 신체적 반응 추가. 시선이 **"살짝 옆으로"** 가는 방향 지시. 입꼬리가 부드러워지는 구체적 근육 움직임.

> **연출 분기점**: 같은 표정 변화인데, A는 내면 독백적, B는 카메라 줌인 + 블러시 물리 표현, C는 호흡과 시선 방향까지 포함한 신체 연기. AI 영상 모델이 이 차이를 받아들이면, 각각 다른 **연기 톤**의 애니메이션이 나온다.

### 왜 색감이 아니라 연출인가

| 테마 베리에이션 (v6~v8) | 에이전트 베리에이션 (vA~vC) |
|---|---|
| "이 장면을 골든아워로" | "이 장면을 네가 해석해봐" |
| 연출 동일, 색감만 다름 | 색감 유사, **연출이 다름** |
| 캐릭터 동작 동일 | 동작의 강도/타이밍/디테일 다름 |
| 카메라 동일 | 고정 vs 셰이크 vs 슬로우 푸시인 |
| 배경 동일 | 사물함 vs 빈 벽 vs 창문 배치 다름 |
| 결과: 같은 영상에 필터 | 결과: **다른 PD가 찍은 다른 영상** |

서브 에이전트 방식은 결국 **"같은 대본을 여러 감독에게 주면 각각 다른 영화가 나온다"**는 원리를 AI 파이프라인에 적용한 것이다. 색감을 바꾸는 건 포스트프로덕션이지만, 연출을 바꾸는 건 프리프로덕션부터 달라지는 것이다.

### 실행 구조

```python
# 에이전트별 프롬프트 세트를 Python dict로 구조화
AGENT_A = {
    "1": {
        "gemini_colorize": "...",
        "gemini_expand": "...",
        "gemini_start_frame": "...",
        "video_prompt": "..."
    },
    "2": { ... },
    ...
    "6": { ... }
}

AGENT_B = { ... }  # B의 독립적 해석
AGENT_C = { ... }  # C의 독립적 해석

AGENTS = {"vA": AGENT_A, "vB": AGENT_B, "vC": AGENT_C}

# 순차 실행: 에이전트별 × 컷별
for ver, agent_prompts in AGENTS.items():
    for cut_id in ["1", "2", "3", "4", "5", "6"]:
        result = process_cut(ver, cut_id, agent_prompts[cut_id])
        # Gemini 3단계 + ComfyUI + 업로드까지 자동화
```

---

## 8. 전체 자동화 코드

### 단일 컷 처리 함수

```python
def process_cut(ver, cut_id, prompts):
    """한 컷의 전체 파이프라인: Gemini(3단계) → SCP → ComfyUI → 다운로드 → 업로드"""
    prefix = f"cut{cut_id}{ver}"
    ref_img = "extracted_egg/character_color_ref.jpg"
    line_art = f"extracted_egg/{CUT_LINE_ART[cut_id]}"

    color_path = f"extracted_egg/{prefix}_color.png"
    end_path   = f"extracted_egg/{prefix}_end.png"
    start_path = f"extracted_egg/{prefix}_start.png"
    video_path = f"extracted_egg/{prefix}_final.mp4"

    # ── Gemini Phase ──

    # Step 1: 컬러화 (레퍼런스 + 라인아트 → 컬러)
    gemini_generate(prompts["gemini_colorize"], [ref_img, line_art], color_path)
    time.sleep(1)

    # Step 2: 16:9 확장 (컬러 → End Frame)
    gemini_generate(prompts["gemini_expand"], [color_path], end_path)
    time.sleep(1)

    # Step 3: Start Frame 생성 (End → Start, 카메라 뷰 동일)
    gemini_generate(prompts["gemini_start_frame"], [end_path], start_path)
    time.sleep(1)

    # ── Cut 3 특수 처리: 프레임 역할 반전 ──
    if cut_id == "3":
        actual_start = end_path    # 3인 이미지 = Start (퇴장 전)
        actual_end   = start_path  # 혼자 이미지 = End (퇴장 후)
    else:
        actual_start = start_path
        actual_end   = end_path

    # ── ComfyUI Phase ──

    # Step 4: 프레임을 5090 PC로 전송
    scp_to_gpu(actual_start, f"{prefix}_start.png")
    scp_to_gpu(actual_end,   f"{prefix}_end.png")

    # Step 5: ComfyUI 워크플로우 제출 + 폴링
    seed = random.randint(1, 999999999)
    prompt_id = submit_comfyui(
        f"{prefix}_start.png", f"{prefix}_end.png",
        prompts["video_prompt"], seed, f"{prefix}_final"
    )
    output_file = poll_comfyui(prompt_id)  # ~60초 대기

    # Step 6: 결과 다운로드 + 공유 URL 생성
    scp_from_gpu(output_file, video_path)
    url = upload_file(video_path, f"{prefix}_final.mp4")

    return {"seed": seed, "url": url, "prompt_id": prompt_id}
```

### 메인 루프

```python
def main():
    progress = load_progress()
    if "agent_variations" not in progress:
        progress["agent_variations"] = {}

    for ver, agent_prompts in AGENTS.items():
        progress["agent_variations"][ver] = {}

        for cut_id in ["1", "2", "3", "4", "5", "6"]:
            result = process_cut(ver, cut_id, agent_prompts[cut_id])
            if result:
                progress["agent_variations"][ver][cut_id] = result
            else:
                progress["agent_variations"][ver][cut_id] = {"error": "failed"}
            save_progress(progress)  # 컷 완료할 때마다 중간 저장

    # 결과 요약 출력
    for ver in AGENTS:
        for cut_id in ["1", "2", "3", "4", "5", "6"]:
            d = progress["agent_variations"][ver][cut_id]
            print(f"{ver} Cut {cut_id}: seed={d.get('seed')}  {d.get('url')}")
```

### 타이밍

| 단계 | 소요 시간 |
|------|----------|
| Gemini 컬러화 | ~5초 |
| Gemini 16:9 확장 | ~5초 |
| Gemini Start Frame | ~5초 |
| SCP 업로드 (2장) | ~2초 |
| ComfyUI 생성 (113프레임) | ~60초 |
| SCP 다운로드 + 업로드 | ~5초 |
| **컷당 합계** | **~80초** |
| **에이전트 1세트 (6컷)** | **~8분** |
| **3 에이전트 (18컷)** | **~25분** |

---

## 9. 실험 결과 요약

### 베리에이션 전략 비교

| 전략 | 버전 | 달라지는 것 | 장점 | 단점 |
|------|------|-----------|------|------|
| **시드 변형** | v3~v5 | seed만 | 가장 빠름 (Gemini 스킵) | 구도 동일, 모션만 다름 |
| **테마 변형** | v6~v8 | 인위적 테마 프롬프트 | 확실히 다른 분위기 | 원작 의도와 동떨어짐 |
| **에이전트 변형** | vA~vC | 독립 해석에 의한 전체 프롬프트 | 자연스럽고 유기적 | 미묘한 차이 (선택지 더 풍부) |

### 생성된 영상 총 66개

| 구분 | 버전 | 컷 수 | 총 영상 | 비고 |
|------|------|-------|--------|------|
| 초안 | v1 | 6 | 6 | 5초, 최초 파이프라인 |
| 개선 | v2 | 6 | 6 | 7초, 컬러 레퍼런스 적용 |
| 시드 | v3~v5 | 6×3 | 18 | 동일 프레임, 다른 시드 |
| 테마 | v6~v8 | 6×3 | 18 | 골든아워/쿨블루/석양 |
| 에이전트 | vA~vC | 6×3 | 18 | 독립 해석, 오가닉 차이 |
| **합계** | | | **66** | |

### 핵심 교훈

1. **프롬프트 설계가 80%**: 시드보다 프롬프트의 미묘한 차이가 결과물 품질에 훨씬 큰 영향
2. **카메라 뷰 일치가 필수**: Start/End 프레임의 원근법이 다르면 FLF2V가 왜곡을 만듦
3. **컬러 레퍼런스 필수**: 없으면 컷마다 캐릭터 색상이 달라짐
4. **에이전트 독립 해석 > 인위적 테마**: 같은 소스를 여러 관점에서 해석하는 것이 더 자연스럽고 유용한 베리에이션
5. **Distill LoRA의 가치**: 4스텝 ~60초 → 빠른 반복이 대량 베리에이션의 핵심 요건
6. **Cut 3 같은 예외 처리**: 퇴장 장면은 프레임 역할이 반전됨. 파이프라인에서 이를 명시적으로 처리해야 함
