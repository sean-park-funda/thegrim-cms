import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { calculateTax, calculateInsurance } from '@/lib/settlement/calculator';
import * as XLSX from 'xlsx';

// GET /api/accounting/settlement/export - 엑셀 내보내기
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canViewAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const type = searchParams.get('type') || 'settlement';

    if (!month) {
      return NextResponse.json({ error: '월은 필수입니다.' }, { status: 400 });
    }

    const workbook = XLSX.utils.book_new();

    if (type === 'revenue') {
      // 수익 내보내기
      const { data: revenues } = await supabase
        .from('rs_revenues')
        .select('*, work:rs_works(name)')
        .eq('month', month)
        .order('work_id');

      const rows = (revenues || []).map(r => ({
        '작품명': r.work?.name || '',
        '국내유료수익': Number(r.domestic_paid),
        '글로벌유료수익': Number(r.global_paid),
        '국내광고': Number(r.domestic_ad),
        '국내광고차액': Number(r.domestic_ad_diff),
        '글로벌광고': Number(r.global_ad),
        '2차사업': Number(r.secondary),
        '합계': Number(r.total),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, '매출액 집계');
    } else {
      // 정산 내보내기
      const { data: settlements } = await supabase
        .from('rs_settlements')
        .select('*, partner:rs_partners(name, company_name), work:rs_works(name)')
        .eq('month', month)
        .order('partner_id');

      const rows = (settlements || []).map(s => ({
        '작품명': s.work?.name || '',
        '파트너': s.partner?.name || '',
        '회사명': s.partner?.company_name || '',
        '총매출': Number(s.gross_revenue),
        'RS비율': `${(Number(s.rs_rate) * 100).toFixed(1)}%`,
        '수익배분': Number(s.revenue_share),
        '제작비': Number(s.production_cost),
        '조정액': Number(s.adjustment),
        '세율': Number(s.tax_rate),
        '세액': Number(s.tax_amount),
        '예고료': Number(s.insurance),
        'MG 차감': Number(s.mg_deduction),
        '기타공제': Number(s.other_deduction),
        '최종 지급액': Number(s.final_payment),
        '상태': s.status === 'draft' ? '임시' : s.status === 'confirmed' ? '확정' : '지급완료',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, '정산 내역');
    }

    if (type === 'settlement-summary') {
      // 정산 집계 내보내기
      const { data: settlements } = await supabase
        .from('rs_settlements')
        .select('*, partner:rs_partners(name, company_name, partner_type, report_type, business_number), work:rs_works(name)')
        .eq('month', month)
        .order('partner_id');

      // Group by partner
      const allSettlements = settlements || [];
      const byPartner = new Map<string, (typeof allSettlements)>();
      for (const s of allSettlements) {
        const pid = s.partner_id;
        const list = byPartner.get(pid) || [];
        list.push(s);
        byPartner.set(pid, list);
      }

      const incomeTypeMap: Record<string, string> = {
        individual: '개인',
        individual_employee: '개인(임직원)',
        individual_simple_tax: '개인(간이)',
        domestic_corp: '사업자(국내)',
        foreign_corp: '사업자(해외)',
        naver: '네이버',
      };
      const defaultReportTypeMap: Record<string, string> = {
        individual: '기타소득',
        individual_employee: '기타소득',
        individual_simple_tax: '사업소득',
        domestic_corp: '세금계산서',
        foreign_corp: '기타소득',
        naver: '세금계산서',
      };

      const calcTaxes = (partnerType: string, amount: number) => calculateTax(amount, partnerType);

      const rows: Record<string, unknown>[] = [];
      let no = 1;
      for (const [, items] of byPartner) {
        if (!items || items.length === 0) continue;
        const p = items[0].partner;
        const pt = p?.partner_type || 'individual';
        const workNames = items.map((s: Record<string, unknown>) => (s.work as Record<string, string>)?.name || '').join(', ');

        let revenueShare = 0, prodCost = 0, adjustment = 0, vat = 0, incomeTax = 0, localTax = 0, totalInsurance = 0, mgDeduction = 0, otherDeduction = 0, finalPayment = 0;
        for (const i of items) {
          const rs = Number(i.revenue_share) || 0;
          const pc = Number(i.production_cost) || 0;
          const adj = Number(i.adjustment) || 0;
          const rowAmt = rs + pc + adj;
          const taxes = calcTaxes(pt, rowAmt);
          revenueShare += rs;
          prodCost += pc;
          adjustment += adj;
          vat += taxes.vat;
          incomeTax += taxes.income_tax;
          localTax += taxes.local_tax;
          totalInsurance += Number(i.insurance) || 0;
          mgDeduction += Number(i.mg_deduction) || 0;
          otherDeduction += Number(i.other_deduction) || 0;
          finalPayment += Number(i.final_payment) || 0;
        }
        const settlementAmt = revenueShare + prodCost + adjustment;
        const insurance = totalInsurance > 0 ? totalInsurance : calculateInsurance(settlementAmt, pt);

        rows.push({
          'NO': no++,
          '대상자': p?.name || '',
          '거래처명': p?.company_name || '',
          '소득구분': incomeTypeMap[pt] || '기타',
          '신고구분': p?.report_type || defaultReportTypeMap[pt] || '-',
          '사업자번호': p?.business_number || '',
          '작품명': workNames,
          '수익분배금': revenueShare,
          '제작비': prodCost,
          '조정': adjustment,
          '수익정산금': settlementAmt,
          '부가세': vat,
          '소득세': -incomeTax,
          '지방세': -localTax,
          '예고료': -insurance,
          'MG차감': mgDeduction,
          '기타공제': -otherDeduction,
          '지급금액': finalPayment,
        });
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, '수익정산금 집계');
    } else if (type === 'verification') {
      // RS 검증 내보내기
      const { data: revenues } = await supabase
        .from('rs_revenues')
        .select('*, work:rs_works(name)')
        .eq('month', month);

      const { data: workPartners } = await supabase
        .from('rs_work_partners')
        .select('*, partner:rs_partners(name, company_name, partner_type)');

      const { data: settlements } = await supabase
        .from('rs_settlements')
        .select('*')
        .eq('month', month);

      const rows: Record<string, unknown>[] = [];
      for (const wp of (workPartners || [])) {
        const rev = (revenues || []).find(r => r.work_id === wp.work_id);
        if (!rev) continue;
        const gross = Number(rev.total);
        const effectiveRate = wp.is_mg_applied && wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : Number(wp.rs_rate);
        const computed = Math.round(gross * effectiveRate);
        const settle = (settlements || []).find(s => s.work_id === wp.work_id && s.partner_id === wp.partner_id);
        const dbValue = settle ? Number(settle.revenue_share) : null;
        const diff = dbValue != null ? computed - dbValue : null;

        const incomeTypeMap: Record<string, string> = {
          individual: '개인', individual_employee: '개인(임직원)', individual_simple_tax: '개인(간이)',
          domestic_corp: '사업자', foreign_corp: '해외', naver: '네이버',
        };

        rows.push({
          '대상자': wp.partner?.name || '',
          '거래처명': wp.partner?.company_name || '',
          '소득구분': incomeTypeMap[wp.partner?.partner_type] || '',
          '작품명': rev.work?.name || '',
          '매출액': gross,
          'RS요율': `${(Number(wp.rs_rate) * 100).toFixed(1)}%`,
          'MG요율': wp.mg_rs_rate != null ? `${(Number(wp.mg_rs_rate) * 100).toFixed(1)}%` : '',
          '적용요율': `${(effectiveRate * 100).toFixed(1)}%`,
          '산출분배금': computed,
          'DB분배금': dbValue,
          '차이': diff,
          'MG적용': wp.is_mg_applied ? 'Y' : '',
        });
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, '개별RS 검증');
    } else if (type === 'contracts') {
      // 계약 테이블 내보내기
      const { data: workPartners } = await supabase
        .from('rs_work_partners')
        .select('*, work:rs_works(name), partner:rs_partners(name, company_name, partner_type, report_type)')
        .order('created_at');

      const incomeTypeMap: Record<string, string> = {
        individual: '개인', individual_employee: '개인(임직원)', individual_simple_tax: '개인(간이)',
        domestic_corp: '사업자(국내)', foreign_corp: '사업자(해외)', naver: '사업자(네이버)',
      };
      const cycleMap: Record<string, string> = { monthly: '매월', semi_annual: '반기' };

      const rows = (workPartners || []).map(wp => ({
        '대상자': wp.partner?.name || '',
        '거래처명': wp.partner?.company_name || '',
        '소득구분': incomeTypeMap[wp.partner?.partner_type] || wp.partner?.partner_type || '',
        '신고구분': wp.partner?.report_type || '',
        '정산주기': cycleMap[wp.settlement_cycle] || '매월',
        '작품명': wp.work?.name || '',
        '매출액적용율': wp.revenue_rate ?? 1,
        'MG적용': wp.is_mg_applied ? 'O' : 'X',
        'MG요율': wp.mg_rs_rate != null ? wp.mg_rs_rate : '',
        'RS요율': wp.rs_rate,
        '특이사항': wp.note || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, '계약 테이블');
    } else if (type === 'mg-summary') {
      // MG 현황 내보내기
      const { data: mgBalances } = await supabase
        .from('rs_mg_balances')
        .select('*, partner:rs_partners(name, company_name, partner_type), work:rs_works(name)')
        .eq('month', month)
        .order('partner_id');

      const incomeTypeMap: Record<string, string> = {
        individual: '개인', individual_employee: '개인(임직원)', individual_simple_tax: '개인(간이)',
        domestic_corp: '사업자(국내)', foreign_corp: '사업자(해외)', naver: '사업자(네이버)',
      };

      const rows = (mgBalances || []).map((mg, i) => ({
        'NO': i + 1,
        '파트너명': mg.partner?.name || '',
        '거래처명': mg.partner?.company_name || '',
        '소득구분': incomeTypeMap[mg.partner?.partner_type] || '',
        '작품명': mg.work?.name || '',
        '전월이월': Number(mg.previous_balance),
        '당월 MG 추가': Number(mg.mg_added),
        '당월 MG 차감': Number(mg.mg_deducted),
        'MG잔액': Number(mg.current_balance),
        '특이사항': mg.note || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, 'MG 현황');
    }

    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const fileNames: Record<string, string> = {
      revenue: `매출액_집계_${month}.xlsx`,
      settlement: `RS_정산_${month}.xlsx`,
      'settlement-summary': `수익정산금_집계_${month}.xlsx`,
      verification: `RS_검증_${month}.xlsx`,
      contracts: `계약_테이블.xlsx`,
      'mg-summary': `MG_현황_${month}.xlsx`,
    };
    const fileName = fileNames[type] || `정산_${month}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('내보내기 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
