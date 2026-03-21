-- 타임라인 편집 상태 저장 (순서, 트림, 트랜지션)
ALTER TABLE webtoonanimation_projects
  ADD COLUMN IF NOT EXISTS timeline_config jsonb;
