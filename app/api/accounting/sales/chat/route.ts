import { NextRequest } from 'next/server';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL = 'gemini-2.5-flash';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getUserId() {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return user?.id;
}

// ── Tool definitions ──

const tools: FunctionDeclaration[] = [
  {
    name: 'get_daily_sales',
    description: '작품별 일별 매출 데이터를 조회합니다. 날짜 범위와 작품명으로 필터링 가능합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        work_name: { type: Type.STRING, description: '작품명 (부분 일치 검색). 생략하면 전체 작품' },
        date_from: { type: Type.STRING, description: 'YYYY-MM-DD 시작일' },
        date_to: { type: Type.STRING, description: 'YYYY-MM-DD 종료일' },
      },
    },
  },
  {
    name: 'get_daily_sales_summary',
    description: '기간 내 작품별 매출 합계, 일평균, 순위를 조회합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date_from: { type: Type.STRING, description: 'YYYY-MM-DD 시작일' },
        date_to: { type: Type.STRING, description: 'YYYY-MM-DD 종료일' },
      },
      required: ['date_from', 'date_to'],
    },
  },
  {
    name: 'get_work_trend',
    description: '특정 작품의 매출 추이를 조회합니다. 일별 매출 변동, 최대/최소일, 평균을 반환합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        work_name: { type: Type.STRING, description: '작품명 (부분 일치)' },
        date_from: { type: Type.STRING, description: 'YYYY-MM-DD 시작일' },
        date_to: { type: Type.STRING, description: 'YYYY-MM-DD 종료일' },
      },
      required: ['work_name'],
    },
  },
  {
    name: 'compare_works',
    description: '두 개 이상의 작품 매출을 비교합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        work_names: { type: Type.STRING, description: '비교할 작품명들 (쉼표로 구분)' },
        date_from: { type: Type.STRING, description: 'YYYY-MM-DD 시작일' },
        date_to: { type: Type.STRING, description: 'YYYY-MM-DD 종료일' },
      },
      required: ['work_names'],
    },
  },
  {
    name: 'get_peak_days',
    description: '매출이 급등한 날(연재일 등)을 찾습니다. 평균 대비 일정 배수 이상인 날을 반환합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        work_name: { type: Type.STRING, description: '작품명 (부분 일치). 생략하면 전체' },
        date_from: { type: Type.STRING, description: 'YYYY-MM-DD 시작일' },
        date_to: { type: Type.STRING, description: 'YYYY-MM-DD 종료일' },
        threshold: { type: Type.NUMBER, description: '평균 대비 배수 기준 (기본 2.0)' },
      },
    },
  },
  {
    name: 'get_growth_rates',
    description: '작품별 매출 성장률을 계산합니다. 지정 기간을 전반기/후반기로 나눠 증감률을 계산하거나, 최근 기간과 이전 동일 기간을 비교합니다. "성장률", "증가율", "감소율", "추세" 관련 질문에 사용하세요.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: { type: Type.NUMBER, description: '분석 기간 (일). period_compare/half_split 모드에서 사용. 기본 30' },
        mode: { type: Type.STRING, description: '"weekly" (기본): 주간 단위 성장률 (최근 4주). "period_compare": 최근 N일 vs 이전 N일 비교. "half_split": 지정 기간을 전반/후반으로 나눠 비교' },
      },
    },
  },
];

// ── Tool executors ──

function defaultDateRange(args: Record<string, any>) {
  const to = args.date_to || new Date().toISOString().slice(0, 10);
  const fromDate = new Date(to);
  fromDate.setDate(fromDate.getDate() - 30);
  const from = args.date_from || fromDate.toISOString().slice(0, 10);
  return { from, to };
}

async function executeGetDailySales(args: Record<string, any>) {
  const { from, to } = defaultDateRange(args);
  let query = supabase
    .from('rs_daily_sales')
    .select('work_name, sale_date, amount, platform')
    .gte('sale_date', from)
    .lte('sale_date', to)
    .order('sale_date', { ascending: true });

  if (args.work_name) {
    query = query.ilike('work_name', `%${args.work_name}%`);
  }

  const { data, error } = await query.limit(500);
  if (error) return { error: error.message };
  return data;
}

