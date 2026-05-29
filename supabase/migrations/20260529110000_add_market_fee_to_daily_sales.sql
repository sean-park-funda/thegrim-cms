-- rs_daily_sales에 market_fee(마켓수수료) 컬럼 추가
-- 네이버 프랜즈에서 실제 수수료 데이터를 저장하기 위함
ALTER TABLE rs_daily_sales
  ADD COLUMN IF NOT EXISTS market_fee NUMERIC DEFAULT 0;
