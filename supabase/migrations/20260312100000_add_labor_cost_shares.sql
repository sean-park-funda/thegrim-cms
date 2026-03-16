-- 인건비 분담 테이블: 스태프/파트너 급여를 여러 파트너가 비율로 분담
CREATE TABLE IF NOT EXISTS rs_labor_cost_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(10) NOT NULL CHECK (source_type IN ('staff', 'partner')),
  source_id UUID NOT NULL,
  bearer_partner_id UUID NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  share_ratio DECIMAL(5,4) NOT NULL CHECK (share_ratio > 0 AND share_ratio <= 1),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id, bearer_partner_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_labor_cost_shares_source ON rs_labor_cost_shares(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_rs_labor_cost_shares_bearer ON rs_labor_cost_shares(bearer_partner_id);

COMMENT ON TABLE rs_labor_cost_shares IS '인건비 분담. source가 급여 주체, bearer가 비용 부담자.';
COMMENT ON COLUMN rs_labor_cost_shares.source_type IS 'staff: 스태프 급여, partner: 파트너 본인 급여';
COMMENT ON COLUMN rs_labor_cost_shares.share_ratio IS '분담 비율 (0~1). 미설정 시 employer/본인이 100% 부담.';
