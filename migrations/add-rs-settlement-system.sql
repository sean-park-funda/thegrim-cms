-- ========================================
-- RS 정산 시스템 마이그레이션
-- 날짜: 2026-02-16
-- 설명: 네이버 매출 엑셀 파싱 → 작품별 수익 집계 → 파트너별 RS 정산
-- ========================================

-- ========================================
-- 1. rs_works - 작품 테이블
-- ========================================

CREATE TABLE IF NOT EXISTS rs_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL UNIQUE,
  naver_name VARCHAR(200),
  contract_type VARCHAR(20) DEFAULT 'exclusive' CHECK (contract_type IN ('exclusive', 'non_exclusive', 'management')),
  settlement_level VARCHAR(10) DEFAULT 'work' CHECK (settlement_level IN ('work', 'partner')),
  is_active BOOLEAN DEFAULT true NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_rs_works_updated_at
BEFORE UPDATE ON rs_works
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 2. rs_partners - 파트너/작가 테이블
-- ========================================

CREATE TABLE IF NOT EXISTS rs_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  company_name VARCHAR(200),
  partner_type VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (partner_type IN ('individual', 'domestic_corp', 'foreign_corp', 'naver')),
  tax_id VARCHAR(50),
  tax_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.033,
  bank_name VARCHAR(50),
  bank_account VARCHAR(50),
  email VARCHAR(200),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_rs_partners_updated_at
BEFORE UPDATE ON rs_partners
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 3. rs_work_partners - 작품-파트너 연결 (RS 비율)
-- ========================================

CREATE TABLE IF NOT EXISTS rs_work_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  rs_rate DECIMAL(5, 4) NOT NULL CHECK (rs_rate >= 0 AND rs_rate <= 1),
  role VARCHAR(50) NOT NULL DEFAULT 'author',
  is_mg_applied BOOLEAN DEFAULT false NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_id, partner_id, role)
);

CREATE INDEX IF NOT EXISTS idx_rs_work_partners_work_id ON rs_work_partners(work_id);
CREATE INDEX IF NOT EXISTS idx_rs_work_partners_partner_id ON rs_work_partners(partner_id);

CREATE TRIGGER update_rs_work_partners_updated_at
BEFORE UPDATE ON rs_work_partners
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 4. rs_revenues - 월별 작품 수익
-- ========================================

CREATE TABLE IF NOT EXISTS rs_revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL, -- YYYY-MM
  domestic_paid DECIMAL(15, 2) DEFAULT 0 NOT NULL,
  global_paid DECIMAL(15, 2) DEFAULT 0 NOT NULL,
  domestic_ad DECIMAL(15, 2) DEFAULT 0 NOT NULL,
  global_ad DECIMAL(15, 2) DEFAULT 0 NOT NULL,
  secondary DECIMAL(15, 2) DEFAULT 0 NOT NULL,
  total DECIMAL(15, 2) GENERATED ALWAYS AS (domestic_paid + global_paid + domestic_ad + global_ad + secondary) STORED,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_id, month)
);

CREATE INDEX IF NOT EXISTS idx_rs_revenues_work_id ON rs_revenues(work_id);
CREATE INDEX IF NOT EXISTS idx_rs_revenues_month ON rs_revenues(month);

CREATE TRIGGER update_rs_revenues_updated_at
BEFORE UPDATE ON rs_revenues
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 5. rs_settlements - 월별 파트너 정산
-- ========================================

CREATE TABLE IF NOT EXISTS rs_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month VARCHAR(7) NOT NULL, -- YYYY-MM
  partner_id UUID NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  gross_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0,
  rs_rate DECIMAL(5, 4) NOT NULL,
  revenue_share DECIMAL(15, 2) NOT NULL DEFAULT 0,
  production_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  adjustment DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5, 4) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  mg_deduction DECIMAL(15, 2) NOT NULL DEFAULT 0,
  final_payment DECIMAL(15, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'paid')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, partner_id, work_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_settlements_month ON rs_settlements(month);
CREATE INDEX IF NOT EXISTS idx_rs_settlements_partner_id ON rs_settlements(partner_id);
CREATE INDEX IF NOT EXISTS idx_rs_settlements_work_id ON rs_settlements(work_id);

