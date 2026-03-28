import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { calculateInsurance } from '@/lib/settlement/calculator';

// GET /api/accounting/settlement/insurance-review?month=YYYY-MM
// 예고료 대상 검토 — 개인(individual, individual_simple_tax) 파트너 중 예고료 발생 대상
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
    if (!month) {
      return NextResponse.json({ error: '월은 필수입니다.' }, { status: 400 });
    }

    // 정산 데이터 + 파트너/작품 정보
    const { data: settlements, error } = await supabase
      .from('rs_settlements')
      .select('*, partner:rs_partners(*), work:rs_works(name, serial_start_date, serial_end_date)')
      .eq('month', month);

    if (error) {
      console.error('예고료 검토 조회 오류:', error);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }

    // 파트너별 정산금 합산 + 작품별 행 생성
    const partnerTotals = new Map<string, { total: number; hasActiveSerial: boolean }>();
    const rows: {
      partner_id: string;
      partner_name: string;
      company_name: string;
      partner_type: string;
      report_type: string | null;
      work_id: string;
      work_name: string;
      serial_start_date: string | null;
      serial_end_date: string | null;
      total_settlement: number;
      insurance_amount: number;
    }[] = [];

    for (const s of (settlements || [])) {
      const partner = s.partner as { id: string; name: string; company_name: string; partner_type: string; report_type: string | null; is_foreign: boolean } | null;
      const work = s.work as { name: string; serial_start_date: string | null; serial_end_date: string | null } | null;
      if (!partner) continue;

      if (partner.partner_type !== 'individual' && partner.partner_type !== 'individual_simple_tax') continue;
      if (partner.is_foreign) continue;

      const amount = Number(s.revenue_share) || 0;
      const prev = partnerTotals.get(partner.id) || { total: 0, hasActiveSerial: false };
      const isActive = !work?.serial_end_date || new Date(work.serial_end_date) >= new Date(month + '-01');
      partnerTotals.set(partner.id, {
        total: prev.total + amount,
        hasActiveSerial: prev.hasActiveSerial || isActive,
      });

      if (isActive) {
        rows.push({
          partner_id: partner.id,
          partner_name: partner.name,
          company_name: partner.company_name || '',
          partner_type: partner.partner_type,
          report_type: partner.report_type,
          work_id: s.work_id,
          work_name: work?.name || '',
          serial_start_date: work?.serial_start_date || null,
          serial_end_date: work?.serial_end_date || null,
          total_settlement: 0,
          insurance_amount: 0,
        });
      }
    }

    const review = rows.map(row => {
      const pt = partnerTotals.get(row.partner_id)!;
      const insurance = calculateInsurance(pt.total, row.partner_type, {
        serialEndDate: pt.hasActiveSerial ? null : '1900-01-01',
        reportType: row.report_type,
        month,
      });
      return { ...row, total_settlement: pt.total, insurance_amount: insurance };
    }).sort((a, b) => a.partner_name.localeCompare(b.partner_name));

    return NextResponse.json({ review });
  } catch (error) {
    console.error('예고료 검토 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
