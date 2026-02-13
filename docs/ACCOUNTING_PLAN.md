# 더그림 CMS 회계 시스템 추가 계획서

## 📋 프로젝트 개요

**목표**: 더그림 CMS에 회계 관리 기능을 부가 기능으로 추가
**버전**: v1.0
**날짜**: 2026-02-13

---

## 🎯 핵심 요구사항

1. **멤버 롤 확장**: 기존 4개 역할(admin, manager, staff, viewer)에 `accountant` 역할 추가
2. **회계 기능**: 수입/지출 관리, 프로젝트별 예산 추적, 보고서 생성
3. **기존 시스템 통합**: 더그림 CMS의 멤버 시스템과 완전 통합
4. **Git 최신화**: 최신 코드 기반으로 작업
5. **버전 1.0 배포**: 실사용 가능한 MVP 완성

---

## 📊 현재 시스템 분석

### 기존 멤버 역할 시스템
- **admin** (관리자): 모든 권한
- **manager** (매니저): 콘텐츠/파일/공정 관리
- **staff** (스태프): 파일 업로드, 본인 파일 삭제
- **viewer** (조회자): 읽기 전용

### DB 구조
- `user_profiles` 테이블: 사용자 정보 + 역할 관리
- `role` 컬럼: CHECK 제약 조건으로 역할 검증
- RLS 정책: 역할 기반 접근 제어

### 권한 관리
- `lib/utils/permissions.ts`: 역할별 권한 체크 함수
- 각 기능별 권한 체크 유틸리티 제공

---

## 🏗️ 회계 시스템 설계

### 1. 멤버 롤 확장

#### 새 역할: `accountant` (회계 담당자)
**권한:**
- ✅ 모든 데이터 조회 (웹툰, 회차, 컷, 파일)
- ✅ **회계 데이터 생성/수정/삭제** (수입, 지출, 예산)
- ✅ **회계 보고서 생성** (월별/프로젝트별 리포트)
- ✅ **프로젝트별 예산 설정** (웹툰별 예산 배정)
- ❌ 콘텐츠 생성/수정/삭제 불가 (웹툰/회차/컷)
- ❌ 파일 업로드/삭제 불가
- ❌ 사용자 관리 불가

**사용 사례:**
- 프로젝트 회계 담당자
- 재무 관리자
- 예산 관리자

---

### 2. DB 스키마 설계

