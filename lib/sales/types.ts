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
  works: Record<string, { date: string; amount: number }[]>;
  workStatus: Record<string, { serialEndDate: string | null }>;
  summary: {
    totalSales: number;
    dailyAverage: number;
    workCount: number;
    topWork: { name: string; total: number } | null;
    dailyTotals: { date: string; total: number }[];
    workTotals: { name: string; total: number }[];
  };
}

export type AggMode = 'daily' | 'weekly' | 'monthly';
export type WorkFilter = 'all' | 'active' | 'completed';

export function aggregateData(
  dailyTotals: { date: string; total: number }[],
  works: Record<string, { date: string; amount: number }[]>,
  mode: AggMode,
) {
  if (mode === 'daily') return { totals: dailyTotals, works };

  const keyFn = mode === 'weekly'
    ? (d: string) => {
        const dt = new Date(d);
        const day = dt.getDay();
        dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1)); // Monday
        return dt.toISOString().slice(0, 10);
      }
    : (d: string) => d.slice(0, 7);

  const aggTotals: Record<string, number> = {};
  for (const { date, total } of dailyTotals) {
    const k = keyFn(date);
    aggTotals[k] = (aggTotals[k] || 0) + total;
  }

  const aggWorks: Record<string, { date: string; amount: number }[]> = {};
  for (const [name, rows] of Object.entries(works)) {
    const m: Record<string, number> = {};
    for (const { date, amount } of rows) {
      const k = keyFn(date);
      m[k] = (m[k] || 0) + amount;
    }
    aggWorks[name] = Object.entries(m)
      .map(([date, amount]) => ({ date, amount }))
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