async function executeGetDailySalesSummary(args: Record<string, any>) {
  const { from, to } = defaultDateRange(args);

  const { data, error } = await supabase
    .from('rs_daily_sales')
    .select('work_name, sale_date, amount')
    .gte('sale_date', from)
    .lte('sale_date', to)
    .order('sale_date', { ascending: true });

  if (error) return { error: error.message };
  if (!data?.length) return { message: '해당 기간에 데이터가 없습니다.' };

  // 작품별 집계
  const workMap: Record<string, { total: number; days: number; dailyAmounts: number[] }> = {};
  for (const row of data) {
    const wn = row.work_name;
    if (!workMap[wn]) workMap[wn] = { total: 0, days: 0, dailyAmounts: [] };
    workMap[wn].total += Number(row.amount);
    workMap[wn].days += 1;
    workMap[wn].dailyAmounts.push(Number(row.amount));
  }

  const rankings = Object.entries(workMap)
    .map(([name, stats]) => ({
      work_name: name,
      total: stats.total,
      daily_average: Math.round(stats.total / stats.days),
      days: stats.days,
      max_daily: Math.max(...stats.dailyAmounts),
      min_daily: Math.min(...stats.dailyAmounts),
    }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = rankings.reduce((s, r) => s + r.total, 0);

  return {
    period: { from, to },
    grand_total: grandTotal,
    work_count: rankings.length,
    rankings,
  };
}

async function executeGetWorkTrend(args: Record<string, any>) {
  const { from, to } = defaultDateRange(args);

  const { data, error } = await supabase
    .from('rs_daily_sales')
    .select('work_name, sale_date, amount')
    .ilike('work_name', `%${args.work_name}%`)
    .gte('sale_date', from)
    .lte('sale_date', to)
    .order('sale_date', { ascending: true });

  if (error) return { error: error.message };
  if (!data?.length) return { message: '해당 작품의 데이터를 찾을 수 없습니다.' };

  const amounts = data.map(r => Number(r.amount));
  const total = amounts.reduce((a, b) => a + b, 0);
  const avg = total / amounts.length;
  const maxIdx = amounts.indexOf(Math.max(...amounts));
  const minIdx = amounts.indexOf(Math.min(...amounts));

  return {
    work_name: data[0].work_name,
    period: { from, to },
    total,
    daily_average: Math.round(avg),
    max: { date: data[maxIdx].sale_date, amount: amounts[maxIdx] },
    min: { date: data[minIdx].sale_date, amount: amounts[minIdx] },
    daily_data: data.map(r => ({ date: r.sale_date, amount: Number(r.amount) })),
  };
}

async function executeCompareWorks(args: Record<string, any>) {
  const { from, to } = defaultDateRange(args);
  const workNames = (args.work_names as string).split(',').map(s => s.trim());

  const results = [];
  for (const name of workNames) {
    const { data } = await supabase
      .from('rs_daily_sales')
      .select('work_name, sale_date, amount')
      .ilike('work_name', `%${name}%`)
      .gte('sale_date', from)
      .lte('sale_date', to)
      .order('sale_date', { ascending: true });

    if (data?.length) {
      const amounts = data.map(r => Number(r.amount));
      const total = amounts.reduce((a, b) => a + b, 0);
      results.push({
        work_name: data[0].work_name,
        total,
        daily_average: Math.round(total / amounts.length),
        max_daily: Math.max(...amounts),
        days: amounts.length,
      });
    }
  }

  return {
    period: { from, to },
    comparison: results.sort((a, b) => b.total - a.total),
  };
}

async function executeGetPeakDays(args: Record<string, any>) {
  const { from, to } = defaultDateRange(args);
  const threshold = args.threshold || 2.0;

  let query = supabase
    .from('rs_daily_sales')
    .select('work_name, sale_date, amount')
    .gte('sale_date', from)
    .lte('sale_date', to)
    .order('amount', { ascending: false });

  if (args.work_name) {
    query = query.ilike('work_name', `%${args.work_name}%`);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: '데이터가 없습니다.' };

  // 작품별 평균 계산 후 급등일 필터
  const workAvg: Record<string, number> = {};
  const workCounts: Record<string, number> = {};
  const workTotals: Record<string, number> = {};

  for (const row of data) {
    const wn = row.work_name;
    workTotals[wn] = (workTotals[wn] || 0) + Number(row.amount);
    workCounts[wn] = (workCounts[wn] || 0) + 1;
  }
  for (const wn of Object.keys(workTotals)) {
    workAvg[wn] = workTotals[wn] / workCounts[wn];
  }

  const peaks = data
    .filter(row => Number(row.amount) >= workAvg[row.work_name] * threshold)
    .map(row => ({
      work_name: row.work_name,
      date: row.sale_date,
      amount: Number(row.amount),
      average: Math.round(workAvg[row.work_name]),
      ratio: Number((Number(row.amount) / workAvg[row.work_name]).toFixed(1)),
    }));

  return { period: { from, to }, threshold, peak_days: peaks.slice(0, 30) };
}

async function executeGetGrowthRates(args: Record<string, any>) {
  const days = args.days || 30;
  const mode = args.mode || 'weekly';
  const today = new Date().toISOString().slice(0, 10);

  if (mode === 'weekly') {
    // 주간 단위 성장률: 최근 4주
    const weeks = 4;
    const results = [];
    for (let w = 0; w < weeks; w++) {
      const wEnd = new Date(today);
      wEnd.setDate(wEnd.getDate() - (w * 7));
      const wStart = new Date(wEnd);
      wStart.setDate(wStart.getDate() - 6);

      const { data } = await supabase
        .from('rs_daily_sales')
        .select('work_name, amount')
        .gte('sale_date', wStart.toISOString().slice(0, 10))
        .lte('sale_date', wEnd.toISOString().slice(0, 10));

      const weekTotal: Record<string, number> = {};
      for (const row of data || []) {
        weekTotal[row.work_name] = (weekTotal[row.work_name] || 0) + Number(row.amount);
      }
      results.push({
        week: `W-${w}`,
        period: `${wStart.toISOString().slice(0, 10)} ~ ${wEnd.toISOString().slice(0, 10)}`,
        totals: weekTotal,
      });
    }

    // 주간 성장률 계산
    const workGrowth: Record<string, { current: number; previous: number; growth_pct: number }> = {};
    const currentWeek = results[0]?.totals || {};
    const previousWeek = results[1]?.totals || {};
    for (const name of new Set([...Object.keys(currentWeek), ...Object.keys(previousWeek)])) {
      const cur = currentWeek[name] || 0;
      const prev = previousWeek[name] || 0;
      workGrowth[name] = {
        current: cur,
        previous: prev,
        growth_pct: prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur > 0 ? 100 : 0,
      };
    }

    return {
      mode: 'weekly',
      weekly_data: results,
      week_over_week_growth: Object.entries(workGrowth)
        .map(([name, stats]) => ({ work_name: name, ...stats }))
        .sort((a, b) => b.growth_pct - a.growth_pct),
    };
  }

  // period_compare (기본) 또는 half_split
  let recentFrom: string, recentTo: string, prevFrom: string, prevTo: string;

  if (mode === 'half_split') {
    const endDate = new Date(today);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);
    const midDate = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);
    prevFrom = startDate.toISOString().slice(0, 10);
    prevTo = midDate.toISOString().slice(0, 10);
    recentFrom = new Date(midDate.getTime() + 86400000).toISOString().slice(0, 10);
    recentTo = today;
  } else {
    // period_compare: 최근 N일 vs 이전 N일
    const endDate = new Date(today);
    const recentStart = new Date(today);
    recentStart.setDate(recentStart.getDate() - days);
    const prevEnd = new Date(recentStart);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    recentFrom = recentStart.toISOString().slice(0, 10);
    recentTo = today;
    prevFrom = prevStart.toISOString().slice(0, 10);
    prevTo = prevEnd.toISOString().slice(0, 10);
  }

  const [recentRes, prevRes] = await Promise.all([
    supabase.from('rs_daily_sales').select('work_name, amount')
      .gte('sale_date', recentFrom).lte('sale_date', recentTo),
    supabase.from('rs_daily_sales').select('work_name, amount')
      .gte('sale_date', prevFrom).lte('sale_date', prevTo),
  ]);

  const sumByWork = (rows: any[]) => {
    const map: Record<string, number> = {};
    for (const r of rows || []) map[r.work_name] = (map[r.work_name] || 0) + Number(r.amount);
    return map;
  };

  const recentTotals = sumByWork(recentRes.data || []);
  const prevTotals = sumByWork(prevRes.data || []);
  const allWorks = new Set([...Object.keys(recentTotals), ...Object.keys(prevTotals)]);

  const rankings = Array.from(allWorks).map(name => {
    const recent = recentTotals[name] || 0;
    const prev = prevTotals[name] || 0;
    const growth_pct = prev > 0 ? Math.round(((recent - prev) / prev) * 1000) / 10 : recent > 0 ? 100 : 0;
    return { work_name: name, recent_total: recent, previous_total: prev, change: recent - prev, growth_pct };
  }).sort((a, b) => b.growth_pct - a.growth_pct);

  return {
    mode,
    recent_period: { from: recentFrom, to: recentTo },
    previous_period: { from: prevFrom, to: prevTo },
    rankings,
    summary: {
      most_grown: rankings[0] || null,
      most_declined: rankings[rankings.length - 1] || null,
      total_recent: Object.values(recentTotals).reduce((a, b) => a + b, 0),
      total_previous: Object.values(prevTotals).reduce((a, b) => a + b, 0),
    },
  };
}

