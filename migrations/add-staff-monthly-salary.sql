-- 스태프 월 급여 컬럼 추가
-- 참여 작품 매출 비례로 소속 작가 RS에서 차감
ALTER TABLE rs_staff ADD COLUMN IF NOT EXISTS monthly_salary DECIMAL(15,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN rs_staff.monthly_salary IS '월 급여 총액 (참여 작품 매출 비례로 작가 RS에서 차감)';
