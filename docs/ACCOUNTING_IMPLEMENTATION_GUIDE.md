# 회계 시스템 구현 가이드

## ✅ 완료된 구현 (Phase 1-2)

### Phase 1: DB 스키마 및 권한 ✅

**완료 사항:**
- ✅ `accountant` 멤버 롤 추가
- ✅ 회계 테이블 3개 생성
  - `accounting_categories` - 수입/지출 카테고리
  - `accounting_transactions` - 거래 내역
  - `webtoon_budgets` - 프로젝트별 예산
- ✅ 기본 카테고리 7개 삽입
- ✅ RLS 정책 설정 (admin, accountant만 접근)
- ✅ 보고서용 뷰 3개 생성
- ✅ 권한 유틸리티 업데이트 (permissions.ts)
- ✅ ROLES_GUIDE.md 업데이트

**파일:**
- `migrations/add-accounting-system.sql`
- `lib/utils/permissions.ts`
- `ROLES_GUIDE.md`

---

### Phase 2: API 개발 ✅

**완료 사항:**
- ✅ 카테고리 API (`/api/accounting/categories`)
  - GET: 카테고리 목록 조회
  - POST: 카테고리 생성
- ✅ 거래 내역 API (`/api/accounting/transactions`)
  - GET: 거래 내역 목록 조회 (필터 지원)
  - POST: 거래 내역 생성
- ✅ 예산 API (`/api/accounting/budgets`)
  - GET: 예산 목록 조회
  - POST: 예산 생성
- ✅ 보고서 API (`/api/accounting/reports`)
  - GET: 전체 요약, 웹툰별, 월별, 카테고리별 보고서

**파일:**
- `app/api/accounting/categories/route.ts`
- `app/api/accounting/transactions/route.ts`
- `app/api/accounting/budgets/route.ts`
- `app/api/accounting/reports/route.ts`

---

## 🚧 남은 구현 (Phase 3-4)

### Phase 3: UI 개발 (미완료)

**구현 필요 페이지:**

1. **대시보드** (`/accounting/dashboard`)
   - 수입/지출 요약 카드
   - 월별 수입/지출 막대 차트
   - 카테고리별 지출 파이 차트
   - 최근 거래 내역 테이블

2. **거래 내역 관리** (`/accounting/transactions`)
   - 거래 내역 목록 (필터: 웹툰, 타입, 상태, 날짜)
   - 거래 내역 추가 폼
   - 거래 내역 수정/삭제

3. **예산 관리** (`/accounting/budgets`)
   - 웹툰별 예산 목록
   - 예산 대비 지출 진행률 바
   - 예산 추가/수정 폼

4. **보고서** (`/accounting/reports`)
   - 전체 요약 보고서
   - 월별 보고서 (차트 포함)
   - 웹툰별 보고서
   - CSV/Excel 내보내기

5. **카테고리 관리** (`/accounting/categories`)
   - 카테고리 목록 (수입/지출 분리)
   - 카테고리 추가/수정

**필요 컴포넌트:**
```
components/accounting/
├── AccountingDashboard.tsx      # 대시보드
├── TransactionList.tsx          # 거래 내역 테이블
├── TransactionForm.tsx          # 거래 내역 폼
├── BudgetManager.tsx            # 예산 관리
├── ReportViewer.tsx             # 보고서 조회
├── CategoryManager.tsx          # 카테고리 관리
└── charts/
    ├── IncomeExpenseChart.tsx   # 수입/지출 막대 차트
    ├── CategoryPieChart.tsx     # 카테고리 파이 차트
    └── BudgetProgressBar.tsx    # 예산 진행률 바
```

**내비게이션 추가:**
```typescript
// 사이드바에 "회계 관리" 메뉴 추가
{
  name: '회계 관리',
  href: '/accounting',
  icon: CurrencyDollarIcon,
  visible: canViewAccounting(profile.role), // admin, accountant만
  children: [
    { name: '대시보드', href: '/accounting/dashboard' },
    { name: '거래 내역', href: '/accounting/transactions' },
    { name: '예산 관리', href: '/accounting/budgets' },
    { name: '보고서', href: '/accounting/reports' },
    { name: '카테고리', href: '/accounting/categories' },
  ],
}
```

---

### Phase 4: 테스트 및 배포 (미완료)

**테스트 체크리스트:**
- [ ] 권한 테스트 (admin, accountant, 기타 역할)
- [ ] API 엔드포인트 테스트
- [ ] RLS 정책 테스트
- [ ] 거래 내역 CRUD 테스트
- [ ] 예산 설정 및 진행률 계산 테스트
- [ ] 보고서 생성 테스트

