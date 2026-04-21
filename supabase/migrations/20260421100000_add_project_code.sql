-- 작품별 프로젝트코드 (회계 계정별원장 매핑용)
ALTER TABLE rs_works ADD COLUMN IF NOT EXISTS project_code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rs_works_project_code ON rs_works(project_code) WHERE project_code IS NOT NULL;
