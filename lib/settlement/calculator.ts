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
export function calculateTax(amount: number, partnerType: string): TaxBreakdown {
  if (partnerType === 'individual' || partnerType === 'individual_employee' || partnerType === 'individual_simple_tax') {
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
  if (partnerType === 'naver') {
    const vat = Math.round(amount * 0.1);
    return { income_tax: 0, local_tax: 0, vat, total: 0 }; // VAT는 차감이 아닌 별도 청구
  }
  return { income_tax: 0, local_tax: 0, vat: 0, total: 0 };
}

/**
 * 예고료(고용보험) 계산 — Excel 수식 대응
 *
 * 개인 사업소득자(individual, individual_simple_tax)이면서 수익정산금 > 0 일 때:
 * 수익정산금 × 0.75 × 0.008 (원 단위 절사)
 *
 * 참고: individual_employee(임직원)는 고용보험 대상 아님 (급여에서 처리)
 */
export function calculateInsurance(amount: number, partnerType: string): number {
  if ((partnerType !== 'individual' && partnerType !== 'individual_simple_tax') || amount <= 0) return 0;
  return Math.floor(amount * 0.75 * 0.008);
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

export interface CalculationInput {
  gross_revenue: number;
  rs_rate: number;
  mg_rs_rate: number | null;
  production_cost: number;
  adjustment: number;
  salary_deduction: number;
  other_deduction: number;
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
  insurance: number;
  mg_deduction: number;
  final_payment: number;
}

/**
 * RS 정산 계산
 *
 * effective_rate = MG 적용 시 mg_rs_rate (있으면), 아니면 rs_rate
 * revenue_share = gross_revenue * effective_rate
 * subtotal = revenue_share - production_cost + adjustment - salary_deduction
 * tax = calculateTax(subtotal, partner_type)
 * insurance = calculateInsurance(subtotal, partner_type)
 * mg_deduction = min(mg_balance, max(0, subtotal - tax - insurance))  // MG 적용 시
 * final_payment = subtotal - tax - insurance - mg_deduction - other_deduction
 */
export function calculateSettlement(input: CalculationInput): CalculationResult {
  // MG 적용 시 mg_rs_rate 사용
  const effectiveRate = input.is_mg_applied && input.mg_rs_rate != null
    ? input.mg_rs_rate
    : input.rs_rate;

  const revenue_share = Math.round(input.gross_revenue * effectiveRate);
  const subtotal = revenue_share - input.production_cost + input.adjustment - input.salary_deduction;
  const tax_breakdown = calculateTax(subtotal, input.partner_type);
  const tax_amount = tax_breakdown.total;
  const insurance = calculateInsurance(subtotal, input.partner_type);

  let mg_deduction = 0;
  if (input.is_mg_applied && input.mg_balance > 0) {
    const afterTaxAndInsurance = subtotal - tax_amount - insurance;
    mg_deduction = Math.min(input.mg_balance, Math.max(0, afterTaxAndInsurance));
  }

  const final_payment = subtotal - tax_amount - insurance - mg_deduction - input.other_deduction;

  return {
    revenue_share,
    subtotal,
    tax_amount,
    tax_breakdown,
    insurance,
    mg_deduction,
    final_payment,
  };
}
