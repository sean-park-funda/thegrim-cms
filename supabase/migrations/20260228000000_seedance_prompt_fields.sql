-- Seedance 2.0 통합 프롬프트 지원을 위한 필드 추가
ALTER TABLE webtoonanimation_prompt_groups
  ADD COLUMN IF NOT EXISTS seedance_prompt TEXT,
  ADD COLUMN IF NOT EXISTS video_duration INTEGER DEFAULT 10;
