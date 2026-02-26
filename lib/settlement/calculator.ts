import { PartnerType } from '@/lib/types/settlement';

/**
 * 세액 분리 계산 결과
 */
export interface TaxBreakdown {
  income_tax: number;   // 소득세 (개인 3%, 해외 20%)
  local_tax: number;    // 지방소득세 (소득세의 10%)
  vat: number;          // 부가세 (사업자 국내 10%)
  total: number;        // 세액 합계 (차감 대상)
}

/** 10원 미만 절사 */
const truncate10 = (n: number) => Math.floor(n / 10) * 10;

/**
 * 파트너 유형별 세액 분리 계산 (Excel 정산서 방식)
 *
 * - 개인: 소득세 3% (10원 미만 절사) + 지방세 (소득세×10%, 10원 미만 절사)
 * - 사업자(국내): 부가세 10% 별도 (차감 아님)
 * - 사업자(해외): 소득세 20% (10원 미만 절사) + 지방세 (소득세×10%, 10원 미만 절사)
 */
export function calculateTax(amount: number, partnerType: string): TaxBreakdown {
  if (partnerType === 'individual') {
    const income_tax = truncate10(amount * 0.03);
    const local_tax = truncate10(income_tax * 0.1);
    return { income_tax, local_tax, vat: 0, total: income_tax + local_tax };
  }
  if (partnerType === 'domestic_corp') {
    const vat = Math.round(amount * 0.1);
    return { income_tax: 0, local_tax: 0, vat, total: 0 }; // VAT는 차감이 아닌 별도 청구
  }
  if (partnerType === 'foreign_corp') {
    const income_tax = truncate10(amount * 0.2);
    const local_tax = truncate10(income_tax * 0.1);
    return { income_tax, local_tax, vat: 0, total: income_tax + local_tax };
  }
  return { income_tax: 0, local_tax: 0, vat: 0, total: 0 };
}

/**
 * 예고료(고용보험) 계산 — Excel 수식 대응
 *
 * 개인 사업소득자(individual)이면서 수익정산금 > 0 일 때:
 * 수익정산금 × 0.75 × 0.008 (원 단위 절사)
 */
export function calculateInsurance(amount: number, partnerType: string): number {
  if (partnerType !== 'individual' || amount <= 0) return 0;
  return Math.floor(amount * 0.75 * 0.008);
}

/**
 * 파트너 유형별 기본 세율 (하위 호환용)
 */
export function getDefaultTaxRate(partnerType: PartnerType): number {
  switch (partnerType) {
    case 'individual':
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

export interface CalculationInput {
  gross_revenue: number;
  rs_rate: number;
  production_cost: number;
  adjustment: number;
  tax_rate: number;
  partner_type: string;
  is_mg_applied: boolean;
  mg_balance: number; // 이전 MG 잔액
}

export interface CalculationResult {
  revenue_share: number;
  subtotal: number;
  tax_amount: number;
  tax_breakdown: TaxBreakdown;
  mg_deduction: number;
  final_payment: number;
}

/**
 * RS 정산 계산
 *
 * revenue_share = gross_revenue * rs_rate
 * subtotal = revenue_share - production_cost + adjustment
 * tax = calculateTax(subtotal, partner_type)
 * mg_deduction = min(mg_balance, max(0, subtotal - tax))  // MG 적용 시
 * final_payment = subtotal - tax - mg_deduction
 */
export function calculateSettlement(input: CalculationInput): CalculationResult {
  const revenue_share = Math.round(input.gross_revenue * input.rs_rate);
  const subtotal = revenue_share - input.production_cost + input.adjustment;
  const tax_breakdown = calculateTax(subtotal, input.partner_type);
  const tax_amount = tax_breakdown.total;

  let mg_deduction = 0;
  if (input.is_mg_applied && input.mg_balance > 0) {
    const afterTax = subtotal - tax_amount;
    mg_deduction = Math.min(input.mg_balance, Math.max(0, afterTax));
  }

  const final_payment = subtotal - tax_amount - mg_deduction;

  return {
    revenue_share,
    subtotal,
    tax_amount,
    tax_breakdown,
    mg_deduction,
    final_payment,
  };
}
