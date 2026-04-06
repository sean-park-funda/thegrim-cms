-- MG 시스템 재설계: pool 기반 → entry(지급건) 기반
-- 기존 테이블(rs_mg_pools, rs_mg_pool_balances, rs_mg_pool_works, rs_mg_balances)은 유지
-- 데이터 마이그레이션은 별도 진행

-- 1) MG 지급 건별
CREATE TABLE IF NOT EXISTS rs_mg_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES rs_partners(id),
  amount numeric NOT NULL DEFAULT 0,
  withheld_tax boolean NOT NULL DEFAULT false,
  contracted_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mg_entries_partner ON rs_mg_entries(partner_id);
CREATE INDEX idx_mg_entries_contracted ON rs_mg_entries(partner_id, contracted_at);

-- 2) MG ↔ 작품 연결 (대부분 1:1, 다중 작품 케이스 대응)
CREATE TABLE IF NOT EXISTS rs_mg_entry_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mg_entry_id uuid NOT NULL REFERENCES rs_mg_entries(id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES rs_works(id),
  UNIQUE(mg_entry_id, work_id)
);

CREATE INDEX idx_mg_entry_works_entry ON rs_mg_entry_works(mg_entry_id);
CREATE INDEX idx_mg_entry_works_work ON rs_mg_entry_works(work_id);

-- 3) MG 차감 내역
CREATE TABLE IF NOT EXISTS rs_mg_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mg_entry_id uuid NOT NULL REFERENCES rs_mg_entries(id) ON DELETE CASCADE,
  month text NOT NULL,  -- YYYY-MM
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mg_deductions_entry ON rs_mg_deductions(mg_entry_id);
CREATE INDEX idx_mg_deductions_month ON rs_mg_deductions(month);

-- RLS
ALTER TABLE rs_mg_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE rs_mg_entry_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE rs_mg_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON rs_mg_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON rs_mg_entry_works FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON rs_mg_deductions FOR ALL USING (true) WITH CHECK (true);
