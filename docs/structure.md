# 더그림 CMS — 디렉토리 구조 & 모듈 경계

## 디렉토리 구조

```
thegrim-cms/
├── app/                        # Next.js App Router
│   ├── api/                    # API 라우트 (Route Handlers)
│   │   ├── accounting/         # 회계 시스템 API
│   │   ├── movie/[projectId]/  # Script-to-Movie API
│   │   ├── shorts/[projectId]/ # Script-to-Shorts API
│   │   ├── webtoonanimation/   # 웹툰 애니메이션 API
│   │   ├── episode-scripts/    # 회차 대본/스토리보드 API
│   │   ├── comfyui/            # ComfyUI 연동 API
│   │   ├── analyze-image/      # Gemini 이미지 분석
│   │   ├── regenerate-image*/  # 이미지 재생성
│   │   └── generate-*/         # 각종 생성 API
│   ├── accounting/             # 회계·정산 페이지
│   ├── webtoons/               # 웹툰 관리 페이지
│   ├── script-to-movie/        # 대본→영상 페이지
│   ├── script-to-shorts/       # 대본→쇼츠 페이지
│   ├── script-to-storyboard/   # 대본→컷 페이지
│   ├── webtoonanimation/       # 웹툰 애니메이션 페이지
│   ├── free-creation/          # 자유 창작 AI 챗 페이지
│   ├── monster-generator/      # 몬스터 생성기 페이지
│   ├── files/                  # 파일 관리 페이지
│   ├── login/, signup/         # 인증 페이지
│   ├── admin/                  # 관리자 페이지
│   ├── layout.tsx              # 루트 레이아웃
│   └── page.tsx                # 진입점 (/ 리다이렉트)
│
├── components/                 # React 컴포넌트
│   ├── ui/                     # shadcn/ui 기본 컴포넌트
│   ├── webtoonanimation/       # 웹툰 애니메이션 컴포넌트
│   ├── movie/                  # Script-to-Movie 컴포넌트
│   ├── shorts/                 # Script-to-Shorts 컴포넌트
│   ├── script-to-storyboard/   # 대본→컷 컴포넌트
│   ├── settlement/             # 정산 UI 컴포넌트
│   ├── sales/                  # 매출 컴포넌트
│   ├── relationship-map/       # 3D 관계도 컴포넌트
│   ├── free-creation/          # 자유 창작 컴포넌트
│   ├── AppLayout.tsx           # 앱 레이아웃 래퍼
│   ├── Navigation.tsx          # 상단 네비게이션
│   ├── FileGrid.tsx            # 파일 그리드 (핵심)
│   ├── FileDetailDialog.tsx    # 파일 상세 다이얼로그
│   ├── ImageRegenerationWorkspace.tsx  # 이미지 재생성
│   └── (기타 루트 컴포넌트들)
│
├── lib/                        # 비즈니스 로직 & 유틸
│   ├── api/                    # 클라이언트 API 함수 (fetch 래퍼)
│   │   ├── auth.ts             # 인증 API
│   │   ├── files.ts            # 파일 API
│   │   ├── webtoons.ts         # 웹툰 API
│   │   └── (기타 도메인별)
│   ├── image-generation/       # 이미지 생성 프로바이더
│   │   ├── providers/          # 모델별 구현체
│   │   └── batch/              # 배치 처리
│   ├── video-generation/       # 영상 생성 프로바이더
│   │   └── providers/
│   ├── settlement/             # 정산 계산 로직
│   ├── store/                  # Zustand 스토어
│   │   ├── useStore.ts         # 전역 상태
│   │   ├── useRelationshipStore.ts
│   │   └── useSettlementStore.ts
│   ├── hooks/                  # 커스텀 훅
│   │   ├── useAuth.ts          # 인증 상태
│   │   ├── useImageRegeneration.ts
│   │   └── useImageViewer.ts
│   ├── types/                  # TypeScript 타입 정의
│   ├── constants/              # 상수
│   ├── utils/                  # 유틸리티
│   │   └── permissions.ts      # 역할 기반 권한
│   ├── supabase.ts             # Supabase 클라이언트 (메인)
│   └── supabase/client.ts      # SSR용 Supabase 클라이언트
│
├── supabase/
│   └── migrations/             # DB 마이그레이션 (순서 보장)
│
├── docs/                       # 프로젝트 문서 (AI 에이전트 참조용)
├── public/                     # 정적 자산
│
# 루트 설정 파일들
├── supabase-schema.sql         # 전체 DB 스키마 (참조용)
├── supabase-rls-policies.sql   # RLS 정책
├── next.config.ts
├── tsconfig.json
└── components.json             # shadcn/ui 설정
```

