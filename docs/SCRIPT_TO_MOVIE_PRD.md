# Script-to-Movie 서비스 PRD (Product Requirements Document)

## 1. 서비스 개요

**서비스명**: Script-to-Movie (대본 → 영화 영상)

**한줄 설명**: 텍스트 대본을 입력하면 AI가 자동으로 이미지 패널과 영상을 생성하는 서비스

**접근 경로**: `/script-to-movie`

---

## 2. 목표 및 배경

### 2.1 목표
- 사용자가 텍스트 대본만 입력하면 AI가 자동으로 영화 스타일의 영상을 생성
- 등장인물 이미지를 참조하여 일관된 캐릭터 비주얼 유지
- 배경 이미지를 레퍼런스로 활용하여 씬별 일관성 유지
- **롱폼 영상 지원**: 컷 수 제한 없이 대본 길이에 따라 유동적 생성

### 2.2 타겟 사용자
- 영상 제작 초보자
- 스토리보드를 빠르게 만들고 싶은 콘텐츠 크리에이터
- 아이디어 시각화가 필요한 기획자

---

## 3. 주요 기능

### 3.1 프로젝트 관리
| 기능 | 설명 |
|------|------|
| 프로젝트 생성 | 새 프로젝트 생성 (제목, 대본 입력) |
| 프로젝트 목록 | 공개/비공개 필터링으로 프로젝트 조회 |
| 프로젝트 수정 | 제목, 대본, 설정 수정 |
| 프로젝트 삭제 | 프로젝트 및 관련 데이터 삭제 |
| 공개/비공개 설정 | 소유자만 프로젝트 가시성 변경 가능 |

### 3.2 캐릭터 관리
| 기능 | 설명 |
|------|------|
| 캐릭터 추가/삭제 | 등장인물 추가 및 삭제 |
| 캐릭터 이미지 업로드 | 직접 이미지 업로드 |
| 캐릭터 시트 연동 | 기존 캐릭터 시트에서 이미지 선택 |
| 캐릭터 설명 입력 | 캐릭터별 특징 설명 (선택) |
| **🆕 AI로 캐릭터 생성** | 대본 분석하여 등장인물 자동 추출 및 이미지 생성 |
| **🆕 캐릭터 프롬프트 수정** | 생성된 프롬프트 수정 후 개별 재생성 |

#### 3.2.1 AI 캐릭터 생성 상세

**기능 흐름**:
```
[AI로 생성 버튼 클릭]
    ↓
[LLM에 대본 전달]
    ↓ 프롬프트: "대본에서 등장인물을 추출하고 각 캐릭터의 이미지 생성 프롬프트를 생성해줘"
[JSON 응답 파싱]
    ↓ { characters: [{ name: "철수", imagePrompt: "a young korean man with..." }, ...] }
[캐릭터별 이미지 병렬 생성]
    ↓ 기존 이미지 생성 API 재사용 (Gemini/Seedream)
[결과 표시]
    → 각 캐릭터 카드에 이름 + 이미지 + 프롬프트 표시
```

**프롬프트 수정 & 재생성**:
- 각 캐릭터 카드에 "프롬프트 보기/수정" 버튼
- 프롬프트 수정 후 해당 캐릭터만 개별 재생성 가능
- 재생성 시 기존 이미지는 새 이미지로 교체

### 3.3 🆕 배경(씬) 분석 및 생성
| 기능 | 설명 |
|------|------|
| **AI 배경 분석** | LLM이 대본에서 동일 장소(씬)를 추출하고 배경 묘사 프롬프트 생성 |
| **배경 이미지 생성** | 추출된 배경들을 이미지로 병렬 생성 |
| **배경 프롬프트 수정** | 생성된 프롬프트 수정 후 개별 재생성 |
| 스타일 선택 | 실사(realistic) / 카툰(cartoon) 스타일 |
| AI 모델 선택 | Gemini / Seedream 모델 선택 |

#### 3.3.1 배경 분석 상세 (1차)

**LLM 프롬프트 예시**:
```
대본을 분석하여 각 씬(동일 장소)의 배경을 추출해주세요.
각 배경에 대해:
- name: 장소 이름 (예: "카페 내부", "공원 벤치")
- imagePrompt: 이미지 생성용 상세 묘사 프롬프트

JSON 형식으로 응답:
{ "backgrounds": [{ "name": "...", "imagePrompt": "..." }, ...] }
```

