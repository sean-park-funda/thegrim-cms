# 프로젝트 구조

> **역할**: 프로젝트의 정적 구조 및 아키텍처 참조 문서  
> **대상**: 새로운 팀원, 코드 리뷰어, 유지보수 담당자  
> **목적**: 프로젝트의 디렉토리 구조, 주요 파일 역할, 데이터 흐름을 빠르게 파악하기 위한 문서

## 📁 디렉토리 구조

\`\`\`
thegrim-CMS/
├── app/                          # Next.js App Router
│   ├── api/                     # API 라우트
│   │   ├── analyze-image/       # 이미지 분석 API
│   │   ├── generate-character-sheet/  # 캐릭터 시트 AI 생성 API (Gemini)
│   │   ├── generate-thumbnail/  # 썸네일 생성 API
│   │   ├── regenerate-image/    # 이미지 재생성 API (Gemini/Seedream)
│   │   ├── script-to-storyboard/  # 대본to글콘티 API (Gemini 3 Pro Preview)
│   │   ├── episode-scripts/          # 회차별 대본 CRUD, 정렬 API
│   │   └── episode-scripts/[scriptId]/storyboards/  # 대본별 글콘티 생성/조회 API
│   ├── admin/                   # 관리자 페이지
│   ├── login/                   # 로그인 페이지
│   ├── signup/                  # 회원가입 페이지
│   ├── script-to-storyboard/   # 대본to글콘티 페이지
│   ├── favicon.ico              # 파비콘
│   ├── globals.css              # 전역 스타일
│   ├── layout.tsx               # 루트 레이아웃
│   └── page.tsx                 # 메인 페이지
│
├── components/                   # React 컴포넌트
│   ├── ui/                      # shadcn/ui 기본 컴포넌트
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── scroll-area.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   └── tabs.tsx
│   │
│   ├── Navigation.tsx           # 상단 네비게이션 바
│   ├── WebtoonView.tsx          # 웹툰별 뷰 컨테이너
│   ├── ProcessView.tsx          # 공정별 뷰 컨테이너
│   ├── SearchResults.tsx        # 검색 결과 표시
│   ├── WebtoonList.tsx          # 웹툰 목록
│   ├── EpisodeList.tsx          # 회차 목록
│   ├── CutList.tsx              # 컷 목록
│   ├── FileGrid.tsx             # 파일 그리드 (메인 컴포넌트, 리팩토링됨)
│   ├── FileCard.tsx             # 파일 카드 컴포넌트
│   ├── FileDeleteDialog.tsx     # 파일 삭제 확인 다이얼로그
│   ├── FileEditDialog.tsx       # 파일 정보 수정 다이얼로그
│   ├── FileDetailDialog.tsx     # 파일 상세 정보 다이얼로그
│   ├── ImageViewer.tsx          # 이미지 전체화면 뷰어
│   ├── ImageRegenerationWorkspace.tsx  # AI 다시그리기 통합 작업 공간 (2패널 레이아웃)
│   ├── StyleManagementDialog.tsx    # 스타일 관리 다이얼로그 (생성/수정/삭제)
│   ├── StyleEditDialog.tsx          # 스타일 편집 폼 다이얼로그
│   ├── ProcessFileSection.tsx   # 공정별 파일 섹션 컴포넌트
│   ├── ReferenceFileDialog.tsx  # 레퍼런스 파일 관리 다이얼로그
│   ├── ReferenceFileUpload.tsx  # 레퍼런스 파일 업로드 다이얼로그
│   ├── ReferenceFileList.tsx    # 레퍼런스 파일 목록 표시
│   ├── CharacterManagementDialog.tsx  # 캐릭터 관리 메인 다이얼로그
│   ├── CharacterEditDialog.tsx        # 캐릭터 추가/수정 폼
│   ├── CharacterSheetDialog.tsx       # 캐릭터 시트 관리 (업로드/AI생성)
│   └── ScriptToStoryboard.tsx        # 대본to글콘티 컴포넌트 (대본 리스트/정렬/삭제/글콘티 생성)
│
├── lib/                          # 유틸리티 및 라이브러리
│   ├── api/                     # API 함수들
│   │   ├── webtoons.ts          # 웹툰 관련 API
│   │   ├── episodes.ts          # 회차 관련 API
│   │   ├── cuts.ts              # 컷 관련 API
│   │   ├── processes.ts         # 공정 관련 API
│   │   ├── files.ts             # 파일 관련 API
│   │   ├── referenceFiles.ts    # 레퍼런스 파일 관련 API
│   │   ├── characters.ts        # 캐릭터 관련 API
│   │   ├── characterSheets.ts   # 캐릭터 시트 관련 API
│   │   ├── aiStyles.ts          # AI 재생성 스타일 관련 API
│   │   ├── auth.ts              # 인증 관련 API
│   │   └── admin.ts             # 관리자 유틸리티
│   │
│   ├── constants/               # 상수 정의
│   │   └── imageRegeneration.ts # 이미지 재생성 관련 상수
│   │
│   ├── hooks/                   # 커스텀 훅
│   │   ├── useAuth.ts           # 인증 상태 관리 훅
│   │   ├── useFileGrid.ts       # 파일 그리드 로직 훅
│   │   ├── useImageRegeneration.ts  # 이미지 재생성 로직 훅
│   │   └── useImageViewer.ts    # 이미지 뷰어 로직 훅
│   │
│   ├── store/                   # 상태 관리
│   │   └── useStore.ts          # Zustand 스토어
│   │
│   ├── utils/                   # 유틸리티 함수
│   │   └── permissions.ts       # 권한 체크 유틸리티
│   │
│   ├── supabase.ts              # Supabase 클라이언트 및 타입
│   └── utils.ts                 # 유틸리티 함수
│
├── public/                       # 정적 파일
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
│
├── .env.local                    # 환경 변수 (생성 필요)
├── components.json               # shadcn/ui 설정
├── eslint.config.mjs            # ESLint 설정
├── next.config.ts               # Next.js 설정
├── package.json                 # 프로젝트 의존성
├── postcss.config.mjs           # PostCSS 설정
├── tsconfig.json                # TypeScript 설정
├── supabase-schema.sql          # 데이터베이스 스키마
├── README.md                    # 프로젝트 소개
├── SETUP_GUIDE.md               # 설정 가이드
└── PROJECT_STRUCTURE.md         # 이 파일
\`\`\`

## 🔧 주요 파일 설명

### App Router (\`app/\`)

#### \`page.tsx\`
- 메인 페이지 컴포넌트
- 뷰 모드(웹툰별/공정별)와 검색 상태에 따라 다른 컴포넌트 렌더링
- WebtoonView, ProcessView, SearchResults 중 하나 표시

#### \`layout.tsx\`
- 전체 앱의 루트 레이아웃
- HTML 구조 및 메타데이터 정의

#### \`globals.css\`
- Tailwind CSS 설정
- 전역 스타일 및 CSS 변수

### API 라우트 (\`app/api/\`)

**regenerate-image/route.ts**
- 단일 이미지 재생성 API
- Gemini API 및 Seedream API 지원
- 레퍼런스 이미지 지원 (톤먹 넣기 기능)
- 자동 이미지 리사이즈 (10MB/36M픽셀 제한 대응)
- 비율 유지 출력 지원

**regenerate-image-batch/route.ts**
- 배치 이미지 재생성 API
- 여러 이미지를 한 번에 생성
- Gemini와 Seedream 병렬 처리 (각각 최대 2개씩 동시 호출)
- 임시 파일 저장 (is_temp = true)
- 영구 파일과 같은 경로에 저장: `{cutId}/{processId}/{fileName}-{uuid}.{ext}`

**regenerate-image-save/route.ts**
- 임시 파일을 영구 파일로 전환 API
- DB에서 `is_temp = false`로 업데이트만 수행 (파일 이동 불필요)
- 파일명, 설명, 공정 ID 변경 가능

**regenerate-image-history/route.ts**
- 임시 파일 히스토리 조회 API
- DB에서 `is_temp = true`인 파일만 조회
- 최신순으로 정렬하여 반환

**analyze-image/route.ts**
- 이미지 메타데이터 자동 분석 API
- 장면 요약, 태그, 등장인물 수 추출

**generate-thumbnail/route.ts**
- 썸네일 자동 생성 API

**script-to-storyboard/route.ts**
- 대본to글콘티 API
- Gemini 3 Pro Preview 모델 사용
- 대본 텍스트를 받아 컷별 글콘티 생성
- JSON 형식 응답 반환 (컷 번호, 제목, 설명, 대사/내레이션)

### 컴포넌트 (\`components/\`)

#### 레이아웃 컴포넌트

**Navigation.tsx**
- 상단 네비게이션 바
- 뷰 모드 전환 버튼 (웹툰별/공정별)
- 검색 입력 필드

**WebtoonView.tsx**
- 웹툰별 뷰 컨테이너
- 4개의 패널로 구성: 웹툰 → 회차 → 컷 → 파일

**ProcessView.tsx**
- 공정별 뷰 컨테이너
- 2개의 패널: 공정 목록 + 선택한 공정의 파일들

#### 데이터 표시 컴포넌트

**WebtoonList.tsx**
- 웹툰 목록 표시
- 웹툰 선택 기능
- 새 웹툰 추가 버튼

**EpisodeList.tsx**
- 선택한 웹툰의 회차 목록
- 회차 선택 기능
- 새 회차 추가 버튼

**CutList.tsx**
- 선택한 회차의 컷/페이지 목록
- 컷 선택 기능
- 새 컷 추가 버튼 (상단 고정)
- 컴팩트한 레이아웃으로 최적화 (작은 폰트, 최소 여백)
- 스크롤 가능한 목록 영역

**FileGrid.tsx**
- 선택한 컷의 파일을 공정별로 그룹화하여 표시
- 공정 탭 선택 상태 유지 (전역 상태 관리)
- 이미지 미리보기
- 파일 다운로드/삭제/수정 기능
- AI 이미지 분석 및 재생성 기능
- 파일 업로드 기능:
  - 드래그 앤 드롭 업로드
  - 파일 선택 다이얼로그 업로드
  - 클립보드 붙여넣기 업로드 (Ctrl+V / Cmd+V)
- **리팩토링됨**: 여러 작은 컴포넌트와 커스텀 훅으로 분리 (1842줄 → 488줄)

**FileCard.tsx**
- 개별 파일 카드 컴포넌트
- 썸네일 표시, 메타데이터 표시
- 다운로드/분석/수정/삭제 버튼

**FileDeleteDialog.tsx**
- 파일 삭제 확인 다이얼로그

**FileEditDialog.tsx**
- 파일 정보 수정 다이얼로그

**FileDetailDialog.tsx**
- 파일 상세 정보 다이얼로그
- 파일 미리보기, 기본 정보, 메타데이터 표시
- 생성자 정보 표시 (이름 + 이메일)
- 원본 파일 정보 표시 (AI 재생성 파일인 경우 썸네일과 함께 표시)
- 원본 파일 클릭 시 해당 파일 상세 다이얼로그로 이동
- 재생성된 이미지 관리
  - 재생성된 이미지 선택 및 일괄 저장 기능
  - 재생성된 이미지 저장 시 공정 선택 기능
  - 히스토리 탭: 임시 파일 히스토리 조회 및 표시
- 점진적 로딩: 배치별로 완료된 이미지 즉시 표시

**ImageViewer.tsx**
- 이미지 전체화면 뷰어
- 줌 인/아웃, 드래그, 모바일 핀치 줌 지원

**ImageRegenerationWorkspace.tsx**
- AI 다시그리기 통합 작업 공간 (2패널 레이아웃)
- **왼쪽 패널 (30%)**: 원본 이미지 미리보기, 스타일 선택, 참조 이미지, 생성 장수, 프롬프트 편집
- **오른쪽 패널 (70%)**: 생성된 이미지 그리드, 선택/저장 기능
- 설정을 바꿔가며 생성할 때마다 결과가 계속 누적됨 (여러 스타일 비교 가능)
- 톤먹 넣기: 레퍼런스 이미지 선택 기능

**ProcessFileSection.tsx**
- 공정별 파일 섹션 컴포넌트
- 드래그 앤 드롭 업로드 지원
- 파일 선택 다이얼로그 업로드 지원
- 업로드 진행률 표시

**ReferenceFileDialog.tsx**
- 레퍼런스 파일 관리 메인 다이얼로그
- 공정별 탭으로 레퍼런스 파일 필터링
- 파일 업로드 및 목록 표시 통합

**ReferenceFileUpload.tsx**
- 레퍼런스 파일 업로드 다이얼로그
- 드래그 앤 드롭 파일 선택 지원
- 공정 선택 및 설명 입력

**ReferenceFileList.tsx**
- 레퍼런스 파일 목록 표시
- 공정별 그룹화
- 파일 미리보기, 다운로드, 삭제 기능
- 이미지 클릭 시 전체화면 뷰어로 확대 보기

**CharacterManagementDialog.tsx**
- 캐릭터 관리 메인 다이얼로그
- 웹툰별 캐릭터 목록 표시
- 캐릭터 추가/수정/삭제 기능
- 캐릭터 카드 (첫 번째 시트 이미지 썸네일)

**CharacterEditDialog.tsx**
- 캐릭터 추가/수정 폼
- 이름 및 설명 입력

**CharacterSheetDialog.tsx**
- 캐릭터 시트 관리 다이얼로그
- 탭 UI: 시트 목록 / 직접 업로드 / AI 생성
- Gemini API를 사용한 4방향 캐릭터 시트 자동 생성
- 이미지 업로드 및 저장 기능

**ScriptToStoryboard.tsx**
- 대본to글콘티 컴포넌트
- 대본 텍스트 입력 및 글콘티 생성
- Gemini 3 Pro Preview API 호출
- 컷별 카드 형태로 결과 표시 (컷 번호, 제목, 연출/구도, 대사/내레이션)

**SearchResults.tsx**
- 검색 결과 표시
- 파일 정보와 함께 웹툰/회차/컷 정보 표시
- 이미지 미리보기

### API 계층 (\`lib/api/\`)

각 파일은 Supabase와의 CRUD 작업을 처리하는 함수들을 포함합니다.

**webtoons.ts**
- \`getWebtoons()\`: 웹툰 목록 조회
- \`getWebtoonWithEpisodes(id)\`: 웹툰 상세 (회차 포함)
- \`createWebtoon(data)\`: 웹툰 생성
- \`updateWebtoon(id, data)\`: 웹툰 수정
- \`deleteWebtoon(id)\`: 웹툰 삭제

**episodes.ts**
- \`getEpisodes(webtoonId)\`: 회차 목록
- \`getEpisodeWithCuts(id)\`: 회차 상세 (컷 포함)
- \`createEpisode(data)\`: 회차 생성
- \`updateEpisode(id, data)\`: 회차 수정
- \`deleteEpisode(id)\`: 회차 삭제

**cuts.ts**
- \`getCuts(episodeId)\`: 컷 목록
- \`getCutWithFiles(id)\`: 컷 상세 (파일 포함)
- \`createCut(data)\`: 컷 생성
- \`updateCut(id, data)\`: 컷 수정
- \`deleteCut(id)\`: 컷 삭제

**processes.ts**
- \`getProcesses()\`: 공정 목록
- \`createProcess(data)\`: 공정 생성
- \`updateProcess(id, data)\`: 공정 수정
- \`deleteProcess(id)\`: 공정 삭제
- \`reorderProcesses(ids)\`: 공정 순서 변경

**files.ts**
- \`getFilesByCut(cutId)\`: 컷별 파일 목록 (생성자, 원본 파일 정보 포함, is_temp = false만 조회)
- \`getFilesByProcess(processId)\`: 공정별 파일 목록 (생성자, 원본 파일 정보 포함, is_temp = false만 조회)
- \`searchFiles(query)\`: 파일 검색 (생성자, 원본 파일 정보 포함, is_temp = false만 조회)
- \`createFile(data)\`: 파일 메타데이터 생성
- \`updateFile(id, data)\`: 파일 정보 수정
- \`deleteFile(id)\`: 파일 삭제 (Storage + DB)
- \`uploadFile(file, cutId, processId, description, createdBy, sourceFileId)\`: 파일 업로드 (생성자 및 원본 파일 추적)
- \`analyzeImage(fileId)\`: 이미지 메타데이터 자동 생성
- \`generateThumbnail(fileId)\`: 썸네일 생성
- \`getThumbnailUrl(file)\`: 썸네일 URL 가져오기 (없으면 생성)

**referenceFiles.ts**
- \`getReferenceFilesByWebtoon(webtoonId)\`: 웹툰의 레퍼런스 파일 목록
- \`getReferenceFilesByProcess(webtoonId, processId)\`: 특정 공정의 레퍼런스 파일 목록
- \`uploadReferenceFile(file, webtoonId, processId, description)\`: 레퍼런스 파일 업로드
- \`deleteReferenceFile(id)\`: 레퍼런스 파일 삭제 (Storage + DB)
- \`updateReferenceFile(id, updates)\`: 레퍼런스 파일 정보 수정
- \`getReferenceFileThumbnailUrl(file)\`: 레퍼런스 파일 썸네일 URL 가져오기

**characters.ts**
- \`getCharactersByWebtoon(webtoonId)\`: 웹툰의 캐릭터 목록 (시트 포함)
- \`getCharacterWithSheets(characterId)\`: 캐릭터 상세 (시트 포함)
- \`createCharacter(data)\`: 캐릭터 생성
- \`updateCharacter(id, data)\`: 캐릭터 수정
- \`deleteCharacter(id)\`: 캐릭터 삭제 (시트 파일 포함)

**characterSheets.ts**
- \`getSheetsByCharacter(characterId)\`: 캐릭터의 시트 목록
- \`getCharacterSheet(sheetId)\`: 캐릭터 시트 상세
- \`uploadCharacterSheet(file, characterId, description)\`: 캐릭터 시트 업로드
- \`saveCharacterSheetFromBase64(imageData, mimeType, characterId, fileName, description)\`: base64 이미지로 시트 저장
- \`updateCharacterSheet(sheetId, data)\`: 캐릭터 시트 수정
- \`deleteCharacterSheet(sheetId)\`: 캐릭터 시트 삭제 (Storage + DB)
- \`getSheetThumbnailUrl(sheet)\`: 캐릭터 시트 썸네일 URL 가져오기


### 상태 관리 (\`lib/store/\`)

**useStore.ts**
- Zustand 기반 전역 상태 관리
- 선택된 항목 (웹툰, 회차, 컷, 공정)
- 뷰 모드 (웹툰별/공정별)
- 검색 쿼리 및 결과
- 캐시된 데이터 (웹툰 목록, 공정 목록)
- 사용자 프로필 및 권한 정보

### 커스텀 훅 (\`lib/hooks/\`)

**useAuth.ts**
- 인증 상태 관리
- 세션 자동 감지 및 관리
- 로그인/로그아웃 처리

**useFileGrid.ts**
- 파일 그리드 관련 상태 및 로직
- 파일 목록 로드, 썸네일 URL 관리
- 이미지 에러 처리, 공정별 파일 필터링

**useImageRegeneration.ts**
- 이미지 재생성 관련 상태 및 로직
- 배치 재생성 API 호출 (4개씩 배치로 나누어 요청)
- 재생성된 이미지 관리 (임시 파일 정보 포함)
- 레퍼런스 이미지 지원 (톤먹 넣기 기능)
- 선택된 이미지 관리, 재생성된 이미지 저장 (공정 선택 가능)
- 재생성된 이미지 저장 시 생성자(currentUserId) 및 원본 파일(sourceFileId) 자동 기록
- 점진적 UI 업데이트: 각 배치 완료 시 즉시 이미지 표시
- 임시 파일 저장 및 정식 저장 처리

**useImageViewer.ts**
- 이미지 뷰어 관련 상태 및 로직
- 이미지 줌 관리 (25% ~ 400%)
- 이미지 위치 관리 (드래그)
- 터치 이벤트 처리 (핀치 줌, 드래그)

### 상수 정의 (\`lib/constants/\`)

**imageRegeneration.ts**
- 이미지 재생성 관련 상수
- 스타일 옵션 (괴수디테일, 채색 빼기, 배경 지우기, 극적 명암, 만화풍 명암, 선화만 남기기, 톤먹 넣기)
- 톤먹 넣기: 레퍼런스 이미지 기반 톤/명암 적용 (Gemini API 전용)
- 프롬프트 변형 생성 함수

### Supabase 연동 (\`lib/supabase.ts\`)

- Supabase 클라이언트 생성
- TypeScript 타입 정의:
  - \`Webtoon\`
  - \`Episode\`
  - \`Cut\`
  - \`Process\`
  - \`File\` (created_by, source_file_id, is_temp 포함)
  - \`UserProfile\` (id, email, name, role)
  - \`ReferenceFile\`
  - \`Character\` (웹툰별 캐릭터)
  - \`CharacterSheet\` (캐릭터 시트 이미지)
  - 관계형 타입 (FileWithRelations, CharacterWithSheets 등)

## 📊 데이터 흐름

### 웹툰별 뷰

\`\`\`
1. 사용자가 웹툰 선택
   └─> useStore에 selectedWebtoon 저장
       └─> EpisodeList가 리렌더링
           └─> getEpisodes(webtoonId) 호출
               └─> 회차 목록 표시

2. 사용자가 회차 선택
   └─> useStore에 selectedEpisode 저장
       └─> CutList가 리렌더링
           └─> getCuts(episodeId) 호출
               └─> 컷 목록 표시

3. 사용자가 컷 선택
   └─> useStore에 selectedCut 저장
       └─> FileGrid가 리렌더링
           └─> getFilesByCut(cutId) 호출
               └─> 공정별 파일 표시
\`\`\`

### 공정별 뷰

\`\`\`
1. 사용자가 공정 선택
   └─> useStore에 selectedProcess 저장
       └─> ProcessView가 리렌더링
           └─> getFilesByProcess(processId) 호출
               └─> 해당 공정의 모든 파일 표시
\`\`\`

### 검색

\`\`\`
1. 사용자가 검색어 입력
   └─> useStore의 searchQuery 업데이트
       └─> SearchResults 컴포넌트 활성화
           └─> searchFiles(query) 호출
               └─> 검색 결과 표시
\`\`\`

## 🎨 스타일링

- **Tailwind CSS**: 유틸리티 기반 스타일링
- **shadcn/ui**: 재사용 가능한 UI 컴포넌트
- **CSS Variables**: 다크모드 및 테마 지원 준비
- **Lucide Icons**: 일관된 아이콘 시스템

## 🛠️ 기술 스택

- **프레임워크**: Next.js 16 (App Router)
- **언어**: TypeScript
- **스타일링**: Tailwind CSS
- **UI 컴포넌트**: shadcn/ui
- **상태 관리**: Zustand
- **데이터베이스**: Supabase (PostgreSQL)
- **스토리지**: Supabase Storage
- **인증**: Supabase Auth
- **AI**: Google Gemini API (2.5 Pro, 2.5 Flash Image)
- **아이콘**: Lucide Icons

## 📖 관련 문서

- [README.md](./README.md) - 프로젝트 개요 및 빠른 시작 가이드
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) - 개발 진행 상황 및 계획
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 주요 시스템 상세 설계
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - 환경 설정 가이드


