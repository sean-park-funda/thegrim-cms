-- ========================================
-- 레퍼런스 파일 기능 추가 마이그레이션
-- ========================================
-- 이 파일을 Supabase SQL Editor에서 실행하여 데이터베이스를 업데이트하세요.

-- 1. 레퍼런스 파일 테이블 생성
CREATE TABLE IF NOT EXISTS reference_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webtoon_id UUID NOT NULL REFERENCES webtoons(id) ON DELETE CASCADE,
  process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  file_size BIGINT,
  file_type VARCHAR(100),
  mime_type VARCHAR(100),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_reference_files_webtoon_id ON reference_files(webtoon_id);
CREATE INDEX IF NOT EXISTS idx_reference_files_process_id ON reference_files(process_id);

-- 3. 업데이트 트리거 추가
CREATE TRIGGER update_reference_files_updated_at BEFORE UPDATE ON reference_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 마이그레이션 완료
-- 이제 웹툰별로 레퍼런스 파일을 업로드하고 공정별로 관리할 수 있습니다.
