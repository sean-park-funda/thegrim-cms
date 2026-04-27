-- 예고료 월별 면제 테이블
CREATE TABLE IF NOT EXISTS rs_insurance_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  month text NOT NULL,  -- 'YYYY-MM' 형식
  reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (partner_id, month)
);

-- RLS
ALTER TABLE rs_insurance_exemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read insurance exemptions"
  ON rs_insurance_exemptions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert insurance exemptions"
  ON rs_insurance_exemptions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete insurance exemptions"
  ON rs_insurance_exemptions FOR DELETE TO authenticated USING (true);
