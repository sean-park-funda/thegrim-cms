-- 컷별 기획 + 4종 프롬프트 필드 추가
ALTER TABLE webtoonanimation_cuts
  ADD COLUMN IF NOT EXISTS cut_synopsis text,
  ADD COLUMN IF NOT EXISTS frame_strategy text, -- 'enter'|'exit'|'expression'|'empty_to_action'
  ADD COLUMN IF NOT EXISTS gemini_colorize_prompt text,
  ADD COLUMN IF NOT EXISTS gemini_expand_prompt text,
  ADD COLUMN IF NOT EXISTS gemini_start_frame_prompt text,
  ADD COLUMN IF NOT EXISTS video_prompt text;

-- 프로젝트 캐릭터 설정 필드 추가
ALTER TABLE webtoonanimation_projects
  ADD COLUMN IF NOT EXISTS character_settings jsonb,
  ADD COLUMN IF NOT EXISTS character_ref_url text;
