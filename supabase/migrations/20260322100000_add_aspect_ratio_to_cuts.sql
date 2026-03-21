ALTER TABLE webtoonanimation_cuts
  ADD COLUMN IF NOT EXISTS aspect_ratio text DEFAULT '16:9';
