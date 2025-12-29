-- ========================================
-- 웹툰 제작 공정 관리 CMS 데이터베이스 스키마
-- ========================================

-- 1. 웹툰 테이블
CREATE TABLE IF NOT EXISTS webtoons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  status VARCHAR(50) DEFAULT 'active',
  unit_type VARCHAR(10) DEFAULT 'cut' CHECK (unit_type IN ('cut', 'page')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 회차 테이블
CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webtoon_id UUID NOT NULL REFERENCES webtoons(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'in_progress',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(webtoon_id, episode_number)
);

-- 3. 컷 테이블
CREATE TABLE IF NOT EXISTS cuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  cut_number INTEGER NOT NULL,
  title VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(episode_id, cut_number)
);

-- 4. 공정 테이블 (동적으로 추가 가능)
CREATE TABLE IF NOT EXISTS processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  color VARCHAR(7) DEFAULT '#3B82F6',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 파일 테이블
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cut_id UUID NOT NULL REFERENCES cuts(id) ON DELETE CASCADE,
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
  prompt TEXT,
  created_by UUID REFERENCES user_profiles(id),
  source_file_id UUID REFERENCES files(id),
  is_temp BOOLEAN DEFAULT false NOT NULL,
  is_public BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 레퍼런스 파일 테이블 (웹툰별)
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

