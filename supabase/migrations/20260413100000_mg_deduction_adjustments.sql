-- MG 차감 조정 테이블
-- 작품별 MG 차감액에 수동 조정을 적용하기 위한 테이블
CREATE TABLE rs_mg_deduction_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mg_deduction_adj_partner_month
  ON rs_mg_deduction_adjustments(partner_id, month);
