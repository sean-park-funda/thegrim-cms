import { PartnerType } from '@/lib/types/settlement';

/**
 * 파트너 유형별 기본 세율
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
  is_mg_applied: boolean;
  mg_balance: number; // 이전 MG 잔액
}

export interface CalculationResult {
  revenue_share: number;
  subtotal: number;
  tax_amount: number;
  mg_deduction: number;
  final_payment: number;
}

/**
 * RS 정산 계산
 *
 * revenue_share = gross_revenue * rs_rate
 * subtotal = revenue_share - production_cost + adjustment
 * tax_amount = subtotal * tax_rate
 * mg_deduction = min(mg_balance, max(0, subtotal - tax_amount))  // MG 적용 시
 * final_payment = subtotal - tax_amount - mg_deduction
 */
export function calculateSettlement(input: CalculationInput): CalculationResult {
  const revenue_share = Math.round(input.gross_revenue * input.rs_rate);
  const subtotal = revenue_share - input.production_cost + input.adjustment;
  const tax_amount = Math.round(subtotal * input.tax_rate);

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
    mg_deduction,
    final_payment,
  };
}
