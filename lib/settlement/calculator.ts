import { PartnerType } from '@/lib/types/settlement';

/**
 * 세액 분리 계산 결과
 */
export interface TaxBreakdown {
  income_tax: number;   // 소득세 (개인 3%, 해외 20%)
  local_tax: number;    // 지방소득세 (소득세의 10%)
  vat: number;          // 부가세 (사업자 국내 10%, 네이버 10%)
  total: number;        // 세액 합계 (차감 대상)
}

/** 10원 미만 절사 */
const truncate10 = (n: number) => Math.floor(n / 10) * 10;

/**
 * 파트너 유형별 세액 분리 계산 (Excel 정산서 방식)
 *
 * - 개인/개인(임직원)/개인(간이과세): 소득세 3% (10원 미만 절사) + 지방세 (소득세×10%, 10원 미만 절사)
 * - 사업자(국내): 부가세 10% 별도 (차감 아님)
 * - 사업자(해외): 소득세 20% (10원 미만 절사) + 지방세 (소득세×10%, 10원 미만 절사)
 * - 네이버: 부가세 10% 별도 (차감 아님, 국내법인과 동일)
 */
export function calculateTax(amount: number, partnerType: string, taxType: string = 'standard'): TaxBreakdown {
  if (taxType === 'royalty') {
    const income_tax = Math.floor(amount * 10 / 110);
    const local_tax = Math.floor(amount * 1 / 110);
    return { income_tax, local_tax, vat: 0, total: income_tax + local_tax };
  }

  if (partnerType === 'individual' || partnerType === 'individual_employee' || partnerType === 'individual_simple_tax') {
    const income_tax = truncate10(amount * 0.03);
    const local_tax = truncate10(income_tax * 0.1);
    return { income_tax, local_tax, vat: 0, total: income_tax + local_tax };
  }
  if (partnerType === 'domestic_corp' || partnerType === 'naver') {
    return { income_tax: 0, local_tax: 0, vat: 0, total: 0 };
  }
  if (partnerType === 'foreign_corp') {
    const income_tax = truncate10(amount * 0.2);
    const local_tax = truncate10(income_tax * 0.1);
    return { income_tax, local_tax, vat: 0, total: income_tax + local_tax };
  }
  return { income_tax: 0, local_tax: 0, vat: 0, total: 0 };
}

/**
 * 예고료 추가 조건 컨텍스트
 */
export interface InsuranceContext {
  /** 연재종료일 — null/undefined면 연재 중으로 간주 */
  serialEndDate?: string | null;
  /** 파트너 신고구분 */
  reportType?: string | null;
  /** 정산 기준 월 (YYYY-MM) */
  month?: string;
  /** 외국인 여부 — true이면 예고료 대상 제외 */
  isForeign?: boolean;
}

/**
 * 예고료(고용보험) 계산 — Excel 수식 대응
 *
 * 대상 조건 (4가지 모두 충족):
 * 1. 개인 사업소득자 (individual 또는 individual_simple_tax)
 * 2. 수익정산금 50만원 초과
 * 3. 연재 미종료 (serial_end_date가 없거나 정산월 이후)
 * 4. 신고구분이 "세금계산서"가 아님
 *
 * 계산: MAX(ROUNDDOWN(수익정산금 × 0.75 × 0.008, -1), 6400)
 *   → 10원 단위 절사, 최소 6,400원
 * 참고: individual_employee(임직원)는 고용보험 대상 아님 (급여에서 처리)
 */
export function calculateInsurance(amount: number, partnerType: string, ctx?: InsuranceContext): number {
  // 조건 1: 개인/간이과세만
  if ((partnerType !== 'individual' && partnerType !== 'individual_simple_tax') || amount <= 0) return 0;

  if (ctx) {
    if (ctx.isForeign) return 0;
    // 조건 2: 50만원 초과
    if (amount <= 500000) return 0;
    // 조건 3: 연재 미종료
    if (ctx.serialEndDate && ctx.month) {
      if (new Date(ctx.serialEndDate) < new Date(ctx.month + '-01')) return 0;
    }
    // 조건 4: 세금계산서 제외
    if (ctx.reportType === '세금계산서') return 0;
  }

  // ROUNDDOWN(..., -1) = 10원 단위 절사, 최소 6,400원
  return Math.max(Math.floor(amount * 0.75 * 0.008 / 10) * 10, 6400);
}

/**
 * 파트너 유형별 기본 세율 (하위 호환용)
 */
export function getDefaultTaxRate(partnerType: PartnerType): number {
  switch (partnerType) {
    case 'individual':
    case 'individual_employee':
    case 'individual_simple_tax':
      return 0.033; // 3.3%
    case 'domestic_corp':
      return 0; // 0%
    case 'foreign_corp':
      return 0.22; // 22%
    case 'naver':
      return 0; // 0%
    default:
      return 0;
  }
}