-- 7. 캐릭터 폴더 테이블 (웹툰별 캐릭터 분류용)
CREATE TABLE IF NOT EXISTS character_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webtoon_id UUID NOT NULL REFERENCES webtoons(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. 캐릭터 테이블 (웹툰별)
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webtoon_id UUID NOT NULL REFERENCES webtoons(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES character_folders(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. 캐릭터 시트 테이블
CREATE TABLE IF NOT EXISTS character_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  file_size BIGINT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 인덱스 생성
-- ========================================

-- 검색 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_episodes_webtoon_id ON episodes(webtoon_id);
CREATE INDEX IF NOT EXISTS idx_cuts_episode_id ON cuts(episode_id);
CREATE INDEX IF NOT EXISTS idx_files_cut_id ON files(cut_id);
CREATE INDEX IF NOT EXISTS idx_files_process_id ON files(process_id);
CREATE INDEX IF NOT EXISTS idx_files_created_by ON files(created_by);
CREATE INDEX IF NOT EXISTS idx_files_source_file_id ON files(source_file_id);
CREATE INDEX IF NOT EXISTS idx_processes_order ON processes(order_index);
CREATE INDEX IF NOT EXISTS idx_reference_files_webtoon_id ON reference_files(webtoon_id);
CREATE INDEX IF NOT EXISTS idx_reference_files_process_id ON reference_files(process_id);
CREATE INDEX IF NOT EXISTS idx_character_folders_webtoon_id ON character_folders(webtoon_id);
CREATE INDEX IF NOT EXISTS idx_characters_webtoon_id ON characters(webtoon_id);
CREATE INDEX IF NOT EXISTS idx_characters_folder_id ON characters(folder_id);
CREATE INDEX IF NOT EXISTS idx_character_sheets_character_id ON character_sheets(character_id);

-- Full-text search를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_files_description ON files USING GIN (to_tsvector('korean', COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_webtoons_search ON webtoons USING GIN (to_tsvector('korean', title || ' ' || COALESCE(description, '')));

-- metadata JSONB 필드 검색을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_files_metadata ON files USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_files_metadata_scene_summary ON files USING GIN (to_tsvector('simple', COALESCE(metadata->>'scene_summary', '')));

-- ========================================
-- 기본 공정 데이터 삽입
-- ========================================

INSERT INTO processes (name, description, order_index, color) VALUES
  ('글콘티', '글로 작성된 콘티', 1, '#EF4444'),
  ('연출아이디어', '연출 아이디어 스케치', 2, '#F59E0B'),
  ('콘티', '콘티 작업', 3, '#10B981'),
  ('러프스케치', '러프 스케치 단계', 4, '#3B82F6'),
  ('라인', '선화 작업', 5, '#8B5CF6'),
  ('채색', '채색 작업', 6, '#EC4899')
ON CONFLICT (name) DO NOTHING;

-- ========================================
-- 업데이트 트리거 함수
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 각 테이블에 업데이트 트리거 적용
CREATE TRIGGER update_webtoons_updated_at BEFORE UPDATE ON webtoons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_episodes_updated_at BEFORE UPDATE ON episodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cuts_updated_at BEFORE UPDATE ON cuts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processes_updated_at BEFORE UPDATE ON processes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reference_files_updated_at BEFORE UPDATE ON reference_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_character_folders_updated_at BEFORE UPDATE ON character_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_characters_updated_at BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_character_sheets_updated_at BEFORE UPDATE ON character_sheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Storage Bucket 설정 (Supabase Storage)
-- ========================================

-- 파일 저장을 위한 버킷 생성 (Supabase 대시보드에서 실행)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('webtoon-files', 'webtoon-files', true);

-- ========================================
-- Full-Text Search RPC 함수
-- ========================================

-- 파일 검색을 위한 Full-Text Search 함수
-- description 필드에 대해 simple 설정을 사용한 검색 수행
-- 클라이언트에서 검색어를 여러 형태로 확장하여 어간이 같은 단어도 검색 가능
CREATE OR REPLACE FUNCTION search_files_fulltext(search_query TEXT)
RETURNS TABLE (
  id UUID,
  cut_id UUID,
  process_id UUID,
  file_name VARCHAR(255),
  file_path TEXT,
  storage_path TEXT,
  file_size BIGINT,
  file_type VARCHAR(100),
  mime_type VARCHAR(100),
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.cut_id,
    f.process_id,
    f.file_name,
    f.file_path,
    f.storage_path,
    f.file_size,
    f.file_type,
    f.mime_type,
    f.description,
    f.metadata,
    f.created_at,
    f.updated_at
  FROM files f
  WHERE
    -- Full-Text Search: description 필드에 대해 simple 설정 사용 (형태소 분석 없이)
    -- 클라이언트에서 검색어를 여러 형태로 확장하여 검색
    (
      f.description IS NOT NULL
      AND f.description != ''
      AND (
        -- 정확한 매칭
        f.description ILIKE '%' || search_query || '%'
        -- Full-Text Search (simple 설정 사용)
        OR to_tsvector('simple', f.description) @@ plainto_tsquery('simple', search_query)
      )
    )
    -- file_name에 대해서는 기존 ilike 검색 유지 (파일명은 정확한 매칭이 중요)
    OR f.file_name ILIKE '%' || search_query || '%'
    -- metadata.scene_summary 검색
    OR (
      f.metadata IS NOT NULL
      AND f.metadata->>'scene_summary' IS NOT NULL
      AND (
        f.metadata->>'scene_summary' ILIKE '%' || search_query || '%'
        OR to_tsvector('simple', f.metadata->>'scene_summary') @@ plainto_tsquery('simple', search_query)
      )
    )
    -- metadata.tags 검색 (배열 내 태그 검색)
    OR (
      f.metadata IS NOT NULL
      AND f.metadata->'tags' IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(f.metadata->'tags') AS tag
        WHERE tag ILIKE '%' || search_query || '%'
      )
    )
  ORDER BY f.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ========================================
-- Row Level Security (RLS) 정책
-- ========================================

-- 개발 초기에는 RLS를 비활성화하고, 추후 인증 구현 시 활성화
-- ALTER TABLE webtoons ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE cuts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- 모든 사용자에게 읽기/쓰기 권한 부여 (개발용)
-- CREATE POLICY "Public access" ON webtoons FOR ALL USING (true);
-- CREATE POLICY "Public access" ON episodes FOR ALL USING (true);
-- CREATE POLICY "Public access" ON cuts FOR ALL USING (true);
-- CREATE POLICY "Public access" ON processes FOR ALL USING (true);
-- CREATE POLICY "Public access" ON files FOR ALL USING (true);


