-- ========================================
-- 자유창작 작성자 정보 추가 마이그레이션
-- ========================================
-- 각 테이블에 created_by 필드를 추가하여 작성자를 추적합니다.
-- 베타테스트 이후 개인별 플레이그라운드 분리에 사용됩니다.

-- 1. free_creation_messages 테이블에 created_by 필드 추가
ALTER TABLE free_creation_messages 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- 기존 메시지에 대해 세션의 user_id를 created_by로 설정
UPDATE free_creation_messages m
SET created_by = s.user_id
FROM free_creation_sessions s
WHERE m.session_id = s.id AND m.created_by IS NULL;

-- 2. free_creation_recent_references 테이블에 created_by 필드 추가
ALTER TABLE free_creation_recent_references 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- 기존 레퍼런스에 대해 세션의 user_id를 created_by로 설정
UPDATE free_creation_recent_references r
SET created_by = s.user_id
FROM free_creation_sessions s
WHERE r.session_id = s.id AND r.created_by IS NULL;

-- 3. reference_files 테이블에 created_by 필드 추가
ALTER TABLE reference_files 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- 4. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_free_creation_messages_created_by ON free_creation_messages(created_by);
CREATE INDEX IF NOT EXISTS idx_free_creation_recent_refs_created_by ON free_creation_recent_references(created_by);
CREATE INDEX IF NOT EXISTS idx_reference_files_created_by ON reference_files(created_by);

-- ========================================
-- RLS 정책 업데이트 (선택적)
-- ========================================
-- 현재는 모든 사용자가 볼 수 있도록 유지
-- 베타테스트 이후 아래 정책을 활성화하여 본인 데이터만 표시

-- reference_files에 RLS 적용 (현재는 비활성화 상태)
-- ALTER TABLE reference_files ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Users can view own reference files" ON reference_files
--   FOR SELECT USING (created_by = auth.uid() OR created_by IS NULL);

-- CREATE POLICY "Users can insert reference files" ON reference_files
--   FOR INSERT WITH CHECK (true);

-- CREATE POLICY "Users can update own reference files" ON reference_files
--   FOR UPDATE USING (created_by = auth.uid() OR created_by IS NULL);

-- CREATE POLICY "Users can delete own reference files" ON reference_files
--   FOR DELETE USING (created_by = auth.uid() OR created_by IS NULL);
