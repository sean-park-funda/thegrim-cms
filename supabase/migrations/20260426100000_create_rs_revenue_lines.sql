-- rs_revenue_lines: 매출 상세 행 (엑셀 원본 행 보존)
-- 플랫폼별 매출 분리 + 공급가액/부가세 분리 + 관리자 조정

CREATE TABLE IF NOT EXISTS rs_revenue_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_id UUID NOT NULL REFERENCES rs_revenues(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  revenue_type VARCHAR(20) NOT NULL CHECK (revenue_type IN ('domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary')),

  -- 원본 데이터
  service_platform VARCHAR(100),
  country VARCHAR(10),
  sales_period VARCHAR(10),
  rs_rate DECIMAL(5,2),
  sale_currency VARCHAR(10),
  sales_amount DECIMAL(15,2),

  -- 금액 분리 (업로드 시 자동 계산)
  payment_krw DECIMAL(15,2) NOT NULL DEFAULT 0,
  supply_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  vat_amount DECIMAL(15,2) NOT NULL DEFAULT 0,

  -- 조정 (관리자가 업로드 후 수동 입력, API에서 계산)
  adjustment_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  adjustment_supply DECIMAL(15,2) NOT NULL DEFAULT 0,
  adjustment_vat DECIMAL(15,2) NOT NULL DEFAULT 0,

  source_file VARCHAR(500),
  source_sheet VARCHAR(100),
  source_row INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rl_revenue_id ON rs_revenue_lines(revenue_id);
CREATE INDEX IF NOT EXISTS idx_rl_work_month ON rs_revenue_lines(work_id, month);
CREATE INDEX IF NOT EXISTS idx_rl_work_month_type ON rs_revenue_lines(work_id, month, revenue_type);

ALTER TABLE rs_revenue_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY rs_revenue_lines_select ON rs_revenue_lines FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'accountant', 'executive'))
);

CREATE POLICY rs_revenue_lines_all ON rs_revenue_lines FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'accountant'))
);
