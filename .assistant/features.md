# Feature History — thegrim-cms

> 이 문서는 완료된 기능 기준의 히스토리다.
> 진행 중이거나 폐기된 실험은 기록하지 않는다.

---

## 2025-12

### AI 이미지 재생성 워크스페이스 (2패널 UI)
- Why: 한 번에 여러 스타일을 적용해보고 비교하기 위해
- What: ImageRegenerationWorkspace 2패널 레이아웃 구현 (왼쪽: 설정, 오른쪽: 결과 누적)
- Result: ✅ 완료 - 스타일 변경하며 생성 시 결과가 계속 누적됨
- Notes: Gemini + Seedream 병렬 처리, 4개씩 배치 요청

### 캐릭터 관리 시스템
- Why: 웹툰별 캐릭터와 캐릭터 시트(이미지)를 체계적으로 관리하기 위해
- What: characters, character_sheets 테이블 + CharacterManagementDialog, CharacterSheetDialog 컴포넌트
- Result: ✅ 완료 - 캐릭터 CRUD, 시트 업로드/삭제, AI 4방향 시트 생성
- Notes: Gemini 3 Pro Image Preview 사용, 시트 경로: `webtoon-files/characters/{characterId}/`

### 레퍼런스 여러장 넣기
- Why: AI 이미지 재생성 시 여러 레퍼런스 이미지를 동시에 참조하기 위해
- What: ImageRegenerationWorkspace에서 복수 레퍼런스 이미지 선택 기능
- Result: ✅ 완료 - 톤먹 넣기 등 스타일에 여러 레퍼런스 적용 가능
- Notes: Gemini API 전용 기능

### 괴수생성기 (Monster Generator)
- Why: 특정 스타일(히간지마 등)의 괴수 이미지를 생성하기 위해
- What: MonsterGenerator 컴포넌트 + generate-monster-image API
- Result: ✅ 완료 - 스타일/플랫폼 선택 후 괴수 이미지 생성
- Notes: 레퍼런스 이미지 지원, FileGrid에서 접근 가능

### 파일 상세 페이지 URL 라우팅
- Why: 파일 상세보기에서 새로고침/뒤로가기가 작동하도록
- What: Dialog를 페이지로 변경, URL에 파일 ID 포함
- Result: ✅ 완료 - `/files/[fileId]` 라우트로 접근 가능, 히스토리 관리 가능
- Notes: 기존 Dialog 방식도 유지

### 캐릭터 자세 만들기 (3D Viewer)
- Why: 캐릭터 이미지를 다른 자세로 변환하기 위해
- What: 3D viewer 페이지 + convert-3d-character API
- Result: ✅ 완료 - 공정 선택 후 자세 변환 이미지 생성
- Notes: `/3d-viewer` 경로

### 대본→글콘티 (Script-to-Storyboard)
- Why: 대본 텍스트를 컷별 글콘티로 자동 변환하기 위해
- What: ScriptToStoryboard 컴포넌트 + episode_scripts, episode_script_storyboards 테이블
- Result: ✅ 완료 - 대본 입력 → 컷별 글콘티 생성 → DB 저장
- Notes: Gemini 3 Pro Preview 사용, 대본 여러 개 관리/정렬/삭제 가능

### 공지사항 시스템
- Why: 관리자가 사용자들에게 공지사항을 전달하기 위해
- What: announcements, announcement_reads 테이블 + AnnouncementEditor, AnnouncementModal 컴포넌트
- Result: ✅ 완료 - 공지사항 생성/수정/삭제, 읽음 처리
- Notes: 관리자만 생성 가능

### 이미지 생성 모델 전역 선택
- Why: AI 이미지 생성 시 사용할 모델을 전역적으로 선택하기 위해
- What: 전역 상태에 모델 선택 옵션 추가
- Result: ✅ 완료 - Gemini/Seedream 중 선택 가능
- Notes: useStore에서 관리

### 대본→쇼츠 영상 (Script-to-Shorts)
- Why: 대본을 입력받아 AI로 쇼츠 영상을 자동 생성하기 위해
- What: shorts_projects, shorts_characters, shorts_scenes 테이블 + 쇼츠 생성 UI
- Result: ✅ 완료 - 대본 → 캐릭터 설정 → 컷 분석 → 그리드 이미지 → 영상 생성
- Notes: Veo 3 API 연동, 2x2/3x3 그리드 지원, 컷to컷/컷별 영상 모드