#### 2.1. `accounting_categories` 테이블 (수입/지출 카테고리)
```sql
CREATE TABLE IF NOT EXISTS accounting_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  description TEXT,
  color VARCHAR(7) DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**기본 카테고리:**
- 수입: 프로젝트 수주, 저작권 수익, 기타 수입
- 지출: 인건비, 외주비, 장비/소프트웨어, 기타 지출

#### 2.2. `accounting_transactions` 테이블 (수입/지출 내역)
```sql
CREATE TABLE IF NOT EXISTS accounting_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webtoon_id UUID REFERENCES webtoons(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES accounting_categories(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(15, 2) NOT NULL CHECK (amount >= 0),
  transaction_date DATE NOT NULL,
  description TEXT,
  note TEXT,
  receipt_file_path TEXT,
  receipt_storage_path TEXT,
  created_by UUID REFERENCES user_profiles(id),
  approved_by UUID REFERENCES user_profiles(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2.3. `webtoon_budgets` 테이블 (프로젝트별 예산)
```sql
CREATE TABLE IF NOT EXISTS webtoon_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webtoon_id UUID NOT NULL REFERENCES webtoons(id) ON DELETE CASCADE,
  total_budget DECIMAL(15, 2) NOT NULL CHECK (total_budget >= 0),
  start_date DATE NOT NULL,
  end_date DATE,
  description TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(webtoon_id, start_date)
);
```

#### 인덱스
```sql
CREATE INDEX idx_transactions_webtoon_id ON accounting_transactions(webtoon_id);
CREATE INDEX idx_transactions_category_id ON accounting_transactions(category_id);
CREATE INDEX idx_transactions_date ON accounting_transactions(transaction_date);
CREATE INDEX idx_transactions_status ON accounting_transactions(status);
CREATE INDEX idx_budgets_webtoon_id ON webtoon_budgets(webtoon_id);
```

---

### 3. API 설계

#### 3.1. 카테고리 관리
- `GET /api/accounting/categories` - 카테고리 목록
- `POST /api/accounting/categories` - 카테고리 생성 (accountant, admin)
- `PATCH /api/accounting/categories/[id]` - 카테고리 수정
- `DELETE /api/accounting/categories/[id]` - 카테고리 삭제

#### 3.2. 거래 내역 관리
- `GET /api/accounting/transactions` - 거래 내역 목록 (필터: 웹툰, 날짜, 타입, 상태)
- `POST /api/accounting/transactions` - 거래 내역 생성
- `PATCH /api/accounting/transactions/[id]` - 거래 내역 수정
- `DELETE /api/accounting/transactions/[id]` - 거래 내역 삭제
- `POST /api/accounting/transactions/[id]/approve` - 승인 (admin만)

#### 3.3. 예산 관리
- `GET /api/accounting/budgets` - 예산 목록
- `GET /api/accounting/budgets/[webtoonId]` - 특정 웹툰 예산
- `POST /api/accounting/budgets` - 예산 생성
- `PATCH /api/accounting/budgets/[id]` - 예산 수정
- `DELETE /api/accounting/budgets/[id]` - 예산 삭제

#### 3.4. 보고서
- `GET /api/accounting/reports/summary` - 전체 요약 (총 수입/지출)
- `GET /api/accounting/reports/webtoon/[id]` - 웹툰별 보고서
- `GET /api/accounting/reports/monthly` - 월별 보고서
- `GET /api/accounting/reports/export` - CSV/Excel 내보내기

---

### 4. UI/UX 설계

#### 4.1. 내비게이션 추가
- 사이드바에 "회계 관리" 메뉴 추가 (accountant, admin만 표시)
- 하위 메뉴:
  - 대시보드
  - 거래 내역
  - 예산 관리
  - 보고서

#### 4.2. 페이지 구조
```
/accounting
├── /dashboard          # 회계 대시보드 (요약)
├── /transactions       # 거래 내역 목록
│   ├── /new           # 거래 내역 추가
│   └── /[id]          # 거래 내역 상세/수정
├── /budgets           # 예산 관리
│   ├── /new           # 예산 생성
│   └── /[id]          # 예산 수정
├── /reports           # 보고서
│   ├── /summary       # 전체 요약
│   ├── /monthly       # 월별 보고서
│   └── /webtoon/[id]  # 웹툰별 보고서
└── /categories        # 카테고리 관리 (설정)
```

#### 4.3. 주요 컴포넌트
- `AccountingDashboard` - 수입/지출 요약, 차트, 최근 거래
- `TransactionList` - 거래 내역 테이블 (필터, 정렬, 검색)
- `TransactionForm` - 거래 내역 생성/수정 폼
- `BudgetManager` - 웹툰별 예산 설정 및 진행률
- `ReportViewer` - 보고서 조회 및 다운로드
- `CategoryManager` - 카테고리 관리

---

## 🚀 구현 단계

### Phase 1: DB 스키마 및 권한 (1주)
1. ✅ Git 최신화
2. 멤버 롤 확장
   - `user_profiles` 테이블 role CHECK 제약 조건 수정
   - `lib/utils/permissions.ts` 업데이트
   - `ROLES_GUIDE.md` 문서 업데이트
3. 회계 테이블 생성
   - `accounting_categories`
   - `accounting_transactions`
   - `webtoon_budgets`
4. RLS 정책 설정
5. 기본 데이터 삽입 (카테고리)

### Phase 2: API 개발 (1주)
1. 카테고리 CRUD API
2. 거래 내역 CRUD API
3. 예산 관리 API
4. 보고서 생성 API (요약, 월별, 웹툰별)

### Phase 3: UI 개발 (1.5주)
1. 내비게이션 추가
2. 회계 대시보드
3. 거래 내역 관리 페이지
4. 예산 관리 페이지
5. 보고서 페이지
6. 카테고리 관리 (설정)

### Phase 4: 테스트 및 배포 (0.5주)
1. 기능 테스트
2. 권한 테스트
3. 버전 1.0 배포
4. 문서 작성

---

## 📝 파일 구조

```
thegrim-cms/
├── migrations/
│   └── add-accounting-system.sql         # DB 마이그레이션
├── app/
│   └── accounting/
│       ├── dashboard/page.tsx            # 대시보드
│       ├── transactions/
│       │   ├── page.tsx                  # 거래 내역 목록
│       │   ├── new/page.tsx              # 거래 추가
│       │   └── [id]/page.tsx             # 거래 수정
│       ├── budgets/
│       │   ├── page.tsx                  # 예산 목록
│       │   ├── new/page.tsx              # 예산 생성
│       │   └── [id]/page.tsx             # 예산 수정
│       ├── reports/
│       │   ├── page.tsx                  # 보고서 메인
│       │   ├── summary/page.tsx          # 전체 요약
│       │   ├── monthly/page.tsx          # 월별 보고서
│       │   └── webtoon/[id]/page.tsx     # 웹툰별 보고서
│       └── categories/page.tsx           # 카테고리 관리
├── components/
│   └── accounting/
│       ├── AccountingDashboard.tsx
│       ├── TransactionList.tsx
│       ├── TransactionForm.tsx
│       ├── BudgetManager.tsx
│       ├── ReportViewer.tsx
│       └── CategoryManager.tsx
├── lib/
│   └── api/
│       └── accounting.ts                 # 회계 API 클라이언트
└── docs/
    └── ACCOUNTING_GUIDE.md               # 회계 시스템 사용 가이드
```

---

## 🔐 권한 설계

### 역할별 회계 기능 접근 권한

| 기능 | admin | accountant | manager | staff | viewer |
|------|-------|------------|---------|-------|--------|
| 회계 대시보드 조회 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 거래 내역 조회 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 거래 내역 생성/수정 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 거래 내역 삭제 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 거래 승인 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 예산 설정 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 보고서 조회 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 카테고리 관리 | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 🎨 UI 디자인 가이드

### 색상 체계
- **수입**: 초록색 (#10B981 - green-500)
- **지출**: 빨간색 (#EF4444 - red-500)
- **예산**: 파란색 (#3B82F6 - blue-500)
- **승인 대기**: 노란색 (#F59E0B - amber-500)

### 주요 차트
- **대시보드**: 월별 수입/지출 막대 차트, 카테고리별 지출 파이 차트
- **웹툰별 보고서**: 예산 대비 지출 진행률 바, 카테고리별 지출 분포

---

## 📦 배포 체크리스트

- [ ] DB 마이그레이션 실행
- [ ] 기본 카테고리 데이터 삽입
- [ ] 권한 테스트 완료
- [ ] API 엔드포인트 테스트
- [ ] UI/UX 테스트
- [ ] 문서 작성 (ACCOUNTING_GUIDE.md, ROLES_GUIDE.md 업데이트)
- [ ] Git 커밋 및 푸시
- [ ] Vercel 배포
- [ ] 프로덕션 DB 마이그레이션

---

## 📚 참고 문서

- `ROLES_GUIDE.md` - 기존 역할 시스템 가이드
- `supabase-auth-schema.sql` - 인증 및 권한 스키마
- `lib/utils/permissions.ts` - 권한 체크 유틸리티
- `ARCHITECTURE.md` - 시스템 아키텍처 문서

---

## 🔗 링크

- **프로젝트 저장소**: /c/dev/thegrim-cms
- **버전 1.0 브랜치**: `feature/accounting-v1`
