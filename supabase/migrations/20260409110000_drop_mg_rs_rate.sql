-- mg_rs_rate 컬럼 제거: rs_rate만 사용하도록 통일
ALTER TABLE rs_work_partners DROP COLUMN IF EXISTS mg_rs_rate;
