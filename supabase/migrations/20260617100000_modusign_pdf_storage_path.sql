-- PDF를 Supabase Storage에 저장한 경로
ALTER TABLE modusign_contracts
  ADD COLUMN IF NOT EXISTS pdf_storage_path text;
