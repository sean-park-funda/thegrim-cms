import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { canManageAccounting } from '@/lib/utils/permissions';
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
    // 쿠키 기반 인증 시도
    let supabase = await createClient();
    let { data: { user }, error: userError } = await supabase.auth.getUser();

    // 쿠키 실패 시 Authorization 헤더에서 토큰 추출
    if (userError || !user) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        supabase = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        );
        const result = await supabase.auth.getUser(token);
        user = result.data.user;
        userError = result.error;
      }
    }

    if (userError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const formData = await request.formData();
    const month = formData.get('month') as string;
    const revenueType = formData.get('revenue_type') as RevenueType;
    const file = formData.get('file') as File;

    if (!month || !revenueType || !file) {
      return NextResponse.json({ error: '월, 수익 유형, 파일은 필수입니다.' }, { status: 400 });
    }

    if (!Object.keys(REVENUE_TYPE_COLUMNS).includes(revenueType)) {
      return NextResponse.json({ error: '잘못된 수익 유형입니다.' }, { status: 400 });
    }

    // 파일 읽기
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 엑셀 파싱
    const parseResult = parseRevenueExcel(buffer, file.name, revenueType, month);

    // 작품 목록 조회
    const { data: works } = await supabase.from('rs_works').select('id, name, naver_name');
    const workMap = new Map<string, string>(); // name/naver_name → work_id
    if (works) {
      for (const w of works) {
        workMap.set(w.name, w.id);
        if (w.naver_name) {
          workMap.set(w.naver_name, w.id);
        }
      }
    }

    // 매칭 + 미매칭 작품 자동 등록
    const matched: { work_name: string; work_id: string; amount: number }[] = [];
    const autoCreated: { work_name: string; work_id: string; amount: number }[] = [];
    const column = REVENUE_TYPE_COLUMNS[revenueType];

    // 동일 work_id에 대한 금액 합산
    const aggregated = new Map<string, { work_name: string; work_id: string; amount: number }>();

    for (const row of parseResult.rows) {
      let workId: string | undefined = workMap.get(row.work_name);

      // 미매칭 → 자동 등록
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

    for (const item of aggregated.values()) {
      matched.push(item);

      // 기존 수익 조회
      const { data: existing } = await supabase
        .from('rs_revenues')
        .select('id')
        .eq('work_id', item.work_id)
        .eq('month', month)
        .single();

      if (existing) {
        // 해당 컬럼만 UPDATE
        await supabase
          .from('rs_revenues')
          .update({ [column]: item.amount })
          .eq('id', existing.id);
      } else {
        // INSERT
        await supabase
          .from('rs_revenues')
          .insert({ work_id: item.work_id, month, [column]: item.amount });
      }
    }

    // 업로드 이력 기록
    await supabase.from('rs_upload_history').insert({
      month,
      revenue_type: revenueType,
      file_name: file.name,
      total_amount: parseResult.total_amount,
      matched_count: matched.length,
      unmatched_count: 0,
      uploaded_by: user.id,
    });

    return NextResponse.json({
      matched,
      auto_created: autoCreated,
      total_amount: parseResult.total_amount,
      errors: parseResult.errors,
    });
  } catch (error) {
    console.error('업로드 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
