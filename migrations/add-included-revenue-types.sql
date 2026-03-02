-- 작품-파트너별 정산 대상 수익유형 지정 (특약 관리)
ALTER TABLE rs_work_partners
  ADD COLUMN IF NOT EXISTS included_revenue_types TEXT[]
  DEFAULT '{domestic_paid,global_paid,domestic_ad,global_ad,secondary}';

COMMENT ON COLUMN rs_work_partners.included_revenue_types IS '정산 대상 수익유형 배열. 기본값 5개 전부. 특약 시 일부만 선택.';
