-- category(text) → categories(text[]) 변환
-- 기존 단일값을 배열로 자동 이전

ALTER TABLE modusign_contracts
  ADD COLUMN IF NOT EXISTS categories text[];

-- 기존 category 값을 categories 배열로 복사
UPDATE modusign_contracts
SET categories = ARRAY[category]
WHERE category IS NOT NULL AND categories IS NULL;

COMMENT ON COLUMN modusign_contracts.categories IS 'AI 분석 또는 수동 지정 카테고리 목록 (복수 가능). category 컬럼은 하위호환용으로 유지.';
