-- 작품-파트너 연결 테이블에 계약 관련 필드 추가
ALTER TABLE rs_work_partners ADD COLUMN IF NOT EXISTS pen_name VARCHAR;
ALTER TABLE rs_work_partners ADD COLUMN IF NOT EXISTS vat_type VARCHAR;
ALTER TABLE rs_work_partners ADD COLUMN IF NOT EXISTS mg_rs_rate NUMERIC;
ALTER TABLE rs_work_partners ADD COLUMN IF NOT EXISTS contract_category VARCHAR;
ALTER TABLE rs_work_partners ADD COLUMN IF NOT EXISTS contract_doc_name TEXT;
ALTER TABLE rs_work_partners ADD COLUMN IF NOT EXISTS contract_signed_date DATE;
ALTER TABLE rs_work_partners ADD COLUMN IF NOT EXISTS contract_period TEXT;
ALTER TABLE rs_work_partners ADD COLUMN IF NOT EXISTS contract_end_date DATE;
