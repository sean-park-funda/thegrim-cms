-- MG 차감 홀딩 플래그
ALTER TABLE rs_work_partners
  ADD COLUMN IF NOT EXISTS mg_hold BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN rs_work_partners.mg_hold IS
  'When true, MG deduction is temporarily suspended for this work-partner.';

-- MG 홀딩 이력
CREATE TABLE IF NOT EXISTS rs_mg_hold_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('hold', 'release')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mg_hold_logs_partner_work
  ON rs_mg_hold_logs (partner_id, work_id, created_at DESC);
