ALTER TABLE webtoonanimation_cuts
  ADD COLUMN IF NOT EXISTS video_duration integer DEFAULT 7;
