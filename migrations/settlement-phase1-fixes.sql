-- ========================================
-- RS 정산 시스템 Phase 1+2 수정 마이그레이션
-- 날짜: 2026-03-02
-- 설명: 검토 리포트 15개 이슈 중 Phase 1(Critical) + Phase 2(Medium) DB 변경
-- ========================================

-- ========================================
-- 1. 파트너 유형 확장 (Phase 1-2, 2-4)
-- individual_employee: 개인(임직원) — 근로소득공제 대상
-- individual_simple_tax: 개인(간이과세)
-- ========================================

ALTER TABLE rs_partners DROP CONSTRAINT IF EXISTS rs_partners_partner_type_check;
ALTER TABLE rs_partners ADD CONSTRAINT rs_partners_partner_type_check
  CHECK (partner_type IN ('individual', 'individual_employee', 'individual_simple_tax', 'domestic_corp', 'foreign_corp', 'naver'));

-- ========================================
-- 2. 파트너 신규 컬럼 (Phase 1-2, 2-5)
-- salary_deduction: 임직원 근로소득공제 금액
-- report_type: 신고구분 (세금계산서/사업소득/기타소득)
-- ========================================

ALTER TABLE rs_partners ADD COLUMN IF NOT EXISTS salary_deduction DECIMAL(15, 2) DEFAULT 0 NOT NULL;
ALTER TABLE rs_partners ADD COLUMN IF NOT EXISTS report_type VARCHAR(20) DEFAULT NULL;

-- ========================================
-- 3. 작품 연재기간 (Phase 2-6)
-- ========================================

ALTER TABLE rs_works ADD COLUMN IF NOT EXISTS serial_start_date DATE;
ALTER TABLE rs_works ADD COLUMN IF NOT EXISTS serial_end_date DATE;

-- ========================================
-- 4. 정산 기타공제 (Phase 2-9)
-- ========================================

ALTER TABLE rs_settlements ADD COLUMN IF NOT EXISTS insurance DECIMAL(15, 2) DEFAULT 0 NOT NULL;
ALTER TABLE rs_settlements ADD COLUMN IF NOT EXISTS other_deduction DECIMAL(15, 2) DEFAULT 0 NOT NULL;

-- ========================================
-- 5. 수익 시리즈광고 차액 (Phase 2-8)
-- ========================================

ALTER TABLE rs_revenues ADD COLUMN IF NOT EXISTS domestic_ad_diff DECIMAL(15, 2) DEFAULT 0 NOT NULL;

-- ========================================
-- 완료
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'RS 정산 시스템 Phase 1+2 마이그레이션 완료';
  RAISE NOTICE '  - rs_partners: partner_type 확장 (individual_employee, individual_simple_tax 추가)';
  RAISE NOTICE '  - rs_partners: salary_deduction, report_type 컬럼 추가';
  RAISE NOTICE '  - rs_works: serial_start_date, serial_end_date 컬럼 추가';
  RAISE NOTICE '  - rs_settlements: insurance, other_deduction 컬럼 추가';
  RAISE NOTICE '  - rs_revenues: domestic_ad_diff 컬럼 추가';
END $$;