**배포 절차:**
1. DB 마이그레이션 실행
   ```bash
   # Supabase SQL Editor에서 실행
   # migrations/add-accounting-system.sql 전체 실행
   ```

2. 기본 데이터 확인
   ```sql
   SELECT * FROM accounting_categories;
   -- 7개 카테고리 확인
   ```

3. 권한 테스트
   - admin 계정으로 회계 메뉴 접근 확인
   - accountant 계정으로 회계 메뉴 접근 확인
   - manager 계정으로 회계 메뉴 접근 차단 확인

4. API 테스트
   ```bash
   # 카테고리 조회
   curl -X GET https://your-domain.com/api/accounting/categories

   # 거래 내역 조회
   curl -X GET https://your-domain.com/api/accounting/transactions

   # 보고서 조회
   curl -X GET 'https://your-domain.com/api/accounting/reports?type=summary'
   ```

5. Vercel 배포
   ```bash
   git push origin feature/accounting-v1
   # Vercel에서 자동 배포
   ```

---

## 📝 API 사용 예시

### 카테고리 조회
```typescript
const response = await fetch('/api/accounting/categories');
const { categories } = await response.json();
```

### 거래 내역 생성
```typescript
const response = await fetch('/api/accounting/transactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    webtoon_id: 'uuid',
    category_id: 'uuid',
    type: 'expense',
    amount: 1000000,
    transaction_date: '2026-02-13',
    description: '인건비 지급',
  }),
});
const { transaction } = await response.json();
```

### 예산 설정
```typescript
const response = await fetch('/api/accounting/budgets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    webtoon_id: 'uuid',
    total_budget: 50000000,
    start_date: '2026-02-01',
    end_date: '2026-12-31',
    description: '2026년 웹툰 제작 예산',
  }),
});
const { budget } = await response.json();
```

### 보고서 조회
```typescript
// 전체 요약
const summary = await fetch('/api/accounting/reports?type=summary');

// 웹툰별 보고서
const webtoonReport = await fetch(`/api/accounting/reports?type=webtoon&webtoonId=${webtoonId}`);

// 월별 보고서
const monthly = await fetch('/api/accounting/reports?type=monthly&month=2026-02');

// 카테고리별 보고서
const category = await fetch('/api/accounting/reports?type=category');
```

---

## 🔐 권한 체크 사용법

```typescript
import {
  canViewAccounting,
  canManageAccounting,
  canApproveTransactions,
  canManageBudgets,
} from '@/lib/utils/permissions';

// 회계 메뉴 표시 여부
const showAccountingMenu = canViewAccounting(profile.role);

// 거래 내역 생성 버튼 표시
const canCreate = canManageAccounting(profile.role);

// 승인 버튼 표시 (admin만)
const canApprove = canApproveTransactions(profile.role);

// 예산 설정 버튼 표시
const canSetBudget = canManageBudgets(profile.role);
```

---

## 🎨 UI 디자인 가이드라인

### 색상 체계
- **수입**: `bg-green-500 text-white` (#10B981)
- **지출**: `bg-red-500 text-white` (#EF4444)
- **예산**: `bg-blue-500 text-white` (#3B82F6)
- **승인 대기**: `bg-yellow-500 text-white` (#F59E0B)
- **승인 완료**: `bg-green-100 text-green-800`
- **승인 거부**: `bg-red-100 text-red-800`

### 아이콘
- 대시보드: `ChartBarIcon`
- 거래 내역: `DocumentTextIcon`
- 예산: `BanknotesIcon`
- 보고서: `DocumentChartBarIcon`
- 카테고리: `TagIcon`

### 차트 라이브러리
- Recharts 사용 권장 (Next.js와 호환성 좋음)
```bash
npm install recharts
```

---

## 📚 참고 문서

- [ACCOUNTING_PLAN.md](./ACCOUNTING_PLAN.md) - 전체 계획서
- [ROLES_GUIDE.md](../ROLES_GUIDE.md) - 역할별 권한 가이드
- [DB Schema](../migrations/add-accounting-system.sql) - 데이터베이스 스키마

---

## 🚀 빠른 시작

1. **DB 마이그레이션 실행**
   ```bash
   # Supabase SQL Editor에서 실행
   migrations/add-accounting-system.sql
   ```

2. **API 테스트**
   ```bash
   # 개발 서버 실행
   npm run dev

   # 카테고리 조회 테스트
   curl http://localhost:3000/api/accounting/categories
   ```

3. **UI 개발 시작**
   ```bash
   # 대시보드 페이지 생성
   mkdir -p app/accounting/dashboard
   touch app/accounting/dashboard/page.tsx
   ```

---

## 📞 문의

Phase 3 UI 개발이 필요하면 상세 요구사항을 알려주세요!
