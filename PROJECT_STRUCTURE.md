# 프로젝트 구조

## 📁 디렉토리 구조

\`\`\`
thegrim-CMS/
├── app/                          # Next.js App Router
│   ├── api/                     # API 라우트
│   │   ├── analyze-image/       # 이미지 분석 API
│   │   ├── generate-thumbnail/  # 썸네일 생성 API
│   │   └── regenerate-image/    # 이미지 재생성 API (Gemini/Seedream)
│   ├── admin/                   # 관리자 페이지
│   ├── login/                   # 로그인 페이지
│   ├── signup/                  # 회원가입 페이지
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
│   ├── ImageRegenerationDialog.tsx  # 이미지 재생성 스타일 선택 다이얼로그
│   ├── ProcessFileSection.tsx   # 공정별 파일 섹션 컴포넌트
│   ├── ReferenceFileDialog.tsx  # 레퍼런스 파일 관리 다이얼로그
│   ├── ReferenceFileUpload.tsx  # 레퍼런스 파일 업로드 다이얼로그
│   └── ReferenceFileList.tsx    # 레퍼런스 파일 목록 표시
│
├── lib/                          # 유틸리티 및 라이브러리
│   ├── api/                     # API 함수들
│   │   ├── webtoons.ts          # 웹툰 관련 API
│   │   ├── episodes.ts          # 회차 관련 API
│   │   ├── cuts.ts              # 컷 관련 API
│   │   ├── processes.ts         # 공정 관련 API
│   │   ├── files.ts             # 파일 관련 API
│   │   ├── referenceFiles.ts    # 레퍼런스 파일 관련 API
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
- AI 이미지 재생성 API
- Gemini API 및 Seedream API 지원
- 레퍼런스 이미지 지원 (톤먹 넣기 기능)
- 자동 이미지 리사이즈 (10MB/36M픽셀 제한 대응)
- 비율 유지 출력 지원

**analyze-image/route.ts**
- 이미지 메타데이터 자동 분석 API
- 장면 요약, 태그, 등장인물 수 추출

**generate-thumbnail/route.ts**
- 썸네일 자동 생성 API

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
- 새 웹툰 추가 버튼 (향후 구현)

**EpisodeList.tsx**
- 선택한 웹툰의 회차 목록
- 회차 선택 기능
- 새 회차 추가 버튼 (향후 구현)

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
- 재생성된 이미지 등록 시 공정 선택 기능

**ImageViewer.tsx**
- 이미지 전체화면 뷰어
- 줌 인/아웃, 드래그, 모바일 핀치 줌 지원

**ImageRegenerationDialog.tsx**
- 이미지 재생성 스타일 선택 다이얼로그
- 톤먹 넣기: 레퍼런스 이미지 선택 및 생성 장수 선택 기능
- 스타일별 다양한 워크플로우 지원 (바로 실행, 장수 선택, 레퍼런스 선택)

**ProcessFileSection.tsx**
- 공정별 파일 섹션 컴포넌트
- 드래그 앤 드롭 업로드 지원

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
- \`getFilesByCut(cutId)\`: 컷별 파일 목록 (생성자, 원본 파일 정보 포함)
- \`getFilesByProcess(processId)\`: 공정별 파일 목록 (생성자, 원본 파일 정보 포함)
- \`searchFiles(query)\`: 파일 검색 (생성자, 원본 파일 정보 포함)
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
- 재생성 API 호출, 재생성된 이미지 관리
- 레퍼런스 이미지 지원 (톤먹 넣기 기능)
- 선택된 이미지 관리, 재생성된 이미지 저장 (공정 선택 가능)
- 재생성된 이미지 저장 시 생성자(currentUserId) 및 원본 파일(sourceFileId) 자동 기록

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
  - \`File\` (created_by, source_file_id 포함)
  - \`UserProfile\` (id, email, name, role)
  - \`ReferenceFile\`
  - 관계형 타입 (FileWithRelations: created_by_user, source_file 포함)

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

## 🔐 보안 고려사항

현재 구현은 **개발 단계**용입니다:

- ❌ 인증 없음
- ❌ Row Level Security (RLS) 비활성화
- ❌ 파일 접근 제한 없음

**프로덕션 배포 전 필수 작업**:

1. ✅ Supabase Auth 통합
2. ✅ RLS 정책 활성화
3. ✅ 역할 기반 권한 관리 (관리자/작가/스태프)
4. ✅ 파일 업로드 검증 (파일 타입, 크기)
5. ✅ API Rate Limiting

## 🚀 확장 가능성

### 향후 추가 가능한 기능

**파일 관리**
- 드래그 앤 드롭 업로드
- 파일 버전 관리
- 일괄 업로드/다운로드
- 썸네일 자동 생성

**협업 기능**
- 실시간 코멘트
- 피드백 시스템
- 승인 워크플로우
- 알림 시스템

**프로젝트 관리**
- 진행률 트래킹
- 마감일 관리
- 팀원 배정
- 대시보드/통계

**고급 검색**
- 파일 타입별 필터
- 날짜 범위 필터
- 태그 시스템
- AI 기반 이미지 검색

## 📚 참고 자료

- [Next.js 문서](https://nextjs.org/docs)
- [Supabase 문서](https://supabase.com/docs)
- [shadcn/ui 문서](https://ui.shadcn.com)
- [Zustand 문서](https://zustand-demo.pmnd.rs)
- [Tailwind CSS 문서](https://tailwindcss.com/docs)


