import { NextRequest } from 'next/server';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL = 'gemini-2.5-flash';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Tool definitions ──

const tools: FunctionDeclaration[] = [
  {
    name: 'get_revenue',
    description: '작품별/월별 매출을 조회합니다. 국내유료, 해외유료, 국내광고, 해외광고, 2차사업 5개 항목과 합계를 반환합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        work_name: { type: Type.STRING, description: '작품명 (부분 일치 검색). 생략하면 전체 작품' },
        month: { type: Type.STRING, description: 'YYYY-MM 형식. 생략하면 최근 3개월' },
        month_start: { type: Type.STRING, description: '기간 조회 시작월 YYYY-MM' },
        month_end: { type: Type.STRING, description: '기간 조회 종료월 YYYY-MM' },
      },
    },
  },
  {
    name: 'get_settlement',
    description: '파트너별 정산 내역을 조회합니다. 매출, RS비율, 세금, 보험, MG차감, 최종지급액 등을 반환합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        partner_name: { type: Type.STRING, description: '파트너명 (부분 일치)' },
        work_name: { type: Type.STRING, description: '작품명 (부분 일치)' },
        month: { type: Type.STRING, description: 'YYYY-MM 형식' },
      },
    },
  },
  {
    name: 'get_partner_info',
    description: '파트너 정보와 계약 조건(RS비율, 역할, MG 적용여부 등)을 조회합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        partner_name: { type: Type.STRING, description: '파트너명 (부분 일치)' },
      },
      required: ['partner_name'],
    },
  },
  {
    name: 'get_work_info',
    description: '작품 정보와 참여 파트너 목록을 조회합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        work_name: { type: Type.STRING, description: '작품명 (부분 일치)' },
      },
      required: ['work_name'],
    },
  },
  {
    name: 'get_mg_balance',
    description: 'MG(최소보장금) 잔액을 조회합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        partner_name: { type: Type.STRING, description: '파트너명 (부분 일치)' },
        work_name: { type: Type.STRING, description: '작품명 (부분 일치)' },
        month: { type: Type.STRING, description: 'YYYY-MM' },
      },
    },
  },
  {
    name: 'get_monthly_summary',
    description: '월별 전체 매출/정산 요약을 조회합니다. 전체 작품의 매출 합계, 정산 합계 등을 반환합니다.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: { type: Type.STRING, description: 'YYYY-MM' },
      },
      required: ['month'],
    },
  },
];

// ── Tool executors ──

async function executeGetRevenue(args: Record<string, string>) {
  let query = supabase
    .from('rs_revenues')
    .select('month, domestic_paid, global_paid, domestic_ad, global_ad, secondary, total, domestic_ad_diff, work:rs_works!inner(name)')
    .order('month', { ascending: false });

  if (args.work_name) {
    query = query.ilike('rs_works.name', `%${args.work_name}%`);
  }
  if (args.month) {
    query = query.eq('month', args.month);
  } else if (args.month_start && args.month_end) {
    query = query.gte('month', args.month_start).lte('month', args.month_end);
  } else if (!args.work_name) {
    // 전체 조회 시 최근 3개월만
    query = query.limit(50);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };
  return data;
}

async function executeGetSettlement(args: Record<string, string>) {
  let query = supabase
    .from('rs_settlements')
    .select('month, gross_revenue, rs_rate, revenue_share, production_cost, adjustment, tax_rate, tax_amount, insurance, mg_deduction, other_deduction, final_payment, status, partner:rs_partners!inner(name), work:rs_works!inner(name)')
    .order('month', { ascending: false });

  if (args.partner_name) {
    query = query.ilike('rs_partners.name', `%${args.partner_name}%`);
  }
  if (args.work_name) {
    query = query.ilike('rs_works.name', `%${args.work_name}%`);
  }
  if (args.month) {
    query = query.eq('month', args.month);
  }

  const { data, error } = await query.limit(100);
  if (error) return { error: error.message };
  return data;
}

async function executeGetPartnerInfo(args: Record<string, string>) {
  const { data: partners, error: pErr } = await supabase
    .from('rs_partners')
    .select('id, name, company_name, partner_type, tax_id, tax_rate, report_type, salary_deduction, has_salary, email')
    .ilike('name', `%${args.partner_name}%`);

  if (pErr) return { error: pErr.message };
  if (!partners?.length) return { message: '해당 파트너를 찾을 수 없습니다.' };

  const partnerIds = partners.map(p => p.id);
  const { data: wps } = await supabase
    .from('rs_work_partners')
    .select('rs_rate, mg_rs_rate, role, is_mg_applied, pen_name, included_revenue_types, contract_category, contract_end_date, work:rs_works(name)')
    .in('partner_id', partnerIds);

  return partners.map(p => ({
    ...p,
    works: (wps || []).filter((wp: any) => true), // all work-partner entries
  }));
}

async function executeGetWorkInfo(args: Record<string, string>) {
  const { data: works, error } = await supabase
    .from('rs_works')
    .select('id, name, naver_name, contract_type, settlement_level, is_active, serial_start_date, serial_end_date')
    .ilike('name', `%${args.work_name}%`);

  if (error) return { error: error.message };
  if (!works?.length) return { message: '해당 작품을 찾을 수 없습니다.' };

  const workIds = works.map(w => w.id);
  const { data: wps } = await supabase
    .from('rs_work_partners')
    .select('rs_rate, mg_rs_rate, role, is_mg_applied, pen_name, partner:rs_partners(name, partner_type)')
    .in('work_id', workIds);

  return works.map(w => ({
    ...w,
    partners: (wps || []).filter((wp: any) => true),
  }));
}

