ALTER TABLE webtoonanimation_cuts
  ADD COLUMN IF NOT EXISTS frame_role text DEFAULT 'end',
  ADD COLUMN IF NOT EXISTS use_colorize boolean DEFAULT true;
