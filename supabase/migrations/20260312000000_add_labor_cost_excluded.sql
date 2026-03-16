-- 작품-파트너 계약에 인건비공제제외 필드 추가
ALTER TABLE rs_work_partners
  ADD COLUMN IF NOT EXISTS labor_cost_excluded BOOLEAN DEFAULT false NOT NULL;

COMMENT ON COLUMN rs_work_partners.labor_cost_excluded IS '인건비 공제 제외 여부. true면 해당 작품에 인건비가 배분되지 않음.';