async function executeGetMgBalance(args: Record<string, string>) {
  let query = supabase
    .from('rs_mg_balances')
    .select('month, previous_balance, mg_added, mg_deducted, current_balance, partner:rs_partners!inner(name), work:rs_works!inner(name)')
    .order('month', { ascending: false });

  if (args.partner_name) {
    query = query.ilike('rs_partners.name', `%${args.partner_name}%`);
  }
  if (args.work_name) {
    query = query.ilike('rs_works.name', `%${args.work_name}%`);
  }
  if (args.month) {
    query = query.eq('month', args.month);
  }

  const { data, error } = await query.limit(50);
  if (error) return { error: error.message };
  return data;
}

async function executeGetMonthlySummary(args: Record<string, string>) {
  const month = args.month;

  // 매출 합계
  const { data: revenues } = await supabase
    .from('rs_revenues')
    .select('domestic_paid, global_paid, domestic_ad, global_ad, secondary, total, work:rs_works(name)')
    .eq('month', month);

  // 정산 합계
  const { data: settlements } = await supabase
    .from('rs_settlements')
    .select('gross_revenue, revenue_share, tax_amount, insurance, mg_deduction, other_deduction, final_payment, status, partner:rs_partners(name), work:rs_works(name)')
    .eq('month', month);

  const totalRevenue = (revenues || []).reduce((s, r) => s + Number(r.total || 0), 0);
  const totalFinalPayment = (settlements || []).reduce((s, r) => s + Number(r.final_payment || 0), 0);
  const totalRevenueShare = (settlements || []).reduce((s, r) => s + Number(r.revenue_share || 0), 0);
  const totalTax = (settlements || []).reduce((s, r) => s + Number(r.tax_amount || 0), 0);

  return {
    month,
    work_count: (revenues || []).length,
    partner_settlement_count: (settlements || []).length,
    total_revenue: totalRevenue,
    total_revenue_share: totalRevenueShare,
    total_tax: totalTax,
    total_final_payment: totalFinalPayment,
    revenues_by_work: revenues,
    settlements_by_partner: settlements,
  };
}

const toolExecutors: Record<string, (args: Record<string, string>) => Promise<any>> = {
  get_revenue: executeGetRevenue,
  get_settlement: executeGetSettlement,
  get_partner_info: executeGetPartnerInfo,
  get_work_info: executeGetWorkInfo,
  get_mg_balance: executeGetMgBalance,
  get_monthly_summary: executeGetMonthlySummary,
};

// ── System prompt ──

async function buildSystemPrompt(selectedMonth: string) {
  const today = new Date().toISOString().split('T')[0];

  // 작품 목록 + 파트너 목록을 가져와서 줄임말 매칭에 활용
  const [{ data: works }, { data: partners }] = await Promise.all([
    supabase.from('rs_works').select('name').eq('is_active', true).order('name'),
    supabase.from('rs_partners').select('name').order('name'),
  ]);

  const workList = (works || []).map(w => w.name).join(', ');
  const partnerList = (partners || []).map(p => p.name).join(', ');

  return `당신은 더그림엔터테인먼트 RS 정산 비서 AI입니다.
웹툰 작품의 매출, 파트너 정산, MG, 세금 등에 대해 질문하면 도구를 사용해 데이터를 조회하고 분석해서 답변합니다.

## 등록된 작품 목록
${workList}

## 등록된 파트너 목록
${partnerList}

## 작품명/파트너명 매칭 규칙
사용자는 줄임말이나 별칭을 자주 사용합니다. 위 목록에서 가장 적합한 정식 명칭으로 매칭하세요.
예: "외지주"→"외모지상주의", "싸독"→"싸움독학", "김부"→"김부장", "퀘지주"→"퀘스트지상주의"
도구 호출 시 반드시 정식 명칭을 사용하세요.

## 데이터 구조
- 매출 5종: 국내유료(domestic_paid), 해외유료(global_paid), 국내광고(domestic_ad), 해외광고(global_ad), 2차사업(secondary)
- 정산 계산: gross_revenue × rs_rate = revenue_share → 세금/보험/MG 차감 → final_payment
- 파트너 유형: 개인(3.3%), 법인(VAT 10%), 해외법인(22%), 네이버 등

## 규칙
- 한국어로 답변
- 금액은 원(₩) 단위, 천 단위 콤마 사용
- 비율은 % 표시
- 데이터 기반 인사이트를 함께 제공
- 오늘 날짜: ${today}
- 현재 선택된 정산월: ${selectedMonth}

## 날짜 해석
- 날짜 미지정 시 → 현재 선택된 정산월(${selectedMonth}) 기준
- "지난달", "전월" 등 → ${selectedMonth} 기준 이전 월
- 특정 월 지정 시 → 해당 월로 조회

## 주의
- 도구 호출 결과가 빈 배열이면 "해당 데이터가 없습니다"라고 안내
- 파트너 이름으로 검색 시 관련된 모든 작품의 정산을 함께 보여줄 것
- 금액이 큰 경우 만원/억원 단위로 읽기 쉽게 표현`;
}

// ── API Route ──

export async function POST(request: NextRequest) {
  try {
    const { messages, selectedMonth = '2026-01' } = await request.json();

    if (!messages?.length) {
      return Response.json({ error: '메시지가 필요합니다.' }, { status: 400 });
    }

    // Convert messages to Gemini format
    const geminiMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const systemPrompt = await buildSystemPrompt(selectedMonth);

    // Initial LLM call with tools
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
        result = await executor((args || {}) as Record<string, string>);
      } else {
        result = { error: `Unknown tool: ${name}` };
      }

      // Continue conversation with tool result
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

    // Extract final text response
    const finalText = response.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('') || '응답을 생성하지 못했습니다.';

    return Response.json({ reply: finalText });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
