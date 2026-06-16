-- PDF 분석 추적 컬럼 추가
ALTER TABLE modusign_contracts
  ADD COLUMN IF NOT EXISTS pdf_model  text,
  ADD COLUMN IF NOT EXISTS pdf_error  text;
