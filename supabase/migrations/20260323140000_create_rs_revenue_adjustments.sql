-- 작품 매출 조정 항목 테이블
-- 특정 작품의 월별 매출에 가감하여 RS 계산에 반영
CREATE TABLE IF NOT EXISTS rs_revenue_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rs_revenue_adjustments_work_month
  ON rs_revenue_adjustments (work_id, month);
