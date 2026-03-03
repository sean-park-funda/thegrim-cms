-- RS 스태프/어시스턴트 관리 시스템

CREATE TABLE IF NOT EXISTS rs_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  employer_type VARCHAR(10) NOT NULL DEFAULT 'author'
    CHECK (employer_type IN ('author', 'company')),
  employer_partner_id UUID REFERENCES rs_partners(id) ON DELETE SET NULL,
  phone VARCHAR(20),
  email VARCHAR(200),
  bank_name VARCHAR(50),
  bank_account VARCHAR(50),
  is_active BOOLEAN DEFAULT true NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_staff_employer ON rs_staff(employer_type, employer_partner_id);

CREATE TABLE IF NOT EXISTS rs_staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES rs_staff(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  monthly_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  start_month VARCHAR(7),
  end_month VARCHAR(7),
  is_active BOOLEAN DEFAULT true NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, work_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_staff_assignments_staff ON rs_staff_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_rs_staff_assignments_work ON rs_staff_assignments(work_id);
