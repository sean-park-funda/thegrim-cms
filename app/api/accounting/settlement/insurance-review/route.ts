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

    // 파트너별 그룹핑
    const partnerMap = new Map<string, {
      partner_id: string;
      partner_name: string;
      company_name: string;
      partner_type: string;
      report_type: string | null;
      works: { name: string; serial_start_date: string | null; serial_end_date: string | null; revenue_share: number }[];
      total_settlement: number;
      insurance_amount: number;
      is_eligible: boolean;
      reason: string;
    }>();

    for (const s of (settlements || [])) {
      const partner = s.partner as { id: string; name: string; company_name: string; partner_type: string; report_type: string | null } | null;
      const work = s.work as { name: string; serial_start_date: string | null; serial_end_date: string | null } | null;
      if (!partner) continue;

      // 예고료 대상: individual 또는 individual_simple_tax만
      if (partner.partner_type !== 'individual' && partner.partner_type !== 'individual_simple_tax') continue;

      if (!partnerMap.has(partner.id)) {
        partnerMap.set(partner.id, {
          partner_id: partner.id,
          partner_name: partner.name,
          company_name: partner.company_name || '',
          partner_type: partner.partner_type,
          report_type: partner.report_type,
          works: [],
          total_settlement: 0,
          insurance_amount: 0,
          is_eligible: false,
          reason: '',
        });
      }

      const entry = partnerMap.get(partner.id)!;
      entry.works.push({
        name: work?.name || '',
        serial_start_date: work?.serial_start_date || null,
        serial_end_date: work?.serial_end_date || null,
        revenue_share: Number(s.revenue_share) || 0,
      });
      entry.total_settlement += (Number(s.revenue_share) || 0) + (Number(s.production_cost) || 0) + (Number(s.adjustment) || 0);
    }

    const review = Array.from(partnerMap.values()).map(entry => {
      // 예고료 적용 조건 검토
      const reasons: string[] = [];
      const hasActiveSerial = entry.works.some(w => !w.serial_end_date || new Date(w.serial_end_date) >= new Date(month + '-01'));
      const isAboveThreshold = entry.total_settlement > 500000; // 50만원 초과

      if (!hasActiveSerial) reasons.push('연재 종료');
      if (!isAboveThreshold) reasons.push('50만원 이하');
      if (entry.report_type === '세금계산서') reasons.push('세금계산서 발행자');

      const isEligible = hasActiveSerial && isAboveThreshold && entry.report_type !== '세금계산서';

      // 조건을 calculateInsurance에 직접 전달 — 함수 내에서 동일 조건 적용
      const insurance = calculateInsurance(entry.total_settlement, entry.partner_type, {
        serialEndDate: hasActiveSerial ? null : '1900-01-01',
        reportType: entry.report_type,
        month,
      });

      return {
        ...entry,
        insurance_amount: insurance,
        is_eligible: isEligible,
        reason: isEligible ? '대상' : reasons.join(', '),
      };
    }).sort((a, b) => b.insurance_amount - a.insurance_amount);

    return NextResponse.json({ review });
  } catch (error) {
    console.error('예고료 검토 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
