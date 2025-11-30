# 시스템 아키텍처 및 상세 설계

> **역할**: 주요 시스템의 상세 설계 문서  
> **대상**: 개발자, 아키텍트  
> **목적**: 주요 시스템의 구현 세부사항, 아키텍처 결정, 기술 스택을 이해하기 위한 문서

## 📖 관련 문서

- [README.md](./README.md) - 프로젝트 개요 및 빠른 시작 가이드
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - 프로젝트 구조 및 아키텍처
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) - 개발 진행 상황 및 계획
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - 환경 설정 가이드

---

## 🔐 인증 시스템 상세 설계 (✅ 구현 완료)

### 구현된 기능

#### 1. 사용자 인증
- **로그인**: `app/login/page.tsx` - 이메일/비밀번호 로그인
- **회원가입**: `app/signup/page.tsx` - 초대 토큰 기반 회원가입, 첫 사용자 자동 관리자
- **로그아웃**: Navigation 컴포넌트에서 로그아웃 버튼
- **세션 관리**: `lib/hooks/useAuth.ts` - 인증 상태 자동 감지 및 관리

#### 2. 관리자 초대 시스템
- **초대 생성**: `lib/api/auth.ts` - `createInvitation()` 함수
- **이메일 발송**: Edge Function 연동 (`send-invitation-email`)
- **초대 토큰**: UUID 기반, 7일 만료
- **초대 관리**: `app/admin/page.tsx` - 초대 목록 조회, 링크 복사

#### 3. 권한 관리
- **권한 체크**: `lib/utils/permissions.ts` - 모든 권한 체크 함수 구현
- **UI 적용**: 모든 컴포넌트에 권한별 버튼 표시/숨김 적용
  - `WebtoonList.tsx`, `EpisodeList.tsx`, `CutList.tsx`
  - `FileGrid.tsx`, `ProcessView.tsx`
- **관리자 페이지**: `/admin` - 사용자 관리, 초대 관리

#### 4. 데이터베이스 스키마
- **파일**: `supabase-auth-schema.sql`
- **테이블**: `user_profiles`, `invitations`
- **트리거**: 자동 프로필 생성 (`handle_new_user`)
- **RLS 정책**: `user_profiles`, `invitations` 테이블 보안 정책 적용

### 사용자 역할 정의

1. **admin (관리자)**
   - 모든 기능 접근 가능
   - 사용자 관리 (초대, 권한 변경)
   - 관리자 페이지 접근 (`/admin`)

2. **manager (매니저)**
   - 웹툰/회차/컷 생성/수정/삭제
   - 파일 업로드/다운로드/삭제
   - 공정 관리
   - 사용자 초대 불가

3. **staff (스태프)**
   - 웹툰/회차/컷 조회
   - 파일 업로드/다운로드
   - 자신이 업로드한 파일만 삭제 가능
   - 생성/수정/삭제 제한

4. **viewer (조회자)**
   - 모든 데이터 조회만 가능
   - 파일 다운로드 가능
   - 생성/수정/삭제 불가

### 초대 프로세스 (✅ 구현 완료)

1. **관리자가 초대 발송**
   - 관리자 페이지 (`/admin`) 접근
   - 이메일 주소 입력, 역할 선택
   - 초대 토큰 자동 생성 (UUID, 만료 시간 7일)
   - 이메일 자동 발송 (Edge Function)

2. **초대 수신자가 회원가입**
   - 초대 링크 클릭: `/signup?token={토큰}`
   - 토큰 자동 검증
   - 이메일, 비밀번호 입력
   - 계정 생성 및 역할 자동 부여
   - 로그인 페이지로 리다이렉트

3. **초대 관리**
   - 초대 목록 조회 (발송자, 수신자, 상태, 만료일)
   - 초대 링크 복사 기능
   - 초대 상태 확인 (대기중/사용됨/만료됨)

### 주요 파일 구조

