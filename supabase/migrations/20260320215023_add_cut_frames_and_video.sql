ALTER TABLE webtoonanimation_cuts
  ADD COLUMN IF NOT EXISTS color_image_url text,
  ADD COLUMN IF NOT EXISTS end_frame_url text,
  ADD COLUMN IF NOT EXISTS start_frame_url text,
  ADD COLUMN IF NOT EXISTS comfyui_video_url text;
