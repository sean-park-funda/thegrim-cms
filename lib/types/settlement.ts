// RS 정산 시스템 타입 정의

export type RevenueType = 'domestic_paid' | 'global_paid' | 'domestic_ad' | 'global_ad' | 'secondary';

export type ContractType = 'exclusive' | 'non_exclusive' | 'management';
export type SettlementLevel = 'work' | 'partner';
export type PartnerType = 'individual' | 'individual_employee' | 'individual_simple_tax' | 'domestic_corp' | 'foreign_corp' | 'naver';
export type ReportType = '세금계산서' | '사업소득' | '기타소득';
export type SettlementStatus = 'draft' | 'confirmed' | 'paid';

export interface RsWork {
  id: string;
  name: string;
  naver_name: string | null;
  contract_type: ContractType;
  settlement_level: SettlementLevel;
  is_active: boolean;
  serial_start_date: string | null;
  serial_end_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface RsPartner {
  id: string;
  name: string;
  company_name: string | null;
  partner_type: PartnerType;
  tax_id: string | null;
  tax_rate: number;
  salary_deduction: number;
  report_type: ReportType | null;
  bank_name: string | null;
  bank_account: string | null;
  email: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface RsWorkPartner {
  id: string;
  work_id: string;
  partner_id: string;
  rs_rate: number;
  role: string;
  is_mg_applied: boolean;
  note: string | null;
  pen_name: string | null;
  vat_type: string | null;
  mg_rs_rate: number | null;
  contract_category: string | null;
  contract_doc_name: string | null;
  contract_signed_date: string | null;
  contract_period: string | null;
  contract_end_date: string | null;
  created_at: string;
  updated_at: string;
  // joined
  work?: RsWork;
  partner?: RsPartner;
}

export interface RsRevenue {
  id: string;
  work_id: string;
  month: string; // YYYY-MM
  domestic_paid: number;
  global_paid: number;
  domestic_ad: number;
  domestic_ad_diff: number;
  global_ad: number;
  secondary: number;
  total: number; // generated column
  note: string | null;
  created_at: string;
  updated_at: string;
  // joined
  work?: RsWork;
}

export interface RsSettlement {
  id: string;
  month: string;
  partner_id: string;
  work_id: string;
  gross_revenue: number;
  rs_rate: number;
  revenue_share: number;
  production_cost: number;
  adjustment: number;
  tax_rate: number;
  tax_amount: number;
  insurance: number;
  mg_deduction: number;
  other_deduction: number;
  final_payment: number;
  status: SettlementStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  // joined
  partner?: RsPartner;
  work?: RsWork;
}

export interface RsMgBalance {
  id: string;
  month: string;
  partner_id: string;
  work_id: string;
  previous_balance: number;
  mg_added: number;
  mg_deducted: number;
  current_balance: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  // joined
  partner?: RsPartner;
  work?: RsWork;
}

export interface RsUploadHistory {
  id: string;
  month: string;
  revenue_type: RevenueType;
  file_name: string;
  total_amount: number;
  matched_count: number;
  unmatched_count: number;
  uploaded_by: string;
  created_at: string;
}

// 파싱 결과 타입
export interface ParsedRevenueRow {
  work_name: string;
  amount: number;
}

export interface ExcelParseResult {
  rows: ParsedRevenueRow[];
  total_amount: number;
  errors: string[];
  /** 글로벌유료 소급분 (Prior Period Adjustment) 작품별 금액 */
  adjustments?: ParsedRevenueRow[];
}
