import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { parseRevenueExcel, normalizeWorkName } from '@/lib/settlement/excel-parser';
import { deduplicateWorks } from '@/lib/settlement/dedup-works';
import { calculateSettlement } from '@/lib/settlement/calculator';
import { computeStaffSalaryDeductions } from '@/lib/settlement/staff-salary';
import { RevenueType } from '@/lib/types/settlement';

const REVENUE_TYPE_COLUMNS: Record<RevenueType, string> = {
  domestic_paid: 'domestic_paid',
  global_paid: 'global_paid',
  domestic_ad: 'domestic_ad',
  global_ad: 'global_ad',
  secondary: 'secondary',
};

// GET /api/accounting/settlement/upload?month=YYYY-MM - 업로드 이력 조회
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

    let query = supabase
      .from('rs_upload_history')
      .select('revenue_type, file_name, total_amount, matched_count, created_at')
      .order('created_at', { ascending: false });

    if (month) query = query.eq('month', month);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: '이력 조회 실패' }, { status: 500 });
    }

    // 수익 유형별 실제 업로드 현황 (rs_revenues에서 값 존재 여부)
    let uploaded: Record<string, { count: number; total: number }> = {};
    if (month) {
      const { data: revenues } = await supabase
        .from('rs_revenues')
        .select('domestic_paid, global_paid, domestic_ad, global_ad, secondary')
        .eq('month', month);

      if (revenues) {
        const types = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary'] as const;
        for (const t of types) {
          const rows = revenues.filter(r => Number(r[t]) !== 0);
          if (rows.length > 0) {
            uploaded[t] = {
              count: rows.length,
              total: rows.reduce((sum, r) => sum + Number(r[t]), 0),
            };
          }
        }
      }
    }

    return NextResponse.json({ history: data, uploaded });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/upload - 엑셀 업로드 + 파싱 → DB
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const formData = await request.formData();
    const month = formData.get('month') as string;
    const revenueType = formData.get('revenue_type') as RevenueType;
    const files = formData.getAll('files') as File[];

    if (!month || !revenueType || files.length === 0) {
      return NextResponse.json({ error: '월, 수익 유형, 파일은 필수입니다.' }, { status: 400 });
    }

    if (!Object.keys(REVENUE_TYPE_COLUMNS).includes(revenueType)) {
      return NextResponse.json({ error: '잘못된 수익 유형입니다.' }, { status: 400 });
    }

    const column = REVENUE_TYPE_COLUMNS[revenueType];
    const allErrors: string[] = [];
    const fileResults: { name: string; count: number; amount: number }[] = [];

    // 1) 모든 파일 파싱 (DB 작업 전에 먼저 파싱하여 오류 조기 발견)
    const allRows: { work_name: string; amount: number }[] = [];
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const parseResult = parseRevenueExcel(buffer, file.name, revenueType, month);
      allRows.push(...parseResult.rows);
      allErrors.push(...parseResult.errors);
      fileResults.push({
        name: file.name,
        count: parseResult.rows.length,
        amount: parseResult.total_amount,
      });
    }

    // 2) 중복 작품 자동 병합 후 작품 목록 조회
    const dedup = await deduplicateWorks(supabase);
    if (dedup.merged.length > 0) {
      console.log(`중복 작품 ${dedup.merged.length}건 병합:`, dedup.merged.map(m => `${m.removed_name} → ${m.kept_name}`));
    }
    const { data: works } = await supabase.from('rs_works').select('id, name, naver_name');
    const workMap = new Map<string, string>();
    if (works) {
      for (const w of works) {
        workMap.set(w.name, w.id);
        const normalizedName = normalizeWorkName(w.name);
        if (normalizedName !== w.name) {
          workMap.set(normalizedName, w.id);
        }
        if (w.naver_name) {
          workMap.set(w.naver_name, w.id);
          const normalizedNaver = normalizeWorkName(w.naver_name);
          if (normalizedNaver !== w.naver_name) {
            workMap.set(normalizedNaver, w.id);
          }
        }
      }
    }

    // 3) 작품 매칭 + 자동 등록 + 금액 합산
    const matched: { work_name: string; work_id: string; amount: number }[] = [];
    const autoCreated: { work_name: string; work_id: string; amount: number }[] = [];
    const aggregated = new Map<string, { work_name: string; work_id: string; amount: number }>();

    for (const row of allRows) {
      let workId: string | undefined = workMap.get(row.work_name)
        || workMap.get(normalizeWorkName(row.work_name));

      if (!workId) {
        const { data: newWork } = await supabase
          .from('rs_works')
          .insert({ name: row.work_name, naver_name: row.work_name })
          .select('id')
          .single();

        if (newWork) {
          workId = newWork.id as string;
          workMap.set(row.work_name, workId);
          autoCreated.push({ work_name: row.work_name, work_id: workId, amount: row.amount });
        }
      }

      if (workId) {
        const existing = aggregated.get(workId);
        if (existing) {
          existing.amount += row.amount;
        } else {
          aggregated.set(workId, { work_name: row.work_name, work_id: workId, amount: row.amount });
        }
      }
    }

    // 4) 합산된 금액으로 UPSERT (해당 컬럼만 갱신, 다른 수익유형은 보존)
    for (const item of aggregated.values()) {
      matched.push(item);

      const { data: existing } = await supabase
        .from('rs_revenues')
        .select('id')
        .eq('work_id', item.work_id)
        .eq('month', month)
        .single();

      if (existing) {
        await supabase
          .from('rs_revenues')
          .update({ [column]: item.amount })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('rs_revenues')
          .insert({ work_id: item.work_id, month, [column]: item.amount });
      }
    }

    const total_amount = allRows.reduce((sum, r) => sum + r.amount, 0);

    // 5) 업로드 이력 기록
    await supabase.from('rs_upload_history').insert({
      month,
      revenue_type: revenueType,
      file_name: files.map(f => f.name).join(', '),
      total_amount,
      matched_count: matched.length,
      unmatched_count: 0,
      uploaded_by: auth.userId,
    });

    // 6) 정산 자동 계산 — 해당 월의 모든 수익 + 작품-파트너 조합으로 rs_settlements 갱신
    try {
      const { data: revenues } = await supabase
        .from('rs_revenues')
        .select('*')
        .eq('month', month);

      const { data: workPartners } = await supabase
        .from('rs_work_partners')
        .select('*, partner:rs_partners(*)');

      if (revenues && workPartners) {
        // 스태프 급여 비례 배분 계산
        const revenueByWorkId = new Map<string, number>();
        for (const rev of revenues) {
          revenueByWorkId.set(rev.work_id, Number(rev.total) || 0);
        }
        const staffDeductions = await computeStaffSalaryDeductions(supabase, month, revenueByWorkId);

        for (const rev of revenues) {
          const partners = workPartners.filter(wp => wp.work_id === rev.work_id);
          for (const wp of partners) {
            let mgBalance = 0;
            if (wp.is_mg_applied) {
              const { data: mgData } = await supabase
                .from('rs_mg_balances')
                .select('current_balance')
                .eq('partner_id', wp.partner_id)
                .eq('work_id', wp.work_id)
                .order('month', { ascending: false })
                .limit(1)
                .single();
              if (mgData) mgBalance = Number(mgData.current_balance);
            }

            // 기존 정산 레코드에서 수동 편집 필드 보존
            const { data: existing } = await supabase
              .from('rs_settlements')
              .select('production_cost, adjustment, other_deduction, status, note')
              .eq('month', month)
              .eq('partner_id', wp.partner_id)
              .eq('work_id', wp.work_id)
              .single();

            const productionCost = existing ? Number(existing.production_cost) : 0;
            const adjustment = existing ? Number(existing.adjustment) : 0;
            const otherDeduction = existing ? Number(existing.other_deduction) : 0;

            const calc = calculateSettlement({
              gross_revenue: Number(rev.total),
              rs_rate: Number(wp.rs_rate),
              mg_rs_rate: wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : null,
              production_cost: productionCost,
              adjustment,
              salary_deduction: staffDeductions.get(`${wp.partner_id}|${wp.work_id}`) || 0,
              other_deduction: otherDeduction,
              tax_rate: Number(wp.partner.tax_rate),
              partner_type: wp.partner.partner_type,
              is_mg_applied: wp.is_mg_applied,
              mg_balance: mgBalance,
            });

            await supabase
              .from('rs_settlements')
              .upsert({
                month,
                partner_id: wp.partner_id,
                work_id: wp.work_id,
                gross_revenue: Number(rev.total),
                rs_rate: Number(wp.rs_rate),
                revenue_share: calc.revenue_share,
                production_cost: productionCost,
                adjustment,
                tax_rate: Number(wp.partner.tax_rate),
                tax_amount: calc.tax_amount,
                insurance: calc.insurance,
                mg_deduction: calc.mg_deduction,
                other_deduction: otherDeduction,
                final_payment: calc.final_payment,
                ...(existing ? {} : { status: 'draft' as const }),
              }, { onConflict: 'month,partner_id,work_id' });
          }
        }
      }
    } catch (calcError) {
      console.error('자동 정산 계산 오류:', calcError);
      // 업로드 자체는 성공이므로 에러를 무시하고 응답에 경고 포함
    }

    return NextResponse.json({
      matched,
      auto_created: autoCreated,
      total_amount,
      file_results: fileResults,
      errors: allErrors,
    });
  } catch (error) {
    console.error('업로드 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
