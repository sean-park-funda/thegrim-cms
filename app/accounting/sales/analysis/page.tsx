'use client';

import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

const MONTHLY_DATA = [
  { month: '25-01', total: 148.99, top10: 114.74, top10Ratio: 77.0, 팀박태준: 10.6, 공통: 19.6, 팀꿀빨: 7.5, MAJOR: 13.7, 팀병장: 11.2, MUTE: 7.8, 전략기획팀: 1.9, 팀유호빈: 8.7, 팀숭늉: 0.3 },
  { month: '25-02', total: 127.86, top10: 99.09, top10Ratio: 77.5, 팀박태준: 14.9, 공통: 18.2, 팀꿀빨: 7.2, MAJOR: 12.2, 팀병장: 10.5, MUTE: 7.2, 전략기획팀: 1.9, 팀유호빈: 11.0, 팀숭늉: 0.3 },
  { month: '25-03', total: 114.03, top10: 89.84, top10Ratio: 78.8, 팀박태준: 14.5, 공통: 25.7, 팀꿀빨: 7.9, MAJOR: 13.1, 팀병장: 11.8, MUTE: 8.5, 전략기획팀: 2.1, 팀유호빈: 4.6, 팀숭늉: 0.2 },
  { month: '25-04', total: 106.19, top10: 84.79, top10Ratio: 79.8, 팀박태준: 16.6, 공통: 27.8, 팀꿀빨: 11.6, MAJOR: 11.0, 팀병장: 11.4, MUTE: 7.9, 전략기획팀: 4.1, 팀유호빈: 2.9, 팀숭늉: 0.2 },
  { month: '25-05', total: 105.81, top10: 83.03, top10Ratio: 78.5, 팀박태준: 15.7, 공통: 19.0, 팀꿀빨: 11.0, MAJOR: 11.8, 팀병장: 10.4, MUTE: 7.9, 전략기획팀: 8.7, 팀유호빈: 2.7, 팀숭늉: 0.2 },
  { month: '25-06', total: 96.30, top10: 78.41, top10Ratio: 81.4, 팀박태준: 21.9, 공통: 19.9, 팀꿀빨: 9.7, MAJOR: 12.9, 팀병장: 10.3, MUTE: 6.3, 전략기획팀: 7.1, 팀유호빈: 2.2, 팀숭늉: 0.2 },
  { month: '25-07', total: 130.20, top10: 102.02, top10Ratio: 78.4, 팀박태준: 9.0, 공통: 14.7, 팀꿀빨: 13.1, MAJOR: 13.4, 팀병장: 7.8, MUTE: 5.3, 전략기획팀: 8.1, 팀유호빈: 1.2, 팀숭늉: 0.2 },
  { month: '25-08', total: 123.64, top10: 91.53, top10Ratio: 74.0, 팀박태준: 13.0, 공통: 13.0, 팀꿀빨: 14.7, MAJOR: 11.4, 팀병장: 5.9, MUTE: 5.6, 전략기획팀: 6.6, 팀유호빈: 1.1, 팀숭늉: 3.2 },
  { month: '25-09', total: 115.47, top10: 84.99, top10Ratio: 73.6, 팀박태준: 12.1, 공통: 15.6, 팀꿀빨: 15.7, MAJOR: 10.8, 팀병장: 6.0, MUTE: 4.2, 전략기획팀: 11.6, 팀유호빈: 1.0, 팀숭늉: 3.6 },
  { month: '25-10', total: 130.35, top10: 104.79, top10Ratio: 80.4, 팀박태준: 11.1, 공통: 12.1, 팀꿀빨: 13.4, MAJOR: 8.2, 팀병장: 5.6, MUTE: 16.1, 전략기획팀: 11.3, 팀유호빈: 0.9, 팀숭늉: 1.6 },
  { month: '25-11', total: 158.92, top10: 131.51, top10Ratio: 82.8, 팀박태준: 35.0, 공통: 10.3, 팀꿀빨: 11.8, MAJOR: 5.7, 팀병장: 3.9, MUTE: 10.6, 전략기획팀: 6.2, 팀유호빈: 0.7, 팀숭늉: 1.0 },
  { month: '25-12', total: 194.05, top10: 161.63, top10Ratio: 83.3, 팀박태준: 35.0, 공통: 9.6, 팀꿀빨: 8.9, MAJOR: 4.6, 팀병장: 3.8, MUTE: 6.7, 전략기획팀: 16.6, 팀유호빈: 0.7, 팀숭늉: 1.3 },
  { month: '26-01', total: 207.39, top10: 152.24, top10Ratio: 73.4, 팀박태준: 33.3, 공통: 7.8, 팀꿀빨: 7.5, MAJOR: 7.0, 팀병장: 4.8, MUTE: 11.1, 전략기획팀: 11.3, 팀유호빈: 0.5, 팀숭늉: 2.6 },
  { month: '26-02', total: 207.33, top10: 147.54, top10Ratio: 71.2, 팀박태준: 30.5, 공통: 7.2, 팀꿀빨: 8.4, MAJOR: 5.9, 팀병장: 6.1, MUTE: 10.0, 전략기획팀: 10.9, 팀유호빈: 0.5, 팀숭늉: 1.3 },
  { month: '26-03', total: 235.65, top10: 178.08, top10Ratio: 75.6, 팀박태준: 29.0, 공통: 7.5, 팀꿀빨: 9.1, MAJOR: 4.5, 팀병장: 5.5, MUTE: 7.9, 전략기획팀: 14.8, 팀유호빈: 0.3, 팀숭늉: 1.3 },
  { month: '26-04', total: 219.28, top10: 164.70, top10Ratio: 75.1, 팀박태준: 31.9, 공통: 6.7, 팀꿀빨: 8.9, MAJOR: 5.0, 팀병장: 5.9, MUTE: 8.2, 전략기획팀: 14.1, 팀유호빈: 0.3, 팀숭늉: 1.4 },
  { month: '26-05', total: 224.49, top10: 174.28, top10Ratio: 77.6, 팀박태준: 35.2, 공통: 6.0, 팀꿀빨: 10.6, MAJOR: 4.6, 팀병장: 5.5, MUTE: 8.1, 전략기획팀: 16.4, 팀유호빈: 0.5, 팀숭늉: 1.7 },
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

const fmt억 = (v: number) => `${v.toFixed(1)}억`;
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
          <span className="font-mono font-bold">{typeof p.value === 'number' ? (p.name?.includes('억') || p.name?.includes('매출') ? fmt억(p.value) : fmtPct(p.value)) : p.value}</span>
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
        <p className="text-zinc-400 mt-1 text-sm">2025년 1월 ~ 2026년 5월 · 월별</p>
      </div>

      {/* ── 섹션1: TOP10 점유율 ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">① TOP10 작품 점유율 추이</h2>
          <p className="text-zinc-400 text-xs mt-0.5">상위 10개 작품이 전체 매출에서 차지하는 비율</p>
        </div>

        {/* 수치 카드 */}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {[
            { label: '최고 점유율', value: '83.3%', sub: '2025-12' },
            { label: '최저 점유율', value: '71.2%', sub: '2026-02' },
            { label: '현재(25-05)', value: '77.6%', sub: '2026-05' },
            { label: '전체 매출 성장', value: '+51%', sub: '25-01 → 26-05' },
            { label: '25-01 전체 매출', value: '149억', sub: '→ 26-05 225억' },
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
              <ReferenceLine yAxisId="left" y={80} stroke="#52525b" strokeDasharray="4 2" label={{ value: '80%', fill: '#71717a', fontSize: 10 }} />
              <Line yAxisId="left" type="monotone" dataKey="top10Ratio" name="TOP10 점유율(%)" stroke="#818cf8" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line yAxisId="right" type="monotone" dataKey="total" name="전체 매출(억)" stroke="#34d399" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 표 */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400">
                <th className="text-left p-2 rounded-tl-lg">월</th>
                <th className="text-right p-2">전체 매출</th>
                <th className="text-right p-2">TOP10 합계</th>
                <th className="text-right p-2 rounded-tr-lg">TOP10 점유율</th>
              </tr>
            </thead>
            <tbody>
              {MONTHLY_DATA.map((d, i) => (
                <tr key={d.month} className={i % 2 === 0 ? 'bg-zinc-900/50' : 'bg-zinc-900/20'}>
                  <td className="p-2 text-zinc-300 font-mono">{d.month}</td>
                  <td className="p-2 text-right text-zinc-300">{fmt억(d.total)}</td>
                  <td className="p-2 text-right text-zinc-300">{fmt억(d.top10)}</td>
                  <td className="p-2 text-right">
                    <span className={`font-bold ${d.top10Ratio >= 82 ? 'text-rose-400' : d.top10Ratio <= 73 ? 'text-emerald-400' : 'text-zinc-200'}`}>
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
          <h2 className="text-lg font-semibold text-white">② 팀 레이블별 매출 비중 추이</h2>
          <p className="text-zinc-400 text-xs mt-0.5">레이블을 클릭해 표시/숨기기</p>
        </div>

        {/* 레이블 토글 */}
        <div className="flex flex-wrap gap-2">
          {LABELS.map(l => (
            <button
              key={l}
              onClick={() => toggleLabel(l)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-opacity border ${
                activeLabels.has(l) ? 'opacity-100' : 'opacity-30'
              }`}
              style={{ borderColor: LABEL_COLORS[l], color: LABEL_COLORS[l] }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* 스택 바 차트 */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <ResponsiveContainer width="100%" height={320}>
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

        {/* 라인 차트 */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <p className="text-zinc-400 text-xs mb-3">주요 레이블 추이 (라인)</p>
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

        {/* 레이블 표 */}
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
                    const isHigh = l === '팀박태준' ? v >= 30 : v >= 15;
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
            {
              title: '팀 박태준',
              color: '#6366f1',
              desc: '외모지상주의 2025-11 런칭 후 35%+ 점유. 개짓·범죄도시0과 함께 최대 팀. 단, 외모지상주의 1개 작품 의존도 높음.',
            },
            {
              title: '전략기획팀',
              color: '#06b6d4',
              desc: '25-01 1.9% → 26-05 16.4%로 가장 큰 성장. 두 남자의 비서 사이(12월 급등) + 양치기 마법사가 견인.',
            },
            {
              title: '공통',
              color: '#94a3b8',
              desc: '25-04 최고 27.8% → 26-05 6.0%로 급감. 전체 파이가 커지면서 상대적 비중 축소. 김부장 절대 매출은 유지 중.',
            },
            {
              title: 'MUTE',
              color: '#8b5cf6',
              desc: '25-10 밤친구 효과로 16.1% 피크 → 이후 7~11% 안정화. 늦바람·국정원말단직원 추가되며 기반 확대 중.',
            },
            {
              title: '팀 유호빈',
              color: '#f97316',
              desc: '25-01 8.7% → 26-05 0.5%로 급감. 퀘스트지상주의 종료 + 레벨999 매출 감소가 주 원인.',
            },
            {
              title: '팀 꿀빨',
              color: '#f59e0b',
              desc: '전기간 8~16% 범위에서 가장 안정적. 태존비록·왕따가격투기 꾸준. 2026년 들어 소폭 상승세.',
            },
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
