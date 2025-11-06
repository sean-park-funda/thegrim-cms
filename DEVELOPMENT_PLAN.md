# 더그림 작업관리 시스템 개발 계획

## 📊 현재 구현 상태 (2025-01-07 업데이트)

### ✅ 완료된 기능

#### 1. 기본 구조
- ✅ Next.js 16 기반 프로젝트 설정
- ✅ TypeScript 설정
- ✅ Tailwind CSS 스타일링
- ✅ shadcn/ui 컴포넌트 라이브러리 통합
- ✅ Zustand 상태 관리

#### 2. UI 컴포넌트
- ✅ 네비게이션 바 (웹툰별/공정별 뷰 전환, 검색)
- ✅ 웹툰별 뷰 레이아웃 (웹툰 → 회차 → 컷 → 파일)
- ✅ 공정별 뷰 레이아웃 (공정 목록 → 파일 목록)
- ✅ 검색 결과 화면

#### 3. 데이터 표시
- ✅ 웹툰 목록 표시
- ✅ 회차 목록 표시
- ✅ 컷 목록 표시
- ✅ 파일 그리드 표시 (공정별)
- ✅ 검색 결과 표시

#### 4. 웹툰 관리
- ✅ 웹툰 목록 조회
- ✅ 웹툰 생성 (Dialog)
- ✅ 웹툰 수정 (Dialog)
- ✅ 웹툰 삭제
- ✅ 웹툰 선택 기능

#### 5. 회차 관리
- ✅ 회차 목록 조회
- ✅ 회차 생성 (Dialog)
- ✅ 회차 수정 (Dialog)
- ✅ 회차 삭제
- ✅ 회차 선택 기능

#### 6. 컷 관리
- ✅ 컷 목록 조회
- ✅ 컷 생성 (Dialog)
- ✅ 컷 수정 (Dialog)
- ✅ 컷 삭제
- ✅ 컷 선택 기능

#### 7. 파일 관리
- ✅ 파일 업로드 기능
- ✅ 파일 목록 조회 (공정별, 컷별)
- ✅ 파일 검색 기능
- ✅ 파일 다운로드 기능
- ✅ 파일 삭제 기능
- ❌ 파일 정보 수정 기능

#### 8. API 계층
- ✅ Supabase 클라이언트 설정
- ✅ 웹툰 API (CRUD)
- ✅ 회차 API (CRUD)
- ✅ 컷 API (CRUD)
- ✅ 공정 API (CRUD, 순서 변경)
- ✅ 파일 API (조회, 검색, 업로드, 다운로드, 삭제)

#### 9. 공정 관리
- ✅ 공정 생성 기능
- ✅ 공정 수정 기능
- ✅ 공정 삭제 기능
- ✅ 공정 순서 변경 기능 (화살표 버튼)

#### 10. UI/UX 개선
- ✅ 제목 변경 (더그림 작업관리 시스템)
- ✅ 버튼 위치 개선 (제목 아래, 전체 너비)
- ✅ 카드 전체 클릭 가능하도록 개선
- ✅ 목록 스크롤 기능 추가
- ✅ 컷 목록 제목이 선택된 회차 제목으로 동적 변경

---

### ⚠️ 부분 구현 / 미구현 기능

#### 1. 파일 관리 (일부)
- ❌ 파일 정보 수정 기능

#### 2. 인증 및 권한 관리
- ❌ 사용자 인증 시스템
- ❌ 관리자 초대 시스템
- ❌ 역할 기반 권한 관리
- ❌ Row Level Security (RLS) 정책

#### 3. 환경 설정
- ⚠️ `.env.local` 파일 없음 (Supabase 연결 필요)

---

## 🎯 다음 개발 계획

### Phase 1: 기본 CRUD 기능 완성 (우선순위: 높음)

#### 1.1 회차 관리 기능 구현 ✅ 완료
- [x] `lib/api/episodes.ts`에 `createEpisode`, `updateEpisode`, `deleteEpisode` 함수 구현
- [x] `EpisodeList.tsx`에 회차 생성 Dialog 추가
- [x] `EpisodeList.tsx`에 회차 수정 Dialog 추가
- [x] `EpisodeList.tsx`에 회차 삭제 기능 추가
- [x] `WebtoonList.tsx`와 동일한 패턴으로 구현

**완료일**: 2025-01-06

#### 1.2 컷 관리 기능 구현 ✅ 완료
- [x] `lib/api/cuts.ts`에 `createCut`, `updateCut`, `deleteCut` 함수 구현
- [x] `CutList.tsx`에 컷 생성 Dialog 추가
- [x] `CutList.tsx`에 컷 수정 Dialog 추가
- [x] `CutList.tsx`에 컷 삭제 기능 추가
- [x] `WebtoonList.tsx`와 동일한 패턴으로 구현

**완료일**: 2025-01-06

