CREATE TABLE IF NOT EXISTS jungki_style_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode VARCHAR(10) NOT NULL CHECK (mode IN ('line', 'manga')),
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jungki_style_results_mode_created ON jungki_style_results (mode, created_at DESC);
