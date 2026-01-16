# thegrim-cms — Stable Memory

## 1. One-liner
- 웹툰 제작 공정 관리를 위한 Admin CMS (파일 관리 + AI 이미지 분석/재생성 + 대본→콘티/영상 생성)

## 2. Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Auth**: Supabase Auth (이메일/비밀번호 + 초대 토큰 기반)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (`webtoon-files` 버킷)
- **State Management**: Zustand
- **AI**: Google Gemini API (2.5 Pro, 2.5 Flash Image, 3 Pro Preview), ByteDance Seedream API
- **Video Generation**: Google Veo 3.1 Fast Generate
- **Hosting / Deploy**: Vercel

## 3. Purpose & Scope
- **관리 대상**:
  - 웹툰/회차/컷 단위 파일 관리
  - 공정별 파일 그룹화 (글콘티, 연출아이디어, 콘티, 러프스케치, 라인, 채색)
  - 캐릭터 및 캐릭터 시트 관리
  - 레퍼런스 파일 관리
  - AI 이미지 재생성 (스타일 변환, 톤먹 넣기 등)
  - 대본→글콘티 변환 (Script-to-Storyboard)
  - 대본→쇼츠 영상 생성 (Script-to-Shorts)
  - 대본→영화 생성 (Script-to-Movie)
- **제외 범위**:
  - 실제 웹툰 콘텐츠 게시/배포 (순수 CMS)
  - 결제/구독 시스템
  - 외부 사용자용 프론트엔드

## 4. Auth & Roles
- **인증 방식**: Supabase Auth (이메일/비밀번호)
- **회원가입**: 초대 토큰 기반 (관리자가 이메일로 초대)
- **첫 사용자**: 자동으로 admin 역할 부여
- **사용자 타입 (역할)**:
  - `admin`: 모든 기능 + 사용자 관리 + 초대
  - `manager`: 콘텐츠/파일 생성/수정/삭제 + 공정 관리
  - `staff`: 조회 + 파일 업로드/다운로드 + 본인 파일 삭제
  - `viewer`: 조회 + 다운로드만 가능
- **권한 체크**: `lib/utils/permissions.ts`에서 UI 단 권한 제어
- **⚠️ 주의**: 서버 API에서 권한 검증 미구현, RLS는 개발용으로 완전 개방 상태

## 5. Data Model (Supabase)
- **주요 테이블**:
  - `webtoons` - 웹툰 (title, status, unit_type: cut/page)
  - `episodes` - 회차 (webtoon_id FK)
  - `cuts` - 컷/페이지 (episode_id FK)
  - `processes` - 공정 (name, order_index, color)
  - `files` - 파일 (cut_id, process_id, metadata JSONB, is_temp, is_public, prompt, source_file_id)
  - `user_profiles` - 사용자 프로필 (auth.users FK, role, default_ai_image_public)
  - `invitations` - 초대 토큰 (email, role, token, expires_at)
  - `characters` - 캐릭터 (webtoon_id FK, folder_id FK)
  - `character_folders` - 캐릭터 폴더
  - `character_sheets` - 캐릭터 시트 이미지
  - `reference_files` - 웹툰별 레퍼런스 파일
  - `ai_regeneration_styles` - AI 재생성 스타일 설정
  - `episode_scripts` - 회차별 대본
  - `episode_script_storyboards` - 대본별 글콘티
  - `shorts_projects`, `shorts_characters`, `shorts_scenes` - 쇼츠 영상 생성
  - `movie_projects`, `movie_characters`, `movie_backgrounds`, `movie_cuts`, `movie_scenes` - 영화 생성
  - `free_creation_sessions`, `free_creation_messages` - 자유창작 세션
  - `announcements`, `announcement_reads` - 공지사항
- **관계 요약**:
  - `webtoons` → `episodes` → `cuts` → `files` (1:N 계층 구조)
  - `files` ↔ `processes` (N:1)
  - `files` → `user_profiles` (created_by)
  - `files` → `files` (source_file_id: 원본-파생 관계)
  - `characters` → `character_sheets` (1:N)
- **RLS 핵심 규칙**:
  - ⚠️ **개발용 완전 개방**: 모든 테이블 `FOR ALL USING (true)`
  - `user_profiles`: 본인 조회/수정 + admin 전체 조회/수정
  - `invitations`: admin만 관리, 토큰 조회는 public
  - Storage (`webtoon-files` 버킷): 완전 공개 (SELECT/INSERT/UPDATE/DELETE)
