-- 범용 정산 조정 항목 테이블
-- 기존 rs_settlements.adjustment / other_deduction 단일 필드를 대체
CREATE TABLE IF NOT EXISTS rs_settlement_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rs_settlement_adjustments_partner_month
  ON rs_settlement_adjustments (partner_id, month);

-- 기존 adjustment / other_deduction 데이터를 새 테이블로 마이그레이션
INSERT INTO rs_settlement_adjustments (partner_id, month, label, amount)
SELECT partner_id, month, '조정액', adjustment
FROM rs_settlements
WHERE adjustment != 0;

INSERT INTO rs_settlement_adjustments (partner_id, month, label, amount)
SELECT partner_id, month, '기타공제', -other_deduction
FROM rs_settlements
WHERE other_deduction != 0;

-- 기존 컬럼 제거
ALTER TABLE rs_settlements DROP COLUMN IF EXISTS adjustment;
ALTER TABLE rs_settlements DROP COLUMN IF EXISTS other_deduction;
