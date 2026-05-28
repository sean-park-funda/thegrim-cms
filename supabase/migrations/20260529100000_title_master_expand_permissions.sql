-- title_master INSERT/UPDATE/DELETE 권한 확대: manager, executive 추가
DROP POLICY IF EXISTS "title_master_insert" ON title_master;
DROP POLICY IF EXISTS "title_master_update" ON title_master;
DROP POLICY IF EXISTS "title_master_delete" ON title_master;

CREATE POLICY "title_master_insert" ON title_master
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'accountant', 'executive', 'strategy', 'manager')
    )
  );

CREATE POLICY "title_master_update" ON title_master
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'accountant', 'executive', 'strategy', 'manager')
    )
  );

CREATE POLICY "title_master_delete" ON title_master
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'accountant', 'executive', 'strategy', 'manager')
    )
  );