- **트리거 / 함수 / Edge Function**:
  - `update_updated_at_column()` - 모든 테이블 updated_at 자동 갱신
  - `handle_new_user()` - 가입 시 user_profiles 자동 생성
  - `search_files_fulltext()` - 파일 전문 검색 (description, metadata.scene_summary, metadata.tags)
  - Edge Function: `send-invitation-email` (초대 이메일 발송)

## 6. Key Screens (Admin UI)
- **로그인**: `/login` - 이메일/비밀번호 로그인
- **회원가입**: `/signup?token={token}` - 초대 토큰 기반
- **대시보드 (메인)**: `/` → 로그인 여부에 따라 `/webtoons` 또는 `/login`으로 리다이렉트
- **웹툰별 뷰**: `/webtoons/[webtoonId]/episodes/[episodeId]/cuts/[cutId]` - 4패널 구조 (웹툰→회차→컷→파일)
- **공정별 뷰**: `/processes/[processId]` - 공정별 파일 목록
- **파일 검색**: `/search` - 파일명/설명/메타데이터 검색
- **관리자 페이지**: `/admin` - 사용자 목록, 초대 관리, 역할 변경
- **대본→콘티**: `/script-to-storyboard` - 대본 입력 → 글콘티 생성
- **대본→쇼츠**: `/script-to-shorts` - 대본 → AI 쇼츠 영상 생성
- **대본→영화**: `/script-to-movie` - 대본 → AI 영화 생성
- **자유창작**: `/free-creation` - 프롬프트 기반 AI 이미지 생성
- **AI 히스토리**: `/regenerated-images` - AI 생성 이미지 히스토리
- **캐릭터 관리**: EpisodeList 상단 "캐릭터 관리" 버튼 → CharacterManagementDialog

## 7. Local Development
- **Run**:
  ```bash
  npm install
  npm run dev
  # → http://localhost:3000
  ```
- **Required env vars** (`.env.local`):
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
  GEMINI_API_KEY=AIzaSyxxx...
  SEEDREAM_API_KEY=xxx (선택)
  SEEDREAM_API_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3 (선택)
  ```
- **Supabase**: Remote (Supabase Cloud) 사용

## 8. Deployment (Vercel)
- **배포 방식**: GitHub 저장소 연결 → Vercel 자동 배포
- **환경 변수**: Vercel Dashboard > Settings > Environment Variables에 설정
- **Preview / Prod 차이**:
  - 같은 Supabase 프로젝트 사용 (분리 안 됨)
  - Preview에서도 Production DB에 접근
- **주의사항**:
  - `.env.local`은 로컬 전용, Vercel에서는 별도 설정 필요
  - 환경 변수 변경 후 재배포 필요

## 9. Gotchas & Rules
### 자주 까먹는 규칙
- **useSearchParams() 사용 시 Suspense 필수**: `<Suspense fallback={...}>`로 감싸야 Vercel 빌드 오류 방지
- **Supabase 스키마 변경 시**: SQL 파일만 수정하지 말고 `mcp_supabase_apply_migration` 도구로 실제 DB에 적용
- **개발 문서 최신화**: 주요 기능 개발 후 `PROJECT_STRUCTURE.md`, `ARCHITECTURE.md`, `DEVELOPMENT_PLAN.md` 업데이트
- **개발 시작 전**: 관련 문서 먼저 읽고 구조 파악

### 실수하기 쉬운 포인트
- **Dialog 크기**: `sm:max-w-[90vw] w-[90vw] max-h-[85vh]` 사용 (작은 Dialog 금지)
- **RLS 완전 개방 상태**: 프로덕션 배포 전 반드시 역할별 RLS 정책 적용 필요
- **서버 API 무인증**: `app/api/**` 라우트에서 권한 검증 없음 → 프로덕션 전 추가 필요
- **세션 전달 부재**: 서버 라우트가 사용자 토큰을 Supabase에 바인딩하지 않음

### 이 프로젝트만의 암묵지
- **기본 공정 6개**: 글콘티, 연출아이디어, 콘티, 러프스케치, 라인, 채색
- **AI 이미지 재생성**: Gemini + Seedream 병렬 처리, 4개씩 배치 요청, 임시 파일(`is_temp=true`) → 정식 저장 시 `is_temp=false`
- **파일 메타데이터**: Gemini 2.5 Pro로 자동 분석 (scene_summary, tags, characters_count)
- **캐릭터 시트 경로**: `webtoon-files/characters/{characterId}/{fileName}`
- **이미지 재생성 파일 경로**: 영구 파일과 동일 경로에 저장
