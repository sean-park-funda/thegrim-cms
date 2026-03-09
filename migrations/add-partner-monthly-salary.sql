-- rs_partners에 급여 수령 여부 플래그 추가
ALTER TABLE rs_partners
ADD COLUMN IF NOT EXISTS has_salary boolean DEFAULT false;

-- 파트너 본인의 월별 급여 테이블
CREATE TABLE IF NOT EXISTS rs_partner_salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  month text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(partner_id, month)
);

CREATE INDEX IF NOT EXISTS idx_rs_partner_salaries_partner_month
  ON rs_partner_salaries(partner_id, month);
