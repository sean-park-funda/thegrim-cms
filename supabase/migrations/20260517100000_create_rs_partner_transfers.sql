-- 작가 간 거래 (Partner Transfers)
-- 한 파트너에서 다른 파트너로 금액을 이체하는 관계를 추적
-- 예: 김운수 → 김배원 어시비 800,000원

CREATE TABLE IF NOT EXISTS rs_partner_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_partner_id UUID NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  to_partner_id UUID NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  work_id UUID REFERENCES rs_works(id) ON DELETE SET NULL,
  month TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rs_partner_transfers_from
  ON rs_partner_transfers (from_partner_id, month);
CREATE INDEX IF NOT EXISTS idx_rs_partner_transfers_to
  ON rs_partner_transfers (to_partner_id, month);