**응답 예시**:
```json
{
  "backgrounds": [
    { "name": "카페 내부", "imagePrompt": "cozy korean cafe interior, warm lighting, wooden tables..." },
    { "name": "도시 공원", "imagePrompt": "urban park in Seoul, cherry blossom trees, bench..." }
  ]
}
```

### 3.4 🆕 컷 분할
| 기능 | 설명 |
|------|------|
| **AI 컷 분할** | LLM이 대본 + 배경 + 캐릭터 정보를 분석하여 컷으로 분할 |
| **컷별 정보** | 각 컷에 대해 이미지 프롬프트, 등장 캐릭터, 배경 지정 |
| **컷 수 무제한** | 대본 길이에 따라 유동적으로 컷 수 결정 |
| **컷 프롬프트 수정** | 생성된 프롬프트 수정 가능 |

#### 3.4.1 컷 분할 상세 (2차)

**LLM 프롬프트 예시**:
```
대본을 영화 컷으로 분할해주세요.

[배경 목록]
1. 카페 내부
2. 도시 공원

[등장인물]
- 철수: 30대 남성, 정장
- 영희: 20대 여성, 캐주얼

각 컷에 대해:
- cutIndex: 컷 순서
- imagePrompt: 이 컷을 그리기 위한 이미지 프롬프트
- characters: 등장하는 캐릭터 이름 배열
- backgroundName: 이 컷의 배경 이름
- dialogue: 이 컷의 대사 (있는 경우)
- duration: 권장 영상 길이 (초)

JSON 형식으로 응답:
{ "cuts": [...] }
```

**응답 예시**:
```json
{
  "cuts": [
    {
      "cutIndex": 1,
      "imagePrompt": "medium shot, 철수 sitting alone at a cafe table, looking at phone...",
      "characters": ["철수"],
      "backgroundName": "카페 내부",
      "dialogue": "",
      "duration": 4
    },
    {
      "cutIndex": 2,
      "imagePrompt": "wide shot, 영희 entering the cafe, looking around...",
      "characters": ["영희"],
      "backgroundName": "카페 내부",
      "dialogue": "철수야!",
      "duration": 3
    }
  ]
}
```

### 3.5 🆕 컷 이미지 생성
| 기능 | 설명 |
|------|------|
| **컷별 이미지 생성** | 각 컷 이미지를 순차 또는 병렬 생성 |
| **레퍼런스 활용** | 캐릭터 이미지 + 배경 이미지를 레퍼런스로 사용 |
| **개별 컷 재생성** | 특정 컷만 프롬프트 수정 후 재생성 |

#### 3.5.1 컷 이미지 생성 상세 (3차)

**이미지 생성 입력**:
- `imagePrompt`: 2차에서 생성된 컷 묘사 프롬프트
- `characterImages`: 해당 컷에 등장하는 캐릭터들의 레퍼런스 이미지
- `backgroundImage`: 해당 컷의 배경 레퍼런스 이미지

**생성 전략**:
- 병렬 생성으로 속도 최적화 (rate limit 고려)
- 실패 시 자동 재시도
- 개별 재생성 지원

### 3.6 영상 생성
| 기능 | 설명 |
|------|------|
| 단일 영상 생성 | 특정 컷만 영상 생성 |
| 전체 영상 생성 | 모든 컷 일괄 영상 생성 |
| Veo API 연동 | Google Veo API로 영상 생성 |
| 커스텀 API Key | 사용자 개인 API Key 사용 가능 |
| Duration 설정 | 컷별 영상 길이 설정 |

---

## 4. 사용자 플로우

