-- MG 풀 재설계: 1:N MG-작품 관계를 지원하기 위한 새 테이블 생성 + 데이터 마이그레이션

-- =====================================================
-- 1. 새 테이블 생성
-- =====================================================

-- MG 풀 (계약 단위)
CREATE TABLE IF NOT EXISTS rs_mg_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES rs_partners(id) ON DELETE CASCADE,
  name text NOT NULL,
  initial_amount numeric NOT NULL DEFAULT 0,
  mg_rs_rate numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- MG 풀 ↔ 작품 연결
CREATE TABLE IF NOT EXISTS rs_mg_pool_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mg_pool_id uuid NOT NULL REFERENCES rs_mg_pools(id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES rs_works(id) ON DELETE CASCADE,
  mg_rs_rate numeric,
  UNIQUE(mg_pool_id, work_id)
);

-- MG 풀 잔액 이력 (월별)
CREATE TABLE IF NOT EXISTS rs_mg_pool_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mg_pool_id uuid NOT NULL REFERENCES rs_mg_pools(id) ON DELETE CASCADE,
  month text NOT NULL,
  previous_balance numeric NOT NULL DEFAULT 0,
  mg_added numeric NOT NULL DEFAULT 0,
  mg_deducted numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(mg_pool_id, month)
);

-- rs_work_partners에 mg_pool_id 컬럼 추가
ALTER TABLE rs_work_partners ADD COLUMN IF NOT EXISTS mg_pool_id uuid REFERENCES rs_mg_pools(id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_mg_pools_partner ON rs_mg_pools(partner_id);
CREATE INDEX IF NOT EXISTS idx_mg_pool_works_pool ON rs_mg_pool_works(mg_pool_id);
CREATE INDEX IF NOT EXISTS idx_mg_pool_works_work ON rs_mg_pool_works(work_id);
CREATE INDEX IF NOT EXISTS idx_mg_pool_balances_pool_month ON rs_mg_pool_balances(mg_pool_id, month);

-- RLS
ALTER TABLE rs_mg_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE rs_mg_pool_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE rs_mg_pool_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rs_mg_pools_auth" ON rs_mg_pools FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "rs_mg_pool_works_auth" ON rs_mg_pool_works FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "rs_mg_pool_balances_auth" ON rs_mg_pool_balances FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 2. 기존 데이터 마이그레이션: rs_mg_balances → rs_mg_pools + rs_mg_pool_works + rs_mg_pool_balances
-- =====================================================

-- 2a. 기존 (partner_id, work_id) 조합별로 MG 풀 생성
-- 각 작품별 최대 잔액(첫 달의 previous_balance + mg_added)을 initial_amount로 설정
INSERT INTO rs_mg_pools (id, partner_id, name, initial_amount, mg_rs_rate)
SELECT
  gen_random_uuid(),
  wp.partner_id,
  COALESCE(p.name, '') || ' - ' || COALESCE(w.name, ''),
  COALESCE(
    (SELECT MAX(mb.previous_balance + mb.mg_added)
     FROM rs_mg_balances mb
     WHERE mb.partner_id = wp.partner_id AND mb.work_id = wp.work_id),
    0
  ),
  wp.mg_rs_rate
FROM rs_work_partners wp
JOIN rs_partners p ON p.id = wp.partner_id
JOIN rs_works w ON w.id = wp.work_id
WHERE wp.is_mg_applied = true
ON CONFLICT DO NOTHING;

-- 2b. rs_mg_pool_works 생성 (풀 ↔ 작품 연결)
INSERT INTO rs_mg_pool_works (mg_pool_id, work_id, mg_rs_rate)
SELECT pool.id, wp.work_id, wp.mg_rs_rate
FROM rs_work_partners wp
JOIN rs_mg_pools pool ON pool.partner_id = wp.partner_id
  AND pool.name = COALESCE(
    (SELECT p2.name FROM rs_partners p2 WHERE p2.id = wp.partner_id),
    ''
  ) || ' - ' || COALESCE(
    (SELECT w2.name FROM rs_works w2 WHERE w2.id = wp.work_id),
    ''
  )
WHERE wp.is_mg_applied = true
ON CONFLICT (mg_pool_id, work_id) DO NOTHING;

-- 2c. rs_work_partners.mg_pool_id 매핑
UPDATE rs_work_partners wp
SET mg_pool_id = pw.mg_pool_id
FROM rs_mg_pool_works pw
WHERE wp.work_id = pw.work_id
  AND wp.is_mg_applied = true
  AND EXISTS (
    SELECT 1 FROM rs_mg_pools pool
    WHERE pool.id = pw.mg_pool_id AND pool.partner_id = wp.partner_id
  );

-- 2d. rs_mg_pool_balances에 기존 이력 이전
INSERT INTO rs_mg_pool_balances (mg_pool_id, month, previous_balance, mg_added, mg_deducted, current_balance, note)
SELECT
  pool.id,
  mb.month,
  mb.previous_balance,
  mb.mg_added,
  mb.mg_deducted,
  mb.current_balance,
  mb.note
FROM rs_mg_balances mb
JOIN rs_work_partners wp ON wp.partner_id = mb.partner_id AND wp.work_id = mb.work_id AND wp.is_mg_applied = true
JOIN rs_mg_pools pool ON pool.partner_id = mb.partner_id
  AND pool.name = COALESCE(
    (SELECT p2.name FROM rs_partners p2 WHERE p2.id = mb.partner_id),
    ''
  ) || ' - ' || COALESCE(
    (SELECT w2.name FROM rs_works w2 WHERE w2.id = mb.work_id),
    ''
  )
ON CONFLICT (mg_pool_id, month) DO NOTHING;
