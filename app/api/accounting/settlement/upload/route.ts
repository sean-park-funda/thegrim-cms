import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { parseRevenueExcel, normalizeWorkName } from '@/lib/settlement/excel-parser';
import { deduplicateWorks } from '@/lib/settlement/dedup-works';
import { RevenueType, ParsedRevenueLine } from '@/lib/types/settlement';

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
    const allLines: { line: ParsedRevenueLine; source_file: string }[] = [];
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
      // 상세 행 수집 (글로벌유료 등)
      if (parseResult.lines) {
        for (const line of parseResult.lines) {
          allLines.push({ line, source_file: file.name });
        }
      }
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

    // 3) 작품 매칭 + 금액 합산 (DB에 없는 작품은 자동 생성하지 않고 경고)
    const matched: { work_name: string; work_id: string; amount: number }[] = [];
    const unmatchedWorks: { work_name: string; amount: number }[] = [];
    const aggregated = new Map<string, { work_name: string; work_id: string; amount: number }>();

    for (const row of allRows) {
      const workId: string | undefined = workMap.get(row.work_name)
        || workMap.get(normalizeWorkName(row.work_name));

      if (!workId) {
        unmatchedWorks.push({ work_name: row.work_name, amount: row.amount });
        allErrors.push(`DB에 없는 작품: "${row.work_name}" (₩${row.amount.toLocaleString()}) — 먼저 작품을 등록하세요`);
        continue;
      }

      const existing = aggregated.get(workId);
      if (existing) {
        existing.amount += row.amount;
      } else {
        aggregated.set(workId, { work_name: row.work_name, work_id: workId, amount: row.amount });
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

    // 5) 상세 행 저장 (rs_revenue_lines) - 글로벌유료 등
    if (allLines.length > 0) {
      // revenue_id 조회를 위한 맵 구축
      const revenueIdMap = new Map<string, string>(); // work_id -> revenue_id
      for (const item of aggregated.values()) {
        const { data: rev } = await supabase
          .from('rs_revenues')
          .select('id')
          .eq('work_id', item.work_id)
          .eq('month', month)
          .single();
        if (rev) revenueIdMap.set(item.work_id, rev.id);
      }

      // 기존 상세 행 삭제 (재업로드 시 중복 방지)
      for (const revenueId of revenueIdMap.values()) {
        await supabase
          .from('rs_revenue_lines')
          .delete()
          .eq('revenue_id', revenueId)
          .eq('revenue_type', revenueType);
      }

      // 상세 행 일괄 삽���
      const lineInserts = [];
      for (const { line, source_file } of allLines) {
        const workId = workMap.get(line.work_name) || workMap.get(normalizeWorkName(line.work_name));
        if (!workId) continue;
        const revenueId = revenueIdMap.get(workId);
        if (!revenueId) continue;

        lineInserts.push({
          revenue_id: revenueId,
          work_id: workId,
          month,
          revenue_type: revenueType,
          service_platform: line.service_platform || null,
          country: line.country || null,
          sales_period: line.sales_period || null,
          rs_rate: line.rs_rate || null,
          sale_currency: line.sale_currency || null,
          sales_amount: line.sales_amount || null,
          payment_krw: line.payment_krw,
          supply_amount: line.supply_amount,
          vat_amount: line.vat_amount,
          adjustment_amount: 0,
          adjustment_supply: 0,
          adjustment_vat: 0,
          source_file,
          source_sheet: line.source_sheet || null,
          source_row: line.source_row || null,
        });
      }

      // batch insert (Supabase는 1000행 제한이므로 청크)
      for (let i = 0; i < lineInserts.length; i += 500) {
        const chunk = lineInserts.slice(i, i + 500);
        const { error: insertError } = await supabase
          .from('rs_revenue_lines')
          .insert(chunk);
        if (insertError) {
          allErrors.push(`상세 행 저장 오류: ${insertError.message}`);
        }
      }
    }

    // 6) 업로드 이력 기록
    await supabase.from('rs_upload_history').insert({
      month,
      revenue_type: revenueType,
      file_name: files.map(f => f.name).join(', '),
      total_amount,
      matched_count: matched.length,
      unmatched_count: 0,
      uploaded_by: auth.userId,
    });

    // 정산은 settlement-list API에서 실시간 계산되므로 자동 계산 불필요
    // 확정은 confirm API를 통해 일괄 처리

    return NextResponse.json({
      matched,
      unmatched_works: unmatchedWorks,
      total_amount,
      file_results: fileResults,
      errors: allErrors,
    });
  } catch (error) {
    console.error('업로드 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