### 인증 개선 (세션 안정화)
- Why: 세션 관리가 불안정하여 로그아웃/재로그인 이슈 발생
- What: Supabase 클라이언트 타임아웃 30초로 완화, 세션 재사용 최적화
- Result: ✅ 완료 - 세션 안정화, 중복 API 호출 75% 감소
- Notes: `lib/supabase.ts` 설정 변경

### 캐릭터 관리 폴더 기능
- Why: 캐릭터가 많아지면 폴더로 분류하여 관리하기 위해
- What: character_folders 테이블 + 폴더 UI (왼쪽 사이드바)
- Result: ✅ 완료 - 폴더 생성/수정/삭제, 드래그 앤 드롭으로 캐릭터 이동
- Notes: 폴더별 캐릭터 수 표시

### 파생 이미지 조회 기능
- Why: 원본 이미지에서 AI로 생성된 파생 이미지들을 확인하기 위해
- What: `/api/files/[fileId]/derived` API + DerivedImagesDialog 컴포넌트
- Result: ✅ 완료 - 원본 이미지 → 해당 원본으로 생성된 AI 이미지 목록 조회
- Notes: source_file_id FK 활용

### AI 이미지 공개/비공개 설정
- Why: AI 생성 이미지의 히스토리 가시성을 제어하기 위해
- What: files 테이블에 is_public 컬럼 추가, user_profiles에 default_ai_image_public 추가
- Result: ✅ 완료 - 비공개 이미지는 본인만 히스토리에서 조회 가능
- Notes: 기본값은 공개(true)

### 파일그리드 페이지네이션
- Why: 파일이 많을 때 성능 문제 및 스크롤 불편함 해소
- What: FileGrid에 페이지네이션 적용
- Result: ✅ 완료 - 페이지별로 파일 로드
- Notes: 성능 최적화 효과

### 비밀번호 재설정
- Why: 사용자가 비밀번호를 분실했을 때 재설정하기 위해
- What: `/forgot-password`, `/reset-password` 페이지 + Supabase Auth 연동
- Result: ✅ 완료 - 이메일로 재설정 링크 발송, 새 비밀번호 설정
- Notes: Supabase Auth 내장 기능 활용

---

## 2026-01

### 대본→영화 (Script-to-Movie)
- Why: 대본을 입력받아 AI로 영화(긴 영상)를 생성하기 위해
- What: movie_projects, movie_characters, movie_backgrounds, movie_cuts, movie_scenes 테이블 + 영화 생성 UI
- Result: ✅ 완료 - 대본 → 캐릭터/배경 설정 → 컷별 이미지 → 영상 생성
- Notes: 쇼츠보다 긴 영상 지원, 컷별 카메라 앵글/샷 사이즈 설정 가능

### 괴수생성기 V2 (다중 스타일)
- Why: 괴수 이미지를 다양한 스타일로 생성하기 위해
- What: MonsterGeneratorV2 컴포넌트 + 스타일 선택 UI 개선
- Result: ✅ 완료 - 히간지마 스타일 외 추가 스타일 지원, 저장 로직 수정
- Notes: 2026-01-03 ~ 2026-01-13 여러 커밋으로 개선

### 컷설명 바로 넣기
- Why: 글콘티 결과를 바로 컷 목록에 반영하기 위해
- What: 대본to콘티 결과에서 컷 설명을 직접 DB에 저장하는 기능
- Result: ✅ 완료 - 글콘티 생성 후 컷목록에 바로 반영
- Notes: 2026-01-09, 2026-01-13 커밋

### 자유창작 기능 (Free Creation)
- Why: 프롬프트 기반으로 자유롭게 AI 이미지를 생성하기 위해
- What: free_creation_sessions, free_creation_messages 테이블 + FreeCreationPlayground UI
- Result: ✅ 완료 - 세션 기반 대화형 이미지 생성, 레퍼런스 이미지 지원
- Notes: `/free-creation` 경로, 2026-01-14 커밋

### ComfyUI 연동 (야콘티 그리기)
- Why: 로컬 ComfyUI를 활용하여 대본to콘티에서 이미지를 생성하기 위해
- What: comfyui API 연동 + 대본to콘티에 ComfyUI 이미지 생성 통합
- Result: ✅ 완료 - 로컬 ComfyUI로 야콘티(스타일 콘티 이미지) 생성
- Notes: `/comfy-test` 테스트 페이지 포함, 2026-01-14 커밋

### 캐릭터 자세바꾸기 프롬프트 개선
- Why: 3D 캐릭터 자세 변환의 품질 향상을 위해
- What: convert-3d-character API의 프롬프트 수정
- Result: ✅ 완료 - 더 자연스러운 자세 변환 결과
- Notes: 2026-01-15 커밋