```
lib/
├── api/
│   ├── auth.ts          # 인증 API (로그인, 회원가입, 초대 등)
│   ├── admin.ts         # 관리자 유틸리티
│   └── files.ts         # 파일 API (업로드, 다운로드, 삭제, 분석)
├── hooks/
│   └── useAuth.ts       # 인증 상태 관리 훅
└── utils/
    └── permissions.ts   # 권한 체크 유틸리티

app/
├── api/
│   └── analyze-image/
│       └── route.ts     # Gemini API 이미지 분석 엔드포인트
├── login/
│   └── page.tsx         # 로그인 페이지
├── signup/
│   └── page.tsx         # 회원가입 페이지
└── admin/
    └── page.tsx         # 관리자 페이지

components/
└── FileGrid.tsx         # 파일 그리드 (업로드, 메타데이터 표시, 상세 정보)

supabase-auth-schema.sql  # 인증 스키마
supabase-rls-policies.sql  # RLS 정책 (개발용)
supabase-schema.sql        # 데이터베이스 스키마 (메타데이터 검색 함수 포함)
```

### 프로덕션 배포 전 필수 작업

1. **프로덕션용 RLS 정책 설정**
   - 웹툰/회차/컷/파일/공정 테이블 역할별 접근 권한 정의
   - Storage 버킷 역할별 접근 권한 설정

2. **비밀번호 재설정 기능**
   - Supabase Auth의 비밀번호 재설정 기능 연동

3. **API 엔드포인트 권한 검증**
   - 서버 사이드 권한 검증 추가 (현재는 클라이언트 사이드만)

---

## 🤖 이미지 메타데이터 자동 생성 시스템 (✅ 구현 완료)

### 개요
Gemini 2.5 Pro API를 활용하여 웹툰 장면 이미지의 메타데이터를 자동으로 생성하고 검색에 활용하는 시스템입니다.

### 구현된 기능

#### 1. 이미지 분석 API
- **파일**: `app/api/analyze-image/route.ts`
- **기능**: 
  - Gemini 2.5 Pro API를 통한 이미지 분석
  - 장면 요약, 태그, 등장 인물 수 추출
  - JSON 형식 응답 반환
- **프롬프트**: 웹툰 장면 분석에 특화된 프롬프트 사용
- **에러 처리**: 상세한 디버깅 로그 및 에러 메시지

#### 2. 자동 분석 기능
- **파일**: `lib/api/files.ts`
- **기능**:
  - 이미지 업로드 시 자동으로 분석 시작 (비동기)
  - 이미지 URL 접근 가능 여부 확인 및 재시도 로직
  - 분석 결과를 `metadata` JSONB 필드에 저장
- **메타데이터 구조**:
  ```json
  {
    "scene_summary": "한 문장으로 된 장면 요약",
    "tags": ["태그1", "태그2", "태그3"],
    "characters_count": 2,
    "analyzed_at": "2025-01-08T12:00:00.000Z"
  }
  ```

#### 3. 수동 분석/재분석 기능
- **파일**: `components/FileGrid.tsx`
- **기능**:
  - 파일 그리드에서 Sparkles 아이콘 버튼 클릭
  - 메타데이터가 없으면 "분석" 버튼 표시
  - 메타데이터가 있으면 "재분석" 버튼 표시
  - 분석 중 로딩 상태 표시

#### 4. 메타데이터 자동 업데이트
- **파일**: `components/FileGrid.tsx`
- **기능**:
  - 업로드된 이미지 파일을 `pendingAnalysisFiles`에 추가
  - 3초마다 폴링하여 메타데이터 생성 여부 확인
  - 메타데이터 생성 완료 시 자동으로 파일 목록 업데이트
  - "메타데이터 생성 중..." 상태 표시

#### 5. 메타데이터 표시 UI
- **파일 그리드**: 
  - 장면 요약 표시 (line-clamp-2)
  - 태그를 Badge 형태로 표시 (최대 5개 + 나머지 개수)
- **상세 정보 Dialog**:
  - 기본 정보 카드와 메타데이터 카드로 분리
  - PC: 가로 배열, 모바일: 세로 배열
  - 전체 메타데이터 정보 표시

