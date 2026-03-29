ALTER TABLE webtoonanimation_cuts
ADD COLUMN IF NOT EXISTS use_start_frame_bg_ref boolean DEFAULT false;