const toolExecutors: Record<string, (args: Record<string, any>) => Promise<any>> = {
  get_daily_sales: executeGetDailySales,
  get_daily_sales_summary: executeGetDailySalesSummary,
  get_work_trend: executeGetWorkTrend,
  compare_works: executeCompareWorks,
  get_peak_days: executeGetPeakDays,
  get_growth_rates: executeGetGrowthRates,
};

// ── System prompt ──

async function buildSystemPrompt() {
  const today = new Date().toISOString().split('T')[0];

  const { data: accounts } = await supabase
    .from('rs_naver_accounts')
    .select('work_name')
    .eq('is_active', true)
    .order('work_name');

  const workList = (accounts || []).map(a => a.work_name).join(', ');

  return `당신은 더그림엔터테인먼트 일별 매출 분석 AI입니다.
네이버 웹툰 작품들의 일별 매출 데이터를 분석하여 질문에 답변합니다.

## 등록된 작품 목록
${workList}

## 작품명 매칭 규칙
사용자는 줄임말이나 별칭을 사용합니다. 위 목록에서 가장 적합한 정식 명칭으로 매칭하세요.
예: "외지주"→"외모지상주의", "싸독"→"싸움독학", "범도"→"범죄도시0", "국말"→"국정원 말단직원"
도구 호출 시 부분 매칭이 가능하므로 핵심 키워드만 넣어도 됩니다.

## 데이터 설명
- 일별 매출: 네이버 프렌즈 "컨텐츠별 매출 통계"에서 수집한 일별 합계 금액 (유상이용권 + 마켓수수료 포함)
- 매출 급등일: 보통 연재일에 매출이 평균의 3~10배로 급등합니다

## 규칙
- 한국어로 답변
- 금액은 원(₩) 단위, 천 단위 콤마 사용. 큰 금액은 만원/억원 단위로 표현
- 오늘 날짜: ${today}
- 날짜 미지정 시 최근 30일 기준

## 분석 관점
- 매출 추이(상승/하락/횡보)를 파악하고 인사이트 제공
- 연재일 패턴(급등일)을 식별하여 연재 요일 추정
- 작품 간 비교 시 총 매출, 일평균, 연재일 매출로 비교
- 성장률/증감률 질문에는 반드시 get_growth_rates 도구를 사용 (period_compare, half_split, weekly 모드 지원)
- 데이터가 없으면 "해당 데이터가 없습니다"라고 안내`;
}

