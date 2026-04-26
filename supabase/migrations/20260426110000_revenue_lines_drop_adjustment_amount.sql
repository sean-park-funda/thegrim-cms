-- adjustment_amount 컬럼 제거: 공급가/부가세를 각각 독립 조정
ALTER TABLE rs_revenue_lines DROP COLUMN IF EXISTS adjustment_amount;