#### 1.3 공정 관리 기능 구현 ✅ 완료
- [x] `ProcessView.tsx`에 공정 생성 Dialog 추가
- [x] `ProcessView.tsx`에 공정 수정 Dialog 추가
- [x] `ProcessView.tsx`에 공정 삭제 기능 추가
- [x] `lib/api/processes.ts`에 `createProcess`, `updateProcess`, `deleteProcess` 함수 구현
- [x] 공정 순서 변경 기능 (화살표 버튼)

**완료일**: 2025-01-07

---

### Phase 2: 파일 관리 기능 구현 (우선순위: 높음)

#### 2.1 파일 업로드 기능 ✅ 완료
- [x] `FileGrid.tsx`에 파일 업로드 Dialog 추가
- [x] `react-dropzone`을 사용한 드래그 앤 드롭 업로드 UI
- [x] `lib/api/files.ts`에 `uploadFile` 함수 구현
- [x] Supabase Storage 연동
- [x] 업로드 진행률 표시
- [x] 파일 타입 검증 (이미지, PSD, AI 등)

**완료일**: 2025-01-06

#### 2.2 파일 다운로드/삭제 기능 ✅ 완료
- [x] `FileGrid.tsx`에 파일 다운로드 기능 구현
- [x] `FileGrid.tsx`에 파일 삭제 기능 구현
- [x] `lib/api/files.ts`에 `deleteFile` 함수 구현 (Storage + DB)
- [x] 삭제 확인 Dialog 추가

**완료일**: 2025-01-07

#### 2.3 파일 정보 수정 기능
- [ ] 파일 설명 수정 기능
- [ ] 파일 메타데이터 수정 기능

**예상 소요 시간**: 1-2시간

---

### Phase 3: 사용자 경험 개선 (우선순위: 중간)

#### 3.1 로딩 상태 개선
- [ ] 스켈레톤 UI 추가
- [ ] 로딩 중 에러 처리 개선
- [ ] Toast 알림 (react-hot-toast 또는 shadcn/ui toast)

**예상 소요 시간**: 2-3시간

#### 3.2 에러 처리 개선
- [ ] 전역 에러 핸들링
- [ ] 사용자 친화적인 에러 메시지
- [ ] 네트워크 오류 처리

**예상 소요 시간**: 2-3시간

#### 3.3 UI/UX 개선
- [x] 제목 변경 (더그림 작업관리 시스템) ✅
- [x] 버튼 위치 개선 (제목 아래, 전체 너비) ✅
- [x] 카드 전체 클릭 가능하도록 개선 ✅
- [x] 목록 스크롤 기능 추가 ✅
- [x] 컷 목록 제목이 선택된 회차 제목으로 동적 변경 ✅
- [ ] 반응형 디자인 개선
- [ ] 키보드 단축키 지원
- [ ] 파일 미리보기 개선 (모달, 확대 등)
- [ ] 이미지 로딩 최적화

**예상 소요 시간**: 3-4시간 (일부 완료)

---

### Phase 4: 인증 및 권한 관리 시스템 (우선순위: 높음)

#### 4.1 데이터베이스 스키마 확장
- [ ] `users` 테이블 생성 (Supabase Auth와 연동)
- [ ] `invitations` 테이블 생성 (초대 토큰 관리)
- [ ] `user_roles` 테이블 생성 (역할 관리)
- [ ] 역할 타입 정의 (admin, manager, staff, viewer)

**예상 소요 시간**: 1-2시간

#### 4.2 관리자 초대 시스템
- [ ] 초대 이메일 발송 기능
- [ ] 초대 토큰 생성 및 관리
- [ ] 초대 링크를 통한 회원가입 페이지
- [ ] 초대 토큰 검증 및 계정 생성
- [ ] 초대 시 권한 자동 부여
- [ ] 초대 만료 시간 설정

**예상 소요 시간**: 4-5시간

#### 4.3 사용자 인증 시스템
- [ ] Supabase Auth 통합
- [ ] 로그인 페이지 구현
- [ ] 회원가입 페이지 구현 (초대 링크 필수)
- [ ] 로그아웃 기능
- [ ] 세션 관리
- [ ] 비밀번호 재설정 기능

**예상 소요 시간**: 3-4시간

#### 4.4 권한 관리 시스템
- [ ] 역할 기반 접근 제어 (RBAC)
- [ ] 권한 체크 미들웨어/훅
- [ ] UI 요소 권한별 표시/숨김
- [ ] API 엔드포인트 권한 검증
- [ ] 관리자 전용 페이지 (사용자 관리, 초대 관리)

**예상 소요 시간**: 4-5시간

#### 4.5 Row Level Security (RLS) 정책
- [ ] 웹툰 테이블 RLS 정책 설정
- [ ] 회차 테이블 RLS 정책 설정
- [ ] 컷 테이블 RLS 정책 설정
- [ ] 파일 테이블 RLS 정책 설정
- [ ] 공정 테이블 RLS 정책 설정
- [ ] Storage 버킷 RLS 정책 설정
- [ ] 역할별 접근 권한 정의