// ── API Route ──

export async function POST(request: NextRequest) {
  try {
    const { messages, conversationId } = await request.json();

    if (!messages?.length) {
      return Response.json({ error: '메시지가 필요합니다.' }, { status: 400 });
    }

    const userId = await getUserId();

    const geminiMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const systemPrompt = await buildSystemPrompt();

    let response = await ai.models.generateContent({
      model: MODEL,
      contents: geminiMessages,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: tools }],
      },
    });

    // Tool calling loop (max 5 iterations)
    let iterations = 0;
    while (iterations < 5) {
      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCall = parts.find((p: any) => p.functionCall);

      if (!functionCall?.functionCall) break;

      const { name, args } = functionCall.functionCall;
      const executor = toolExecutors[name as string];

      let result: any;
      if (executor) {
        result = await executor((args || {}) as Record<string, any>);
      } else {
        result = { error: `Unknown tool: ${name}` };
      }

      response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          ...geminiMessages,
          { role: 'model', parts },
          {
            role: 'user',
            parts: [{
              functionResponse: {
                name: name as string,
                response: { result },
              },
            }],
          },
        ],
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: tools }],
        },
      });

      iterations++;
    }

    const finalText = response.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('') || '응답을 생성하지 못했습니다.';

    // Save messages to DB if user is authenticated and conversationId provided
    let savedConversationId = conversationId;
    if (userId) {
      const lastUserMsg = messages[messages.length - 1];

      // Create conversation if not provided
      if (!savedConversationId) {
        const title = (lastUserMsg?.content || '').slice(0, 40) || '새 대화';
        const { data: conv } = await supabase
          .from('chat_conversations')
          .insert({ user_id: userId, title })
          .select('id')
          .single();
        savedConversationId = conv?.id;
      }

      if (savedConversationId) {
        // Save user message and assistant reply
        await supabase.from('chat_messages').insert([
          { conversation_id: savedConversationId, role: 'user', content: lastUserMsg.content },
          { conversation_id: savedConversationId, role: 'assistant', content: finalText },
        ]);
      }
    }

    return Response.json({ reply: finalText, conversationId: savedConversationId });
  } catch (error: any) {
    console.error('Daily sales chat error:', error);
    return Response.json(
      { error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
