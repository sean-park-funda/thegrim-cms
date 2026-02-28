-- 웹툰 애니메이션 기본 테이블 (존재하지 않으면 생성)
CREATE TABLE IF NOT EXISTS webtoonanimation_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) DEFAULT '새 프로젝트',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webtoonanimation_cuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES webtoonanimation_projects(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  file_name VARCHAR(255),
  file_path TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_cuts_project_order ON webtoonanimation_cuts(project_id, order_index);

CREATE TABLE IF NOT EXISTS webtoonanimation_prompt_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES webtoonanimation_projects(id) ON DELETE CASCADE,
  range_start INTEGER NOT NULL,
  range_end INTEGER NOT NULL,
  storyboard_image_path TEXT,
  aspect_ratio VARCHAR(10) DEFAULT '16:9',
  seedance_prompt TEXT,
  video_duration INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_prompt_groups_project ON webtoonanimation_prompt_groups(project_id);

CREATE TABLE IF NOT EXISTS webtoonanimation_cut_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES webtoonanimation_prompt_groups(id) ON DELETE CASCADE,
  cut_index INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  camera TEXT,
  continuity TEXT DEFAULT 'new scene',
  duration NUMERIC(4,1) DEFAULT 4 CHECK (duration > 0 AND duration <= 12),
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, cut_index)
);
CREATE INDEX IF NOT EXISTS idx_wa_cut_prompts_group ON webtoonanimation_cut_prompts(group_id, cut_index);

-- 세그먼트 기반 영상 생성 테이블
CREATE TABLE IF NOT EXISTS webtoonanimation_video_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES webtoonanimation_prompt_groups(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  start_cut_index INTEGER NOT NULL,
  end_cut_index INTEGER,                              -- NULL = 시작 프레임만 (끝 프레임 없이)
  prompt TEXT NOT NULL DEFAULT '',
  api_provider TEXT NOT NULL DEFAULT 'veo',            -- 'veo' | 'seedance15' | 'ltx2'
  duration_seconds INTEGER NOT NULL DEFAULT 4,
  aspect_ratio VARCHAR(10) NOT NULL DEFAULT '16:9',
  status TEXT NOT NULL DEFAULT 'pending',              -- pending | generating | completed | failed
  video_path TEXT,                                     -- Supabase Storage 경로
  video_url TEXT,                                      -- 공개 URL
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, segment_index)
);
CREATE INDEX IF NOT EXISTS idx_wa_video_segments_group ON webtoonanimation_video_segments(group_id, segment_index);