CREATE TRIGGER update_rs_settlements_updated_at
BEFORE UPDATE ON rs_settlements
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 6. rs_mg_balances - MG 잔액 추적
-- ========================================

CREATE TABLE IF NOT EXISTS rs_mg_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month VARCHAR(7) NOT NULL,
  partner_id UUID NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  previous_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  mg_added DECIMAL(15, 2) NOT NULL DEFAULT 0,
  mg_deducted DECIMAL(15, 2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, partner_id, work_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_mg_balances_month ON rs_mg_balances(month);
CREATE INDEX IF NOT EXISTS idx_rs_mg_balances_partner_id ON rs_mg_balances(partner_id);

CREATE TRIGGER update_rs_mg_balances_updated_at
BEFORE UPDATE ON rs_mg_balances
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 7. rs_upload_history - 업로드 이력
-- ========================================

CREATE TABLE IF NOT EXISTS rs_upload_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month VARCHAR(7) NOT NULL,
  revenue_type VARCHAR(20) NOT NULL CHECK (revenue_type IN ('domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary')),
  file_name VARCHAR(500) NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_upload_history_month ON rs_upload_history(month);

-- ========================================
-- 8. RLS 정책 - admin/accountant만 접근
-- ========================================

ALTER TABLE rs_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE rs_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE rs_work_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE rs_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE rs_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rs_mg_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE rs_upload_history ENABLE ROW LEVEL SECURITY;

-- SELECT 정책
CREATE POLICY "Admin and accountant can view rs_works" ON rs_works FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can view rs_partners" ON rs_partners FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can view rs_work_partners" ON rs_work_partners FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can view rs_revenues" ON rs_revenues FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can view rs_settlements" ON rs_settlements FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can view rs_mg_balances" ON rs_mg_balances FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can view rs_upload_history" ON rs_upload_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

-- ALL (INSERT/UPDATE/DELETE) 정책
CREATE POLICY "Admin and accountant can manage rs_works" ON rs_works FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can manage rs_partners" ON rs_partners FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can manage rs_work_partners" ON rs_work_partners FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can manage rs_revenues" ON rs_revenues FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can manage rs_settlements" ON rs_settlements FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can manage rs_mg_balances" ON rs_mg_balances FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

CREATE POLICY "Admin and accountant can manage rs_upload_history" ON rs_upload_history FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant')));

-- ========================================
-- 9. 보고서용 뷰
-- ========================================

-- 월별 작품 수익 요약 뷰
CREATE OR REPLACE VIEW rs_monthly_revenue_summary AS
SELECT
  r.month,
  COUNT(DISTINCT r.work_id) AS work_count,
  SUM(r.domestic_paid) AS total_domestic_paid,
  SUM(r.global_paid) AS total_global_paid,
  SUM(r.domestic_ad) AS total_domestic_ad,
  SUM(r.global_ad) AS total_global_ad,
  SUM(r.secondary) AS total_secondary,
  SUM(r.total) AS total_revenue
FROM rs_revenues r
GROUP BY r.month
ORDER BY r.month DESC;

-- 월별 정산 요약 뷰
CREATE OR REPLACE VIEW rs_monthly_settlement_summary AS
SELECT
  s.month,
  COUNT(DISTINCT s.partner_id) AS partner_count,
  COUNT(DISTINCT s.work_id) AS work_count,
  SUM(s.gross_revenue) AS total_gross_revenue,
  SUM(s.revenue_share) AS total_revenue_share,
  SUM(s.tax_amount) AS total_tax,
  SUM(s.mg_deduction) AS total_mg_deduction,
  SUM(s.final_payment) AS total_final_payment,
  s.status
FROM rs_settlements s
GROUP BY s.month, s.status
ORDER BY s.month DESC;

-- ========================================
-- 완료
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'RS 정산 시스템 마이그레이션 완료';
  RAISE NOTICE '  - 7개 테이블 생성 (rs_works, rs_partners, rs_work_partners, rs_revenues, rs_settlements, rs_mg_balances, rs_upload_history)';
  RAISE NOTICE '  - RLS 정책 설정 완료';
  RAISE NOTICE '  - 보고서용 뷰 2개 생성';
END $$;
