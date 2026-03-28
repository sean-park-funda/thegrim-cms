-- rs_production_costs: 제작비용 별도 테이블 (rs_settlements에서 분리)
-- 확정 전에도 제작비용 입력값을 보존하기 위해 독립 테이블로 관리

CREATE TABLE IF NOT EXISTS rs_production_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  month text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(partner_id, work_id, month)
);

CREATE INDEX idx_rs_production_costs_month ON rs_production_costs(month);

-- 기존 rs_settlements에서 production_cost 데이터 마이그레이션
INSERT INTO rs_production_costs (partner_id, work_id, month, amount)
SELECT partner_id, work_id, month, production_cost
FROM rs_settlements
WHERE production_cost IS NOT NULL AND production_cost != 0
ON CONFLICT (partner_id, work_id, month) DO NOTHING;

-- rs_settlements에 snapshot 컬럼 추가 (확정 시 전체 statement 저장용)
ALTER TABLE rs_settlements ADD COLUMN IF NOT EXISTS snapshot jsonb;