**예상 소요 시간**: 3-4시간

**총 예상 소요 시간**: 15-20시간

---

### Phase 5: 고급 기능 (우선순위: 낮음)

#### 5.1 검색 기능 개선
- [ ] 고급 검색 필터 (날짜, 파일 타입, 공정 등)
- [ ] 검색 결과 정렬
- [ ] 검색 히스토리

**예상 소요 시간**: 3-4시간

#### 5.2 파일 관리 고급 기능
- [ ] 일괄 업로드
- [ ] 일괄 다운로드
- [ ] 파일 버전 관리
- [ ] 썸네일 자동 생성

**예상 소요 시간**: 5-6시간

#### 5.3 통계 및 대시보드
- [ ] 웹툰별 진행률 표시
- [ ] 공정별 통계
- [ ] 파일 사용량 통계

**예상 소요 시간**: 4-5시간

---

## 🚀 즉시 진행 가능한 작업

### 1. 환경 변수 설정 확인
```bash
# .env.local 파일 생성 필요
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
```

### 2. 다음 우선순위 작업
1. **인증 및 권한 관리 시스템** (관리자 초대 기반 계정 생성) ⭐ 프로덕션 필수
2. **파일 정보 수정 기능** (핵심 기능)
3. **Toast 알림 시스템** (UX 개선)
4. **파일 미리보기 개선** (UX 개선)

---

## 📝 개발 시 주의사항

### 코드 스타일
- 기존 코드 스타일 유지
- 불필요한 공백 제거
- 한 줄에 들어갈 수 있는 속성은 한 줄로 작성
- 컴포넌트 옵션 사이 불필요한 빈 줄 제거

### 에러 처리
- try-catch로 모든 비동기 작업 감싸기
- 사용자에게 명확한 에러 메시지 표시
- 콘솔 에러 로깅 유지

### 상태 관리
- Zustand store에 필요한 상태만 저장
- 불필요한 리렌더링 방지
- 로컬 상태와 전역 상태 구분

---

## 🔍 현재 확인된 이슈

1. **Supabase 연결 문제 가능성**
   - `.env.local` 파일이 없어서 API 호출 실패 가능
   - 환경 변수 설정 후 개발 서버 재시작 필요

2. **Dialog z-index 문제**
   - `WebtoonList.tsx`의 Dialog에 `z-[100]` 설정되어 있음
   - 다른 Dialog들도 동일하게 설정 필요할 수 있음

3. **이미지 로딩 오류 가능성**
   - Next.js Image 컴포넌트 사용 시 외부 도메인 설정 필요할 수 있음
   - `next.config.ts`에 Supabase 이미지 도메인 추가 필요

4. **보안 이슈 (프로덕션 배포 전 필수 해결)**
   - ❌ 인증 시스템 없음 (모든 사용자가 모든 데이터 접근 가능)
   - ❌ RLS 정책 비활성화 (데이터베이스 레벨 보안 없음)
   - ❌ 파일 접근 제한 없음 (누구나 파일 업로드/다운로드 가능)

---

## 📚 참고 자료

- [Next.js 문서](https://nextjs.org/docs)
- [Supabase 문서](https://supabase.com/docs)
- [Supabase Auth 문서](https://supabase.com/docs/guides/auth)
- [Supabase RLS 문서](https://supabase.com/docs/guides/auth/row-level-security)
- [shadcn/ui 문서](https://ui.shadcn.com)
- [Zustand 문서](https://zustand-demo.pmnd.rs)
- [react-dropzone 문서](https://react-dropzone.js.org)

---

## 🔐 인증 시스템 상세 설계

### 사용자 역할 정의

1. **admin (관리자)**
   - 모든 기능 접근 가능
   - 사용자 관리 (초대, 권한 변경, 삭제)
   - 시스템 설정 관리

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

### 초대 프로세스

1. **관리자가 초대 발송**
   - 이메일 주소 입력
   - 역할 선택 (manager, staff, viewer)
   - 초대 토큰 생성 (UUID, 만료 시간 7일)
   - 이메일 발송 (초대 링크 포함)

2. **초대 수신자가 회원가입**
   - 초대 링크 클릭
   - 토큰 검증
   - 이메일, 비밀번호 입력
   - 계정 생성 및 역할 자동 부여
   - 로그인 페이지로 리다이렉트

3. **초대 관리**
   - 초대 목록 조회 (발송자, 수신자, 상태, 만료일)
   - 초대 취소
   - 초대 재발송

### 데이터베이스 스키마 추가

```sql
-- 사용자 프로필 테이블 (Supabase Auth와 연동)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'staff', 'viewer')),
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 초대 테이블
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff', 'viewer')),
  token TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
```

### RLS 정책 예시

```sql
-- user_profiles: 자신의 프로필만 조회 가능, 관리자는 모든 프로필 조회
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id OR 
         EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- invitations: 관리자만 조회/생성 가능
CREATE POLICY "Only admins can manage invitations"
  ON invitations FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));
```

