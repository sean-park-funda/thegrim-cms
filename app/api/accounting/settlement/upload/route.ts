import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { parseRevenueExcel } from '@/lib/settlement/excel-parser';
import { RevenueType } from '@/lib/types/settlement';

const REVENUE_TYPE_COLUMNS: Record<RevenueType, string> = {
  domestic_paid: 'domestic_paid',
  global_paid: 'global_paid',
  domestic_ad: 'domestic_ad',
  global_ad: 'global_ad',
  secondary: 'secondary',
};

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

    // 2) 작품 목록 조회
    const { data: works } = await supabase.from('rs_works').select('id, name, naver_name');
    const workMap = new Map<string, string>();
    if (works) {
      for (const w of works) {
        workMap.set(w.name, w.id);
        if (w.naver_name) {
          workMap.set(w.naver_name, w.id);
        }
      }
    }

    // 3) 작품 매칭 + 자동 등록 + 금액 합산
    const matched: { work_name: string; work_id: string; amount: number }[] = [];
    const autoCreated: { work_name: string; work_id: string; amount: number }[] = [];
    const aggregated = new Map<string, { work_name: string; work_id: string; amount: number }>();

    for (const row of allRows) {
      let workId: string | undefined = workMap.get(row.work_name);

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