```
[프로젝트 목록]
    ↓ 새 프로젝트 / 기존 프로젝트 선택

[프로젝트 편집]
    ↓ 대본 입력 → 저장

[등장인물 설정]
    ↓ 방법 1: 수동으로 캐릭터 추가 + 이미지 업로드
    ↓ 방법 2: "AI로 생성" 버튼 클릭
        ↓ LLM이 대본 분석 → 캐릭터 추출 + 이미지 프롬프트 생성
        ↓ 이미지 생성 API로 캐릭터 이미지 병렬 생성
        ↓ 필요시 프롬프트 수정 후 개별 재생성

[1차: 배경 분석] 🆕
    ↓ "배경 분석" 버튼 클릭
    ↓ LLM이 대본에서 씬(동일 장소) 추출
    ↓ 각 씬의 배경 묘사 프롬프트 생성
    ↓ 필요시 프롬프트 수정

[1.5차: 배경 이미지 생성] 🆕
    ↓ "배경 생성" 버튼 클릭
    ↓ 모든 배경 이미지 병렬 생성
    ↓ 필요시 개별 재생성

[2차: 컷 분할] 🆕
    ↓ "컷 분할" 버튼 클릭
    ↓ LLM에게 대본 + 배경 목록 + 캐릭터 목록 전달
    ↓ 각 컷별 이미지 프롬프트 + 등장인물 + 배경 정보 생성
    ↓ 필요시 프롬프트 수정

[3차: 컷 이미지 생성] 🆕
    ↓ "컷 이미지 생성" 버튼 클릭
    ↓ 각 컷 이미지 병렬 생성 (프롬프트 + 캐릭터 이미지 + 배경 레퍼런스)
    ↓ 필요시 개별 재생성

[영상 생성]
    ↓ 컷별 또는 전체 영상 생성

[완료]
    → 영상 확인 및 다운로드
```

---

## 5. 🆕 생성 파이프라인

### 5.1 전체 파이프라인 요약

