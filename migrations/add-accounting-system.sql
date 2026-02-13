-- ========================================
-- 회계 시스템 추가 마이그레이션
-- 날짜: 2026-02-13
-- 설명: 멤버 롤 확장 + 회계 테이블 추가
-- ========================================

-- ========================================
-- 1. 멤버 롤 확장 (accountant 추가)
-- ========================================

-- user_profiles 테이블의 role CHECK 제약 조건 수정
ALTER TABLE user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles
ADD CONSTRAINT user_profiles_role_check
CHECK (role IN ('admin', 'manager', 'staff', 'viewer', 'accountant'));

-- ========================================
-- 2. 회계 카테고리 테이블
-- ========================================

CREATE TABLE IF NOT EXISTS accounting_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  description TEXT,
  color VARCHAR(7) DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 카테고리 테이블 업데이트 트리거
CREATE TRIGGER update_accounting_categories_updated_at
BEFORE UPDATE ON accounting_categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 3. 회계 거래 내역 테이블
-- ========================================

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

-- 거래 내역 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_webtoon_id ON accounting_transactions(webtoon_id);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_category_id ON accounting_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_date ON accounting_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_status ON accounting_transactions(status);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_type ON accounting_transactions(type);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_created_by ON accounting_transactions(created_by);

-- 거래 내역 테이블 업데이트 트리거
CREATE TRIGGER update_accounting_transactions_updated_at
BEFORE UPDATE ON accounting_transactions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 4. 웹툰 예산 테이블
-- ========================================

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

-- 예산 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_webtoon_budgets_webtoon_id ON webtoon_budgets(webtoon_id);
CREATE INDEX IF NOT EXISTS idx_webtoon_budgets_start_date ON webtoon_budgets(start_date);

-- 예산 테이블 업데이트 트리거
CREATE TRIGGER update_webtoon_budgets_updated_at
BEFORE UPDATE ON webtoon_budgets
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 5. 기본 카테고리 데이터 삽입
-- ========================================

-- 수입 카테고리
INSERT INTO accounting_categories (name, type, description, color) VALUES
  ('프로젝트 수주', 'income', '웹툰 프로젝트 수주 수익', '#10B981'),
  ('저작권 수익', 'income', '저작권 라이선스 수익', '#059669'),
  ('기타 수입', 'income', '기타 수입 항목', '#34D399')
ON CONFLICT (name) DO NOTHING;

-- 지출 카테고리
INSERT INTO accounting_categories (name, type, description, color) VALUES
  ('인건비', 'expense', '직원 급여 및 인건비', '#EF4444'),
  ('외주비', 'expense', '외부 작가/업체 외주 비용', '#DC2626'),
  ('장비/소프트웨어', 'expense', '장비 구입 및 소프트웨어 라이선스', '#F87171'),
  ('기타 지출', 'expense', '기타 지출 항목', '#FCA5A5')
ON CONFLICT (name) DO NOTHING;

-- ========================================
-- 6. Row Level Security (RLS) 정책
-- ========================================

-- accounting_categories 테이블 RLS 활성화
ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자는 카테고리 조회 가능
CREATE POLICY "Authenticated users can view categories"
  ON accounting_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- admin과 accountant만 카테고리 생성/수정/삭제 가능
CREATE POLICY "Admin and accountant can manage categories"
  ON accounting_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- accounting_transactions 테이블 RLS 활성화
ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;

-- admin과 accountant만 거래 내역 조회 가능
CREATE POLICY "Admin and accountant can view transactions"
  ON accounting_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- admin과 accountant만 거래 내역 생성 가능
CREATE POLICY "Admin and accountant can create transactions"
  ON accounting_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- admin과 accountant만 거래 내역 수정 가능
CREATE POLICY "Admin and accountant can update transactions"
  ON accounting_transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- admin만 거래 내역 삭제 가능
CREATE POLICY "Only admin can delete transactions"
  ON accounting_transactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- webtoon_budgets 테이블 RLS 활성화
ALTER TABLE webtoon_budgets ENABLE ROW LEVEL SECURITY;

-- admin과 accountant만 예산 조회 가능
CREATE POLICY "Admin and accountant can view budgets"
  ON webtoon_budgets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- admin과 accountant만 예산 생성/수정 가능
CREATE POLICY "Admin and accountant can manage budgets"
  ON webtoon_budgets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- ========================================
-- 7. 보고서용 뷰 생성
-- ========================================

-- 웹툰별 수입/지출 요약 뷰
CREATE OR REPLACE VIEW accounting_webtoon_summary AS
SELECT
  w.id AS webtoon_id,
  w.title AS webtoon_title,
  COALESCE(SUM(CASE WHEN t.type = 'income' AND t.status = 'approved' THEN t.amount ELSE 0 END), 0) AS total_income,
  COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.status = 'approved' THEN t.amount ELSE 0 END), 0) AS total_expense,
  COALESCE(SUM(CASE WHEN t.type = 'income' AND t.status = 'approved' THEN t.amount ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.status = 'approved' THEN t.amount ELSE 0 END), 0) AS net_profit,
  COUNT(DISTINCT t.id) AS transaction_count,
  MAX(t.transaction_date) AS last_transaction_date
FROM webtoons w
LEFT JOIN accounting_transactions t ON w.id = t.webtoon_id
GROUP BY w.id, w.title;

-- 월별 수입/지출 요약 뷰
CREATE OR REPLACE VIEW accounting_monthly_summary AS
SELECT
  DATE_TRUNC('month', transaction_date) AS month,
  type,
  COUNT(*) AS transaction_count,
  SUM(amount) AS total_amount
FROM accounting_transactions
WHERE status = 'approved'
GROUP BY DATE_TRUNC('month', transaction_date), type
ORDER BY month DESC, type;

-- 카테고리별 지출 요약 뷰
CREATE OR REPLACE VIEW accounting_category_summary AS
SELECT
  c.id AS category_id,
  c.name AS category_name,
  c.type,
  c.color,
  COUNT(t.id) AS transaction_count,
  COALESCE(SUM(t.amount), 0) AS total_amount
FROM accounting_categories c
LEFT JOIN accounting_transactions t ON c.id = t.category_id AND t.status = 'approved'
WHERE c.is_active = true
GROUP BY c.id, c.name, c.type, c.color
ORDER BY total_amount DESC;

-- ========================================
-- 완료
-- ========================================

-- 마이그레이션 완료 로그
DO $$
BEGIN
  RAISE NOTICE '✅ 회계 시스템 마이그레이션 완료';
  RAISE NOTICE '  - accountant 역할 추가';
  RAISE NOTICE '  - 회계 테이블 3개 생성 (카테고리, 거래내역, 예산)';
  RAISE NOTICE '  - 기본 카테고리 7개 삽입';
  RAISE NOTICE '  - RLS 정책 설정 완료';
  RAISE NOTICE '  - 보고서용 뷰 3개 생성';
END $$;
