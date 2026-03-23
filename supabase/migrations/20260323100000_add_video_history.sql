ALTER TABLE webtoonanimation_cuts
  ADD COLUMN IF NOT EXISTS video_history jsonb DEFAULT '[]'::jsonb;
