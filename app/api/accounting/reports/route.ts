import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canViewAccountingReports } from '@/lib/utils/permissions';

// GET /api/accounting/reports - 회계 보고서 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 사용자 인증 확인
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 사용자 프로필 조회
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 권한 확인
    if (!canViewAccountingReports(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 쿼리 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type') || 'summary';
    const webtoonId = searchParams.get('webtoonId');
    const month = searchParams.get('month');

    switch (reportType) {
      case 'summary':
        // 전체 요약 보고서
        return await getSummaryReport(supabase);

      case 'webtoon':
        // 웹툰별 보고서
        if (!webtoonId) {
          return NextResponse.json({ error: '웹툰 ID가 필요합니다.' }, { status: 400 });
        }
        return await getWebtoonReport(supabase, webtoonId);

      case 'monthly':
        // 월별 보고서
        return await getMonthlyReport(supabase, month);

      case 'category':
        // 카테고리별 보고서
        return await getCategoryReport(supabase);

      default:
        return NextResponse.json({ error: '올바르지 않은 보고서 타입입니다.' }, { status: 400 });
    }
  } catch (error) {
    console.error('보고서 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// 전체 요약 보고서
async function getSummaryReport(supabase: any) {
  // 총 수입/지출 (승인된 거래만)
  const { data: summary, error: summaryError } = await supabase
    .from('accounting_transactions')
    .select('type, amount')
    .eq('status', 'approved');

  if (summaryError) {
    console.error('요약 조회 오류:', summaryError);
    return NextResponse.json({ error: '요약 조회 실패' }, { status: 500 });
  }

  const totalIncome = summary
    .filter((t: any) => t.type === 'income')
    .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);

  const totalExpense = summary
    .filter((t: any) => t.type === 'expense')
    .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);

  // 웹툰별 요약
  const { data: webtoonSummary, error: webtoonError } = await supabase
    .from('accounting_webtoon_summary')
    .select('*')
    .order('net_profit', { ascending: false });

  if (webtoonError) {
    console.error('웹툰별 요약 조회 오류:', webtoonError);
  }

  // 최근 거래 내역
  const { data: recentTransactions, error: recentError } = await supabase
    .from('accounting_transactions')
    .select(`
      *,
      category:accounting_categories(name, color),
      webtoon:webtoons(title)
    `)
    .order('transaction_date', { ascending: false })
    .limit(10);

  if (recentError) {
    console.error('최근 거래 조회 오류:', recentError);
  }

  return NextResponse.json({
    summary: {
      total_income: totalIncome,
      total_expense: totalExpense,
      net_profit: totalIncome - totalExpense,
    },
    webtoon_summary: webtoonSummary || [],
    recent_transactions: recentTransactions || [],
  });
}

// 웹툰별 보고서
async function getWebtoonReport(supabase: any, webtoonId: string) {
  // 웹툰 정보
  const { data: webtoon, error: webtoonError } = await supabase
    .from('webtoons')
    .select('id, title, thumbnail_url')
    .eq('id', webtoonId)
    .single();

  if (webtoonError) {
    return NextResponse.json({ error: '웹툰을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 웹툰 거래 내역
  const { data: transactions, error: transactionsError } = await supabase
    .from('accounting_transactions')
    .select(`
      *,
      category:accounting_categories(name, color)
    `)
    .eq('webtoon_id', webtoonId)
    .eq('status', 'approved')
    .order('transaction_date', { ascending: false });

  if (transactionsError) {
    console.error('거래 내역 조회 오류:', transactionsError);
    return NextResponse.json({ error: '거래 내역 조회 실패' }, { status: 500 });
  }

  const totalIncome = transactions
    .filter((t: any) => t.type === 'income')
    .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);

  const totalExpense = transactions
    .filter((t: any) => t.type === 'expense')
    .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);

  // 웹툰 예산
  const { data: budgets, error: budgetsError } = await supabase
    .from('webtoon_budgets')
    .select('*')
    .eq('webtoon_id', webtoonId)
    .order('start_date', { ascending: false });

  if (budgetsError) {
    console.error('예산 조회 오류:', budgetsError);
  }

  return NextResponse.json({
    webtoon,
    summary: {
      total_income: totalIncome,
      total_expense: totalExpense,
      net_profit: totalIncome - totalExpense,
      transaction_count: transactions.length,
    },
    transactions,
    budgets: budgets || [],
  });
}

// 월별 보고서
async function getMonthlyReport(supabase: any, month?: string | null) {
  const { data: monthlySummary, error } = await supabase
    .from('accounting_monthly_summary')
    .select('*')
    .order('month', { ascending: false });

  if (error) {
    console.error('월별 요약 조회 오류:', error);
    return NextResponse.json({ error: '월별 요약 조회 실패' }, { status: 500 });
  }

  // 특정 월이 지정된 경우 필터링
  let filteredData = monthlySummary;
  if (month) {
    filteredData = monthlySummary.filter((item: any) => item.month?.startsWith(month));
  }

  return NextResponse.json({
    monthly_summary: filteredData,
  });
}

// 카테고리별 보고서
async function getCategoryReport(supabase: any) {
  const { data: categorySummary, error } = await supabase
    .from('accounting_category_summary')
    .select('*')
    .order('total_amount', { ascending: false });

  if (error) {
    console.error('카테고리별 요약 조회 오류:', error);
    return NextResponse.json({ error: '카테고리별 요약 조회 실패' }, { status: 500 });
  }

  return NextResponse.json({
    category_summary: categorySummary,
  });
}
