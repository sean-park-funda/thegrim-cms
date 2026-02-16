-- =============================================
-- executive role 추가 (대표/경영진)
-- 콘텐츠 열람 + 회계 열람 (관리 X)
-- =============================================

-- 1) user_profiles role 제약조건 갱신
ALTER TABLE user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles
ADD CONSTRAINT user_profiles_role_check
CHECK (role IN ('admin', 'executive', 'manager', 'staff', 'viewer', 'accountant'));

-- 2) invitations role 제약조건 갱신
ALTER TABLE invitations
DROP CONSTRAINT IF EXISTS invitations_role_check;

ALTER TABLE invitations
ADD CONSTRAINT invitations_role_check
CHECK (role IN ('admin', 'executive', 'manager', 'staff', 'viewer', 'accountant'));

-- 3) RS 정산 테이블 SELECT 정책에 executive 추가
-- rs_works
DROP POLICY IF EXISTS "Admin and accountant can view rs_works" ON rs_works;
CREATE POLICY "Admin, executive and accountant can view rs_works"
  ON rs_works FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'executive', 'accountant')
    )
  );

-- rs_partners
DROP POLICY IF EXISTS "Admin and accountant can view rs_partners" ON rs_partners;
CREATE POLICY "Admin, executive and accountant can view rs_partners"
  ON rs_partners FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'executive', 'accountant')
    )
  );

-- rs_work_partners
DROP POLICY IF EXISTS "Admin and accountant can view rs_work_partners" ON rs_work_partners;
CREATE POLICY "Admin, executive and accountant can view rs_work_partners"
  ON rs_work_partners FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'executive', 'accountant')
    )
  );

-- rs_revenues
DROP POLICY IF EXISTS "Admin and accountant can view rs_revenues" ON rs_revenues;
CREATE POLICY "Admin, executive and accountant can view rs_revenues"
  ON rs_revenues FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'executive', 'accountant')
    )
  );

-- rs_settlements
DROP POLICY IF EXISTS "Admin and accountant can view rs_settlements" ON rs_settlements;
CREATE POLICY "Admin, executive and accountant can view rs_settlements"
  ON rs_settlements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'executive', 'accountant')
    )
  );

-- rs_mg_balances
DROP POLICY IF EXISTS "Admin and accountant can view rs_mg_balances" ON rs_mg_balances;
CREATE POLICY "Admin, executive and accountant can view rs_mg_balances"
  ON rs_mg_balances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'executive', 'accountant')
    )
  );

-- rs_upload_history
DROP POLICY IF EXISTS "Admin and accountant can view rs_upload_history" ON rs_upload_history;
CREATE POLICY "Admin, executive and accountant can view rs_upload_history"
  ON rs_upload_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'executive', 'accountant')
    )
  );

-- 4) 기존 회계 테이블 SELECT 정책에도 executive 추가
DROP POLICY IF EXISTS "Admin and accountant can view transactions" ON accounting_transactions;
CREATE POLICY "Admin, executive and accountant can view transactions"
  ON accounting_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'executive', 'accountant')
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can view categories" ON accounting_categories;
CREATE POLICY "Admin, executive and accountant can view categories"
  ON accounting_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'executive', 'accountant')
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can view budgets" ON webtoon_budgets;
CREATE POLICY "Admin, executive and accountant can view budgets"
  ON webtoon_budgets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'executive', 'accountant')
    )
  );

-- NOTE: INSERT/UPDATE/DELETE 정책은 변경하지 않음 (admin, accountant만 유지)
-- executive는 열람만 가능