```
┌─────────────────────────────────────────────────────────────────┐
│                        [대본 입력]                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ [캐릭터 생성]                                                    │
│  - LLM: 대본 → 캐릭터 추출 + 이미지 프롬프트                      │
│  - 이미지 생성: 캐릭터별 이미지 병렬 생성                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ [1차: 배경 분석]                                                 │
│  - LLM: 대본 → 씬(장소) 추출 + 배경 이미지 프롬프트                │
│  - 출력: { backgrounds: [{ name, imagePrompt }] }               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ [1.5차: 배경 이미지 생성]                                        │
│  - 모든 배경 이미지 병렬 생성                                     │
│  - 레퍼런스로 사용될 배경 이미지 확보                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ [2차: 컷 분할]                                                   │
│  - LLM 입력: 대본 + 배경 목록 + 캐릭터 목록                       │
│  - 출력: { cuts: [{ cutIndex, imagePrompt, characters,          │
│                     backgroundName, dialogue, duration }] }     │
│  - 컷 수 무제한 (롱폼 지원)                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ [3차: 컷 이미지 생성]                                            │
│  - 입력: 이미지 프롬프트 + 캐릭터 이미지 + 배경 이미지             │
│  - 각 컷 이미지 병렬 생성                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ [영상 생성]                                                      │
│  - Veo API로 컷별 영상 생성                                       │
│  - 컷 이미지 + 비디오 프롬프트 사용                               │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 각 단계별 수정/재생성 가능

| 단계 | 수정 가능 항목 | 재생성 단위 |
|------|---------------|-------------|
| 캐릭터 | 이미지 프롬프트 | 개별 캐릭터 |
| 1차 배경 분석 | 배경 프롬프트 | 개별 배경 |
| 2차 컷 분할 | 컷 프롬프트, 등장인물, 배경 | 개별 컷 |
| 3차 컷 이미지 | 이미지 프롬프트 | 개별 컷 이미지 |
| 영상 | 비디오 프롬프트, duration | 개별 영상 |

---

## 6. 기술 스택

### 6.1 Frontend
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui 컴포넌트

### 6.2 Backend
- Next.js API Routes
- Supabase (PostgreSQL + Storage)

### 6.3 AI 서비스
- **이미지 생성**: Gemini / Seedream API
- **스크립트 생성**: Gemini (gemini-3-pro-preview)
- **영상 생성**: Google Veo API

---

## 7. 데이터 모델

### 7.1 movie_projects (프로젝트)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| title | VARCHAR(255) | 프로젝트 제목 |
| script | TEXT | 대본 내용 (필수) |
| status | VARCHAR(50) | 상태 (draft, characters_ready, backgrounds_ready, cuts_ready, images_ready, completed) |
| style | VARCHAR(50) | 이미지 스타일 (realistic, cartoon) |
| is_public | BOOLEAN | 공개 여부 |
| created_by | UUID | 생성자 ID (FK → auth.users) |
| created_at | TIMESTAMPTZ | 생성 시간 |
| updated_at | TIMESTAMPTZ | 수정 시간 |

### 7.2 movie_characters (캐릭터)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| project_id | UUID | FK → movie_projects |
| name | VARCHAR(255) | 캐릭터 이름 (필수) |
| description | TEXT | 캐릭터 설명 |
| **image_prompt** | **TEXT** | **이미지 생성 프롬프트 (AI 생성 또는 사용자 수정)** |
| image_path | TEXT | 이미지 URL |
| storage_path | TEXT | Storage 내 경로 |
| order_index | INTEGER | 정렬 순서 |
| created_at | TIMESTAMPTZ | 생성 시간 |
| updated_at | TIMESTAMPTZ | 수정 시간 |

### 7.3 🆕 movie_backgrounds (배경)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| project_id | UUID | FK → movie_projects |
| name | VARCHAR(255) | 배경/장소 이름 (예: "카페 내부") |
| image_prompt | TEXT | 이미지 생성 프롬프트 |
| image_path | TEXT | 이미지 URL |
| storage_path | TEXT | Storage 내 경로 |
| order_index | INTEGER | 정렬 순서 |
| created_at | TIMESTAMPTZ | 생성 시간 |
| updated_at | TIMESTAMPTZ | 수정 시간 |

### 7.4 🆕 movie_cuts (컷) - 기존 movie_scenes 대체
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| project_id | UUID | FK → movie_projects |
| cut_index | INTEGER | 컷 순서 (필수) |
| image_prompt | TEXT | 컷 이미지 생성 프롬프트 |
| background_id | UUID | FK → movie_backgrounds (이 컷의 배경) |
| character_ids | UUID[] | 등장하는 캐릭터 ID 배열 |
| dialogue | TEXT | 이 컷의 대사 |
| image_path | TEXT | 생성된 컷 이미지 URL |
| storage_path | TEXT | Storage 내 경로 |
| video_prompt | TEXT | 영상 생성 프롬프트 |
| duration | INTEGER | 영상 길이 (초, 기본값: 4) |
| video_path | TEXT | 생성된 영상 URL |
| video_storage_path | TEXT | Video Storage 내 경로 |
| image_status | VARCHAR(50) | 이미지 상태 (pending, generating, completed, failed) |
| video_status | VARCHAR(50) | 영상 상태 (pending, generating, completed, failed) |
| error_message | TEXT | 오류 메시지 |
| created_at | TIMESTAMPTZ | 생성 시간 |
| updated_at | TIMESTAMPTZ | 수정 시간 |

---

## 8. API 엔드포인트

### 8.1 프로젝트 관리
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/movie` | 프로젝트 목록 조회 |
| POST | `/api/movie` | 프로젝트 생성 |
| GET | `/api/movie/[projectId]` | 프로젝트 상세 조회 |
| PATCH | `/api/movie/[projectId]` | 프로젝트 수정 |
| DELETE | `/api/movie/[projectId]` | 프로젝트 삭제 |

### 8.2 캐릭터 관리
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/movie/[projectId]/characters` | 캐릭터 목록 조회 |
| POST | `/api/movie/[projectId]/characters` | 캐릭터 추가 |
| PUT | `/api/movie/[projectId]/characters` | 캐릭터 일괄 수정 |
| POST | `/api/movie/[projectId]/generate-characters` | AI로 캐릭터 추출 + 이미지 생성 |
| POST | `/api/movie/[projectId]/characters/[characterId]/regenerate` | 개별 캐릭터 이미지 재생성 |
| PATCH | `/api/movie/[projectId]/characters/[characterId]` | 캐릭터 정보 수정 (프롬프트 등) |

### 8.3 🆕 배경 관리
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/movie/[projectId]/backgrounds` | 배경 목록 조회 |
| POST | `/api/movie/[projectId]/analyze-backgrounds` | **1차: AI로 배경 분석** (LLM) |
| POST | `/api/movie/[projectId]/generate-backgrounds` | **1.5차: 배경 이미지 생성** |
| POST | `/api/movie/[projectId]/backgrounds/[backgroundId]/regenerate` | 개별 배경 이미지 재생성 |
| PATCH | `/api/movie/[projectId]/backgrounds/[backgroundId]` | 배경 정보 수정 (프롬프트 등) |

