'use client';

import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

// 더그림 매출 기준 (원 → 억, rsRate 적용)
// rsRate: 외모지상주의=0.7, 이섭의연애=0.5, 나머지=0.6
const MONTHLY_DATA = [
  { month: '25-01', total: 7.93, top10: 6.11, top10Ratio: 77.1, 팀박태준: 10.8, 공통: 19.5, 팀꿀빨: 7.6, MAJOR: 13.6, 팀병장: 11.1, MUTE: 8.0, 전략기획팀: 1.9, 팀유호빈: 8.6, 팀숭늉: 0.3 },
  { month: '25-02', total: 6.83, top10: 5.30, top10Ratio: 77.7, 팀박태준: 15.2, 공통: 18.0, 팀꿀빨: 7.2, MAJOR: 12.1, 팀병장: 10.4, MUTE: 7.4, 전략기획팀: 2.0, 팀유호빈: 10.9, 팀숭늉: 0.3 },
  { month: '25-03', total: 6.11, top10: 4.82, top10Ratio: 79.0, 팀박태준: 14.9, 공통: 25.5, 팀꿀빨: 7.9, MAJOR: 13.0, 팀병장: 11.7, MUTE: 8.6, 전략기획팀: 2.1, 팀유호빈: 4.6, 팀숭늉: 0.2 },
  { month: '25-04', total: 5.69, top10: 4.55, top10Ratio: 80.0, 팀박태준: 17.0, 공통: 27.6, 팀꿀빨: 11.6, MAJOR: 10.9, 팀병장: 11.3, MUTE: 8.0, 전략기획팀: 4.1, 팀유호빈: 2.9, 팀숭늉: 0.2 },
  { month: '25-05', total: 5.68, top10: 4.47, top10Ratio: 78.6, 팀박태준: 16.0, 공통: 18.8, 팀꿀빨: 11.0, MAJOR: 11.6, 팀병장: 10.3, MUTE: 8.0, 전략기획팀: 8.6, 팀유호빈: 2.7, 팀숭늉: 0.2 },
  { month: '25-06', total: 5.17, top10: 4.22, top10Ratio: 81.6, 팀박태준: 22.3, 공통: 19.7, 팀꿀빨: 9.6, MAJOR: 12.8, 팀병장: 10.2, MUTE: 6.3, 전략기획팀: 7.1, 팀유호빈: 2.1, 팀숭늉: 0.2 },
  { month: '25-07', total: 6.96, top10: 5.46, top10Ratio: 78.4, 팀박태준: 9.2, 공통: 14.6, 팀꿀빨: 13.2, MAJOR: 13.3, 팀병장: 7.7, MUTE: 5.3, 전략기획팀: 8.2, 팀유호빈: 1.2, 팀숭늉: 0.2 },
  { month: '25-08', total: 6.62, top10: 4.91, top10Ratio: 74.2, 팀박태준: 13.3, 공통: 12.8, 팀꿀빨: 14.8, MAJOR: 11.3, 팀병장: 5.8, MUTE: 5.6, 전략기획팀: 6.7, 팀유호빈: 1.1, 팀숭늉: 3.2 },
  { month: '25-09', total: 6.19, top10: 4.56, top10Ratio: 73.7, 팀박태준: 12.3, 공통: 15.5, 팀꿀빨: 15.8, MAJOR: 10.8, 팀병장: 5.9, MUTE: 4.2, 전략기획팀: 11.7, 팀유호빈: 1.0, 팀숭늉: 3.6 },
  { month: '25-10', total: 6.99, top10: 5.63, top10Ratio: 80.5, 팀박태준: 11.3, 공통: 11.9, 팀꿀빨: 13.5, MAJOR: 8.2, 팀병장: 5.5, MUTE: 16.2, 전략기획팀: 11.4, 팀유호빈: 0.9, 팀숭늉: 1.6 },
  { month: '25-11', total: 8.84, top10: 7.38, top10Ratio: 83.5, 팀박태준: 37.5, 공통: 9.7, 팀꿀빨: 11.4, MAJOR: 5.5, 팀병장: 3.7, MUTE: 10.3, 전략기획팀: 6.1, 팀유호빈: 0.7, 팀숭늉: 1.0 },
  { month: '25-12', total: 10.83, top10: 9.09, top10Ratio: 84.0, 팀박태준: 37.5, 공통: 9.1, 팀꿀빨: 8.6, MAJOR: 4.4, 팀병장: 3.6, MUTE: 6.5, 전략기획팀: 16.1, 팀유호빈: 0.7, 팀숭늉: 1.2 },
  { month: '26-01', total: 11.54, top10: 8.60, top10Ratio: 74.5, 팀박태준: 35.8, 공통: 7.5, 팀꿀빨: 7.3, MAJOR: 6.8, 팀병장: 4.5, MUTE: 10.8, 전략기획팀: 11.0, 팀유호빈: 0.5, 팀숭늉: 2.4 },
  { month: '26-02', total: 12.11, top10: 8.73, top10Ratio: 72.1, 팀박태준: 31.7, 공통: 7.2, 팀꿀빨: 8.7, MAJOR: 5.7, 팀병장: 6.0, MUTE: 9.8, 전략기획팀: 10.4, 팀유호빈: 0.5, 팀숭늉: 1.2 },
  { month: '26-03', total: 14.16, top10: 10.94, top10Ratio: 77.3, 팀박태준: 32.7, 공통: 7.0, 팀꿀빨: 8.8, MAJOR: 4.2, 팀병장: 5.2, MUTE: 7.4, 전략기획팀: 13.6, 팀유호빈: 0.3, 팀숭늉: 1.2 },
  { month: '26-04', total: 13.04, top10: 9.96, top10Ratio: 76.4, 팀박태준: 35.3, 공통: 6.5, 팀꿀빨: 8.7, MAJOR: 4.7, 팀병장: 5.6, MUTE: 7.9, 전략기획팀: 13.2, 팀유호빈: 0.3, 팀숭늉: 1.3 },
  { month: '26-05', total: 13.03, top10: 10.20, top10Ratio: 78.3, 팀박태준: 37.0, 공통: 6.0, 팀꿀빨: 10.8, MAJOR: 4.5, 팀병장: 5.3, MUTE: 8.1, 전략기획팀: 15.7, 팀유호빈: 0.5, 팀숭늉: 1.6 },
];

