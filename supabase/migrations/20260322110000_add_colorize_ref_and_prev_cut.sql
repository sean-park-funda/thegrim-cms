ALTER TABLE webtoonanimation_cuts
  ADD COLUMN IF NOT EXISTS colorize_reference_url text,
  ADD COLUMN IF NOT EXISTS use_prev_cut_as_start boolean DEFAULT false;