### 8.4 🆕 컷 관리
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/movie/[projectId]/cuts` | 컷 목록 조회 |
| POST | `/api/movie/[projectId]/analyze-cuts` | **2차: AI로 컷 분할** (LLM) |
| POST | `/api/movie/[projectId]/generate-cut-images` | **3차: 컷 이미지 생성** |
| POST | `/api/movie/[projectId]/cuts/[cutId]/regenerate-image` | 개별 컷 이미지 재생성 |
| PATCH | `/api/movie/[projectId]/cuts/[cutId]` | 컷 정보 수정 (프롬프트, 캐릭터, 배경 등) |

### 8.5 영상 생성
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/movie/[projectId]/generate-videos` | 전체/선택 영상 생성 |
| POST | `/api/movie/[projectId]/cuts/[cutId]/generate-video` | 개별 컷 영상 생성 |

---

## 9. 스토리지

### 9.1 버킷
- **버킷명**: `movie-videos`
- **접근 권한**: Public (읽기/쓰기)

### 9.2 파일 구조
```
movie-videos/
├── characters/
│   └── {projectId}_{characterId}.png
├── backgrounds/
│   └── {projectId}_{backgroundId}.png
├── cuts/
│   └── {projectId}_{cutIndex}.png
└── videos/
    └── {projectId}_{cutIndex}.mp4
```

---

## 10. UI 컴포넌트 구조

```
app/script-to-movie/page.tsx (메인 페이지)
├── components/movie/CharactersSection.tsx (캐릭터 관리 섹션)
├── components/movie/BackgroundsSection.tsx (🆕 배경 관리 섹션)
├── components/movie/CutsSection.tsx (🆕 컷 관리 섹션)
├── components/movie/VideoGenerationSection.tsx (영상 생성 섹션)
└── components/movie/types.ts (타입 정의)
```

---

## 11. 현재 상태 및 제한사항

### 11.1 현재 구현된 기능 (기존 코드 기반)
- ✅ 프로젝트 CRUD
- ✅ 캐릭터 관리 (이미지 업로드 포함)
- ✅ 공개/비공개 프로젝트 관리

### 11.2 🆕 구현 예정 기능 (신규 파이프라인)
- ⏳ AI 캐릭터 자동 생성 (대본 분석 → 캐릭터 추출 → 이미지 생성)
- ⏳ 캐릭터 프롬프트 수정 및 개별 재생성
- ⏳ **1차: 배경 분석** (LLM으로 씬/장소 추출)
- ⏳ **1.5차: 배경 이미지 생성** (병렬 생성)
- ⏳ **2차: 컷 분할** (LLM으로 컷 분할 + 프롬프트 생성)
- ⏳ **3차: 컷 이미지 생성** (캐릭터 + 배경 레퍼런스 활용)
- ⏳ 컷별 영상 생성

### 11.3 🗑️ 제거 예정 기능 (그리드 방식)
- ❌ 2x2 / 3x3 그리드 이미지 생성
- ❌ 컷to컷 / 컷별 영상 모드

### 11.4 제한사항
- 영상 길이: 최대 8초 (Veo API 제한)
- **컷 수 제한 없음** (롱폼 지원)
- 동시 생성 제한: API rate limit 적용

---

## 12. 향후 개선 계획

> 이 섹션은 향후 수정 예정입니다.

### 12.1 단기 개선
- [ ] 영상 편집 기능 추가
- [ ] 배경음악/효과음 추가
- [ ] 자막 자동 생성

### 12.2 중장기 개선
- [ ] 영상 합치기 (씬들을 하나로)
- [ ] 템플릿 시스템
- [ ] 협업 기능

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2025-01-02 | 1.0 | 초기 PRD 작성 (shorts 서비스 기반) |
| 2025-01-02 | 1.1 | AI 캐릭터 생성 기능 추가 |
| 2025-01-02 | 2.0 | 🔄 **대규모 아키텍처 변경**: 그리드 방식 → 3단계 컷 분석 방식으로 전환. 배경 분석/생성, 컷 분할, 컷 이미지 생성 파이프라인 도입. 롱폼 영상 지원. |