## 모듈 경계

### 1. 페이지 (app/) ↔ 컴포넌트 (components/)
- 페이지는 레이아웃과 데이터 페칭 조율
- 복잡한 UI 로직은 컴포넌트로 분리
- 컴포넌트는 `lib/api/`를 통해 서버와 통신

### 2. 컴포넌트 ↔ lib/
- 컴포넌트에서 직접 `supabase` 클라이언트 사용 가능 (내부 서비스이므로 허용)
- 복잡한 비즈니스 로직은 `lib/hooks/` 또는 `lib/api/`로 추출
- 상태는 Zustand 스토어 경유

### 3. API Route ↔ 외부 서비스
- 모든 외부 API 호출(Gemini, ComfyUI, fal.ai)은 서버 사이드 API Route에서만
- 클라이언트에서 직접 외부 API 호출 금지 (API 키 보호)
- Supabase는 예외 (anon key 클라이언트 사용 허용)

### 4. 영상 생성 경계
- `lib/video-generation/` — 공통 타입, 레지스트리, 프로바이더 인터페이스
- `app/api/webtoonanimation/` — 웹툰 애니메이션 전용 영상 API
- `app/api/movie/`, `app/api/shorts/` — Script-to-Movie/Shorts 영상 API
- ComfyUI 연동: `app/api/comfyui/` + Lightsail 릴레이

## 데이터 플로우

### 파일 업로드 플로우
```
사용자 (드래그앤드롭/파일선택)
  → FileGrid.tsx (클라이언트)
    → POST /api/files/upload (서버 API Route)
      → Supabase Storage (파일 저장)
      → Gemini API (이미지 자동 분석)
      → Supabase DB (메타데이터 저장)
    → FileGrid 상태 업데이트 (Zustand 또는 로컬 state)
```

### AI 이미지 재생성 플로우
```
사용자 (스타일 선택 + 생성 요청)
  → ImageRegenerationWorkspace.tsx
    → useImageRegeneration.ts (훅)
      → POST /api/regenerate-image (서버)
        → lib/image-generation/providers/ (프로바이더 선택)
        → 외부 AI API 호출
        → Supabase Storage (결과 저장)
      → 히스토리 업데이트
```

### 웹툰 애니메이션 영상 생성 플로우
```
사용자 (컷 선택 + 생성 버튼)
  → WebtoonAnimation 컴포넌트 (클라이언트 폴링)
    → POST /api/webtoonanimation/generate-video-ltx23 (Vercel)
      → POST https://api.rewardpang.com/thegrim-cms/comfyui/generate-video (Lightsail)
        → ComfyUI WebSocket :8188 (5090 PC)
          → LTX 2.3 모델 추론
          → 결과 영상 → Supabase Storage
      → prompt_id 반환
    → 클라이언트 폴링 → comfyui_video_url 확인
```

### 인증 플로우
```
로그인 → Supabase Auth → JWT 발급
  → @supabase/ssr 미들웨어 쿠키 관리
  → useAuth.ts → 전역 user 상태
  → lib/utils/permissions.ts → 역할별 UI 제어
```

### 정산 데이터 플로우
```
Excel 업로드 → /api/accounting/settlement/
  → lib/settlement/excel-parser.ts (파싱)
  → lib/settlement/calculator.ts (계산)
  → Supabase DB 저장
  → useSettlementStore → Settlement 페이지 표시
```

## 주요 DB 테이블 그룹

| 그룹 | 주요 테이블 |
|------|------------|
| 웹툰 구조 | `webtoons`, `episodes`, `cuts`, `files`, `processes` |
| 사용자 | `user_profiles`, `user_roles` |
| 캐릭터 | `characters`, `character_sheets`, `character_folders` |
| 영상 생성 | `webtoon_animation_projects`, `webtoon_animation_cuts`, `webtoon_animation_video_segments` |
| 이미지 | `ai_styles`, `image_prompts`, `regenerated_images`, `reference_files` |
| 관계도 | `relationships` |
| 회계 | `transactions`, `budgets`, `categories`, `settlements`, `partners`, `staff`, `contracts` |
| 창작 | `free_creation_sessions`, `monster_styles` |
| 기타 | `announcements`, `settings` |
