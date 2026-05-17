-- 지급 조정 (Payment Adjustments)
-- 세금 계산 후 지급액에서 직접 차감/추가하는 항목
-- 정산 조정(settlement_adjustment)과 달리 수익정산에 영향 없음
-- 예: 대여금 상환, 선급금 공제

CREATE TABLE IF NOT EXISTS rs_payment_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rs_payment_adjustments_partner_month
  ON rs_payment_adjustments (partner_id, month);
