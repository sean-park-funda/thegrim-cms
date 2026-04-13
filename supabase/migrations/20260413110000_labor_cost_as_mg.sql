-- 인건비 부담 비율 직접 지정 (null이면 기존 rs_rate 비율 사용)
ALTER TABLE rs_labor_cost_item_partners
  ADD COLUMN IF NOT EXISTS burden_ratio NUMERIC(5, 4) DEFAULT NULL;

COMMENT ON COLUMN rs_labor_cost_item_partners.burden_ratio IS
  'Override burden ratio (0~1). NULL = use rs_rate proportion.';

-- 인건비를 MG로 전환하는 플래그
ALTER TABLE rs_work_partners
  ADD COLUMN IF NOT EXISTS labor_cost_as_mg BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN rs_work_partners.labor_cost_as_mg IS
  'When true, labor cost is not deducted from revenue but recorded as MG entry on confirm.';
