ALTER TABLE webtoonanimation_cuts
  ADD COLUMN IF NOT EXISTS gemini_colorize_prompt_ko text,
  ADD COLUMN IF NOT EXISTS gemini_expand_prompt_ko    text,
  ADD COLUMN IF NOT EXISTS gemini_other_frame_prompt_ko text;