#### 6. 검색 기능 확장
- **파일**: `supabase-schema.sql`
- **기능**:
  - `search_files_fulltext` RPC 함수 확장
  - `metadata.scene_summary` 검색 지원
  - `metadata.tags` 배열 검색 지원
  - 메타데이터 JSONB 필드 GIN 인덱스 추가

### 기술 스택
- **Gemini API**: Google Gemini 2.5 Pro
- **Next.js API Routes**: 서버 사이드 API 호출
- **Supabase**: 메타데이터 JSONB 저장 및 검색

### 환경 변수
```bash
GEMINI_API_KEY=your-gemini-api-key
```

### 메타데이터 생성 프로세스

1. **이미지 업로드**
   - 파일이 Supabase Storage에 업로드됨
   - DB에 파일 정보 저장 (`metadata: {}`)
   - 이미지 파일인 경우 자동으로 분석 시작

2. **이미지 분석**
   - 이미지 URL 접근 가능 여부 확인 (최대 5초 대기)
   - Gemini API 호출
   - 분석 결과 파싱 및 검증

3. **메타데이터 저장**
   - 분석 결과를 `metadata` JSONB 필드에 저장
   - `analyzed_at` 타임스탬프 추가

4. **UI 업데이트**
   - 폴링을 통해 메타데이터 생성 완료 감지
   - 파일 목록 자동 업데이트
   - 메타데이터 표시

### 검색 활용
- 메타데이터의 `scene_summary`와 `tags`가 검색 대상에 포함됨
- 예: "화해" 태그로 검색하면 해당 태그가 포함된 이미지 검색 가능
- 예: "두 사람이 대화하는 장면" 같은 자연어 검색 가능

**완료일**: 2025-01-08

---

## 🏗️ 컴포넌트 아키텍처

### FileGrid 컴포넌트 구조 (✅ 리팩토링 완료)

FileGrid 컴포넌트는 대규모 리팩토링을 통해 여러 작은 컴포넌트와 커스텀 훅으로 분리되었습니다.

**리팩토링 전**: 약 1842줄의 단일 파일  
**리팩토링 후**: 약 488줄 + 여러 작은 파일들로 분리

#### 구조 개요
```
FileGrid (메인 컴포넌트)
├── 커스텀 훅
│   ├── useFileGrid (파일 그리드 로직)
│   ├── useImageRegeneration (이미지 재생성 로직)
│   └── useImageViewer (이미지 뷰어 로직)
├── 작은 컴포넌트
│   ├── FileDeleteDialog (삭제 확인)
│   ├── FileEditDialog (정보 수정)
│   ├── FileCard (파일 카드)
│   └── ProcessFileSection (공정별 섹션)
└── 큰 컴포넌트
    ├── FileDetailDialog (상세 정보)
    ├── ImageViewer (전체화면 뷰어)
    └── ImageRegenerationDialog (재생성 스타일 선택)
```

**상세 내용**: [리팩토링 가이드](./REFACTORING_GUIDE.md) 참고

---

## 🎨 AI 이미지 재생성 시스템 (✅ 구현 완료)

### 개요
Gemini 2.5 Flash Image 모델을 활용하여 기존 이미지를 다양한 스타일로 재생성하는 기능입니다.

### 구현된 기능

#### 1. 이미지 재생성 API
- **파일**: `app/api/regenerate-image/route.ts`
- **기능**:
  - Gemini 2.5 Flash Image 모델을 통한 이미지 재생성
  - 원본 이미지와 스타일 프롬프트를 입력받아 새로운 이미지 생성
  - base64 형식의 이미지 데이터 반환
