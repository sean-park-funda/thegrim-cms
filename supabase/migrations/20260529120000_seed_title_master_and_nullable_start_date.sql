-- 준비중 작품은 start_date가 없을 수 있음
ALTER TABLE title_master ALTER COLUMN start_date DROP NOT NULL;
