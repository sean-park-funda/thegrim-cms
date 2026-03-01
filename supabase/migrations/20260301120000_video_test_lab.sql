-- Video Test Lab: 다양한 모델 테스트 결과 저장
CREATE TABLE IF NOT EXISTS webtoonanimation_video_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES webtoonanimation_projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  input_mode TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  input_cut_indices INTEGER[] NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 4,
  aspect_ratio VARCHAR(10) NOT NULL DEFAULT '16:9',
  status TEXT NOT NULL DEFAULT 'pending',
  video_path TEXT,
  video_url TEXT,
  error_message TEXT,
  elapsed_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_video_tests_project
  ON webtoonanimation_video_tests(project_id, created_at DESC);