- **API 엔드포인트**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`
- **설정**:
  - `temperature: 1.0`
  - `topP: 0.95`
  - `topK: 40`
  - `maxOutputTokens: 32768`
  - `imageSize: '1K'`
  - `responseModalities: ['IMAGE', 'TEXT']`

#### 2. 스타일 옵션
- **파일**: `components/FileGrid.tsx`
- **스타일 목록**:
  - 베르세르크풍: "이 그림을 베르세르크 만화 풍으로 조밀한 선들로 다시 그려줘"
  - 일본 만화풍: "이 그림을 일본 만화 스타일로 다시 그려줘"
  - 디지털 아트풍: "이 그림을 디지털 아트 스타일로 다시 그려줘"
  - 수채화풍: "이 그림을 수채화 스타일로 다시 그려줘"
  - 유화풍: "이 그림을 유화 스타일로 다시 그려줘"
  - 스케치풍: "이 그림을 연필 스케치 스타일로 다시 그려줘"

#### 3. UI 컴포넌트
- **파일**: `components/FileGrid.tsx`
- **기능**:
  - 파일 상세 Dialog에 "AI 다시그리기" 버튼 추가
  - 버튼 클릭 시 스타일 선택 Dialog 표시
  - 재생성된 이미지 표시 영역 (원본 이미지 아래)
  - 재생성된 이미지 우상단에 리프레시 아이콘 버튼 (다시그리기)
  - 재생성된 이미지 다운로드 기능
  - 재생성된 이미지를 파일로 등록 기능
  - 재생성 중 로딩 상태 표시 (샤이닝 효과 및 아이콘 회전)

#### 4. 상태 관리
- `styleSelectionOpen`: 스타일 선택 Dialog 열림 상태
- `regeneratingImage`: 재생성 중인 파일 ID
- `regeneratedImageUrl`: 생성된 이미지 Blob URL
- `lastUsedPrompt`: 마지막으로 사용한 프롬프트 (다시그리기용)

#### 5. 주요 기능
- **이미지 재생성**: 원본 이미지와 선택한 스타일로 새로운 이미지 생성
- **다시그리기**: 동일한 프롬프트로 재생성 (리프레시 아이콘 클릭)
- **파일 등록**: 재생성된 이미지를 원본 파일과 같은 공정에 파일로 등록
  - 파일명: `regenerated-원본파일명.확장자`
  - 설명: `AI 재생성: 원본파일명`
  - 등록 후 파일 디테일 Dialog 자동 닫기
- **다운로드**: 재생성된 이미지를 로컬에 다운로드

#### 6. 시각적 효과
- **샤이닝 애니메이션**: 재생성 중 버튼에 그라데이션 이동 효과 (`app/globals.css`에 `shimmer` 애니메이션 정의)
- **아이콘 회전**: 재생성 중 리프레시 아이콘 회전 애니메이션
- **로딩 상태**: 재생성 중 버튼 비활성화 및 시각적 피드백

### 기술 스택
- **Gemini API**: Google Gemini 2.5 Flash Image (정식 버전)
- **Next.js API Routes**: 서버 사이드 API 호출
- **Blob URL**: 클라이언트 사이드 이미지 표시

### 환경 변수
```bash
GEMINI_API_KEY=your-gemini-api-key
```

### 사용 프로세스

1. **이미지 선택**
   - 파일 그리드에서 이미지 파일 클릭
   - 파일 상세 Dialog 열림

2. **스타일 선택**
   - "AI 다시그리기" 버튼 클릭
   - 스타일 선택 Dialog에서 원하는 스타일 선택

3. **이미지 재생성**
   - API 호출하여 이미지 재생성
   - 재생성된 이미지 표시

4. **추가 작업**
   - **다시그리기**: 우상단 리프레시 아이콘 클릭하여 동일한 스타일로 재생성
   - **파일로 등록**: 재생성된 이미지를 파일로 저장 (원본과 같은 공정)
   - **다운로드**: 재생성된 이미지를 로컬에 다운로드

### 파일 구조
```
app/
└── api/
    └── regenerate-image/
        └── route.ts          # 이미지 재생성 API 엔드포인트

components/
└── FileGrid.tsx              # 파일 그리드 (재생성 UI 포함)

app/
└── globals.css              # shimmer 애니메이션 정의
```

**완료일**: 2025-01-08

