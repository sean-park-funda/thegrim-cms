export interface DailySalesRow {
  id: string;
  account_id: number;
  work_name: string;
  sale_date: string;
  platform: string;
  amount: string;
}

export interface DailySalesData {
  sales: DailySalesRow[];
  works: Record<string, { date: string; amount: number; marketFee?: number }[]>;
  workStatus: Record<string, { serialEndDate: string | null }>;
  workIdMap: Record<string, string>;
  summary: {
    totalSales: number;
    dailyAverage: number;
    workCount: number;
    topWork: { name: string; total: number } | null;
    dailyTotals: { date: string; total: number }[];
    workTotals: { name: string; total: number }[];
  };
}

const SALES_NAME_MAP: Record<string, string> = {
  '간첩 18세': '간첩18세',
  '공주님 학교가신다': '공주님 학교 가신다',
  '구룡:사로카': '구룡: 사로카',
  '레벨999 고블린': '레벨 999고블린',
  '매지컬 급식:암살법사': '매지컬급식: 암살법사',
  '범죄도시0': '범죄도시 제로',
  '소극적 인간': '소극적인간',
  '오! 나의 교주님': '오나의교주님',
  '욕망일기Deep': '욕망일기DEEP',
  '좋아? 죽어!': '좋아?죽어!',
  '캐슬2:만인지상': '캐슬2: 만인지상',
};

export function normalizeSalesData(data: DailySalesData): DailySalesData {
  const mapName = (n: string) => SALES_NAME_MAP[n] || n;

  const works: Record<string, { date: string; amount: number; marketFee?: number }[]> = {};
  for (const [name, rows] of Object.entries(data.works)) {
    const mapped = mapName(name);
    if (works[mapped]) {
      works[mapped] = works[mapped].concat(rows);
    } else {
      works[mapped] = rows;
    }
  }

  const workStatus: Record<string, { serialEndDate: string | null }> = {};
  for (const [name, status] of Object.entries(data.workStatus)) {
    workStatus[mapName(name)] = status;
  }

  const workIdMap: Record<string, string> = {};
  for (const [name, id] of Object.entries(data.workIdMap)) {
    workIdMap[mapName(name)] = id;
  }

  const workTotals = data.summary.workTotals.reduce<{ name: string; total: number }[]>((acc, w) => {
    const mapped = mapName(w.name);
    const existing = acc.find(a => a.name === mapped);
    if (existing) {
      existing.total += w.total;
    } else {
      acc.push({ name: mapped, total: w.total });
    }
    return acc;
  }, []).sort((a, b) => b.total - a.total);

  return {
    ...data,
    works,
    workStatus,
    workIdMap,
    summary: {
      ...data.summary,
      workCount: workTotals.length,
      topWork: workTotals[0] || null,
      workTotals,
    },
  };
}

export type AggMode = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type WorkFilter = 'all' | 'active' | 'completed';

export function aggregateData(
  dailyTotals: { date: string; total: number }[],
  works: Record<string, { date: string; amount: number; marketFee?: number }[]>,
  mode: AggMode,
) {
  if (mode === 'daily') return { totals: dailyTotals, works };

  const keyFn =
    mode === 'weekly'
      ? (d: string) => {
          const dt = new Date(d);
          const day = dt.getDay();
          dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1));
          return dt.toISOString().slice(0, 10);
        }
      : mode === 'quarterly'
        ? (d: string) => {
            const m = parseInt(d.slice(5, 7), 10);
            const q = Math.ceil(m / 3);
            return `${d.slice(0, 4)}-Q${q}`;
          }
        : mode === 'yearly'
          ? (d: string) => d.slice(0, 4)
          : (d: string) => d.slice(0, 7);

  const aggTotals: Record<string, number> = {};
  for (const { date, total } of dailyTotals) {
    const k = keyFn(date);
    aggTotals[k] = (aggTotals[k] || 0) + total;
  }

  const aggWorks: Record<string, { date: string; amount: number; marketFee?: number }[]> = {};
  for (const [name, rows] of Object.entries(works)) {
    const m: Record<string, { amount: number; marketFee: number }> = {};
    for (const { date, amount, marketFee } of rows) {
      const k = keyFn(date);
      if (!m[k]) m[k] = { amount: 0, marketFee: 0 };
      m[k].amount += amount;
      m[k].marketFee += marketFee || 0;
    }
    aggWorks[name] = Object.entries(m)
      .map(([date, v]) => ({ date, amount: v.amount, marketFee: v.marketFee }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    totals: Object.entries(aggTotals)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    works: aggWorks,
  };
}

export const WORK_COLORS = [
  '#2563eb', '#a855f7', '#0d9488', '#f59e0b', '#6366f1',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
  '#84cc16', '#e11d48', '#0ea5e9', '#d946ef', '#22c55e',
];

export const PRESETS = [
  { label: '7일', days: 7 },
  { label: '14일', days: 14 },
  { label: '30일', days: 30 },
  { label: '60일', days: 60 },
  { label: '90일', days: 90 },
];

export function fmtShort(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString();
}

export function fmtWon(n: number) {
  return `₩${n.toLocaleString()}`;
}

export function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function getDateRange(days: number) {
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  return { from: dateStr(fromDate), to: dateStr(now) };
}
