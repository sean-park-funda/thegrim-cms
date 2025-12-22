-- ========================================
-- 쇼츠 영상 생성 기능 데이터베이스 스키마
-- ========================================

-- 1. 쇼츠 프로젝트 테이블
CREATE TABLE IF NOT EXISTS shorts_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255),
  script TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'characters_set', 'grid_generated', 'script_generated', 'video_generating', 'completed', 'error')),
  video_mode VARCHAR(20) DEFAULT 'cut-to-cut' CHECK (video_mode IN ('cut-to-cut', 'per-cut')),
  grid_size VARCHAR(10) DEFAULT '3x3' CHECK (grid_size IN ('2x2', '3x3')),
  grid_image_path TEXT,
  grid_image_base64 TEXT,
  video_script JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 쇼츠 등장인물 테이블
CREATE TABLE IF NOT EXISTS shorts_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES shorts_projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  image_path TEXT,
  storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 쇼츠 씬 테이블 (분할된 패널 이미지 + 생성된 영상)
CREATE TABLE IF NOT EXISTS shorts_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES shorts_projects(id) ON DELETE CASCADE,
  scene_index INTEGER NOT NULL,
  start_panel_path TEXT,
  end_panel_path TEXT,
  video_prompt TEXT,
  duration INTEGER DEFAULT 4 CHECK (duration IN (4, 6, 8)),
  video_path TEXT,
  video_storage_path TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'error')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, scene_index)
);

-- ========================================
-- 인덱스 생성
-- ========================================

CREATE INDEX IF NOT EXISTS idx_shorts_projects_status ON shorts_projects(status);
CREATE INDEX IF NOT EXISTS idx_shorts_projects_created_at ON shorts_projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shorts_characters_project_id ON shorts_characters(project_id);
CREATE INDEX IF NOT EXISTS idx_shorts_scenes_project_id ON shorts_scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_shorts_scenes_status ON shorts_scenes(status);

-- ========================================
-- 업데이트 트리거 적용
-- ========================================

CREATE TRIGGER update_shorts_projects_updated_at BEFORE UPDATE ON shorts_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shorts_characters_updated_at BEFORE UPDATE ON shorts_characters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shorts_scenes_updated_at BEFORE UPDATE ON shorts_scenes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Storage Bucket 설정 (Supabase Storage)
-- ========================================
-- 영상 저장을 위한 버킷 생성 (Supabase 대시보드에서 실행)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('shorts-videos', 'shorts-videos', true);