const LABEL_COLORS: Record<string, string> = {
  '팀박태준': '#6366f1',
  '공통': '#94a3b8',
  '팀꿀빨': '#f59e0b',
  'MAJOR': '#10b981',
  '팀병장': '#ef4444',
  'MUTE': '#8b5cf6',
  '전략기획팀': '#06b6d4',
  '팀유호빈': '#f97316',
  '팀숭늉': '#84cc16',
};

const LABELS = ['팀박태준', '공통', '팀꿀빨', 'MAJOR', '팀병장', 'MUTE', '전략기획팀', '팀유호빈', '팀숭늉'];

const fmt억 = (v: number) => `${v.toFixed(2)}억`;
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-bold text-zinc-200 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-zinc-300">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          <span>{p.name}:</span>
          <span className="font-mono font-bold">
            {p.name?.includes('억') || p.name?.includes('매출') ? fmt억(p.value) : fmtPct(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SalesAnalysisPage() {
  const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set(LABELS));

  const toggleLabel = (l: string) => {
    setActiveLabels(prev => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l); else next.add(l);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-6 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white">매출 구조 분석</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          2025년 1월 ~ 2026년 5월 · 월별 · <span className="text-cyan-400 font-medium">더그림 매출 기준</span>
          <span className="ml-2 text-zinc-500">(네이버 매출 - 네이버 수수료) × RS 비율</span>
        </p>
      </div>

      {/* ── 섹션1: TOP10 점유율 ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">① TOP10 작품 점유율 추이</h2>
          <p className="text-zinc-400 text-xs mt-0.5">상위 10개 작품이 더그림 전체 매출에서 차지하는 비율</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '최고 점유율', value: '84.0%', sub: '2025-12' },
            { label: '최저 점유율', value: '72.1%', sub: '2026-02' },
            { label: '현재(26-05)', value: '78.3%', sub: '더그림 13.03억' },
            { label: '매출 성장', value: '+64%', sub: '25-01 7.93억 → 26-05 13.03억' },
          ].map(c => (
            <div key={c.label} className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/50">
              <p className="text-zinc-400 text-xs">{c.label}</p>
              <p className="text-xl font-bold text-white mt-1">{c.value}</p>
              <p className="text-zinc-500 text-xs mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={MONTHLY_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} />
              <YAxis yAxisId="left" tickFormatter={v => `${v}%`} domain={[60, 90]} tick={{ fill: '#71717a', fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}억`} tick={{ fill: '#71717a', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine yAxisId="left" y={80} stroke="#52525b" strokeDasharray="4 2" />
              <Line yAxisId="left" type="monotone" dataKey="top10Ratio" name="TOP10 점유율(%)" stroke="#818cf8" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line yAxisId="right" type="monotone" dataKey="total" name="더그림 전체 매출(억)" stroke="#34d399" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400">
                <th className="text-left p-2 rounded-tl-lg">월</th>
                <th className="text-right p-2">더그림 전체 매출</th>
                <th className="text-right p-2">TOP10 합계</th>
                <th className="text-right p-2 rounded-tr-lg">TOP10 점유율</th>
              </tr>
            </thead>
            <tbody>
              {MONTHLY_DATA.map((d, i) => (
                <tr key={d.month} className={i % 2 === 0 ? 'bg-zinc-900/50' : 'bg-zinc-900/20'}>
                  <td className="p-2 text-zinc-300 font-mono">{d.month}</td>
                  <td className="p-2 text-right text-zinc-300 font-mono">{fmt억(d.total)}</td>
                  <td className="p-2 text-right text-zinc-300 font-mono">{fmt억(d.top10)}</td>
                  <td className="p-2 text-right">
                    <span className={`font-bold font-mono ${d.top10Ratio >= 82 ? 'text-rose-400' : d.top10Ratio <= 74 ? 'text-emerald-400' : 'text-zinc-200'}`}>
                      {fmtPct(d.top10Ratio)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 섹션2: 레이블별 비중 ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">② 팀 레이블별 더그림 매출 비중 추이</h2>
          <p className="text-zinc-400 text-xs mt-0.5">레이블 클릭으로 표시/숨기기</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {LABELS.map(l => (
            <button
              key={l}
              onClick={() => toggleLabel(l)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-opacity border ${activeLabels.has(l) ? 'opacity-100' : 'opacity-30'}`}
              style={{ borderColor: LABEL_COLORS[l], color: LABEL_COLORS[l] }}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <p className="text-zinc-400 text-xs mb-3">누적 비중 (스택 바)</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={MONTHLY_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fill: '#71717a', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              {LABELS.filter(l => activeLabels.has(l)).map(l => (
                <Bar key={l} dataKey={l} stackId="a" fill={LABEL_COLORS[l]} name={l} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <p className="text-zinc-400 text-xs mb-3">비중 추이 (라인)</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={MONTHLY_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fill: '#71717a', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {LABELS.filter(l => activeLabels.has(l)).map(l => (
                <Line
                  key={l}
                  type="monotone"
                  dataKey={l}
                  stroke={LABEL_COLORS[l]}
                  strokeWidth={l === '팀박태준' ? 2.5 : 1.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400">
                <th className="text-left p-2">월</th>
                {LABELS.map(l => (
                  <th key={l} className="text-right p-2" style={{ color: LABEL_COLORS[l] }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHLY_DATA.map((d, i) => (
                <tr key={d.month} className={i % 2 === 0 ? 'bg-zinc-900/50' : 'bg-zinc-900/20'}>
                  <td className="p-2 text-zinc-300 font-mono">{d.month}</td>
                  {LABELS.map(l => {
                    const v = (d as any)[l] as number;
                    const isHigh = l === '팀박태준' ? v >= 30 : l === 'MUTE' ? v >= 14 : v >= 15;
                    return (
                      <td key={l} className={`p-2 text-right font-mono ${isHigh ? 'font-bold text-white' : 'text-zinc-400'}`}>
                        {fmtPct(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 섹션3: 인사이트 ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">③ 주요 인사이트</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { title: '팀 박태준', color: '#6366f1', desc: '외모지상주의 2025-11 런칭 후 37%+ 점유. 2026-05 기준 더그림 매출 기여 1위. 외모지상주의 단일 작품 의존도 높음.' },
            { title: '전략기획팀', color: '#06b6d4', desc: '25-01 1.9% → 26-05 15.7%로 최대 성장. 두 남자의 비서 사이(25-12 급등) + 양치기 마법사(26년 꾸준 상승) 견인.' },
            { title: '공통', color: '#94a3b8', desc: '25-04 27.6% 최고 → 26-05 6.0%로 급감. 전체 매출이 64% 성장하는 동안 절대 매출은 정체. 김부장 의존도 리스크.' },
            { title: 'MUTE', color: '#8b5cf6', desc: '25-10 밤친구 효과로 16.2% 피크 → 7~11% 안정화. 늦바람·국정원말단직원 등 포트폴리오 확대 중.' },
            { title: '팀 유호빈', color: '#f97316', desc: '25-01 8.6% → 26-05 0.5%로 급감. 퀘스트지상주의 종료 + 레벨999·냉동무사 매출 감소.' },
            { title: '팀 꿀빨', color: '#f59e0b', desc: '전기간 7~16% 안정적 유지. 태존비록이 26년 들어 순위 상승 중. 상대적으로 가장 안정적인 팀.' },
          ].map(ins => (
            <div key={ins.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ins.color }} />
                <span className="font-semibold text-white text-sm">{ins.title}</span>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed">{ins.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
