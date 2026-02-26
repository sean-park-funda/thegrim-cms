'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementHeader } from '@/components/settlement/SettlementHeader';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  LayoutDashboard,
  BookOpen,
  Users,
  Calculator,
  PiggyBank,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  ArrowRight,
  Banknote,
  FileText,
  Shield,
  BarChart3,
  Workflow,
} from 'lucide-react';

const SECTIONS = [
  { id: 'overview', label: '개요' },
  { id: 'flow', label: '정산 흐름' },
  { id: 'pages', label: '페이지 안내' },
  { id: 'tax', label: '세금 계산' },
  { id: 'mg', label: 'MG 정산' },
  { id: 'insurance', label: '예고료' },
  { id: 'export', label: '내보내기' },
  { id: 'faq', label: 'FAQ' },
];

export default function SettlementGuidePage() {
  const router = useRouter();
  const { profile } = useStore();

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

  if (!profile) return <div className="flex items-center justify-center h-full">Loading...</div>;
  if (!canViewAccounting(profile.role)) return null;

  return (
    <div className="container mx-auto p-3 md:p-6 space-y-6">
      <SettlementHeader />
      <SettlementNav />

      <Link href="/accounting/settlement">
        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기
        </button>
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 text-white">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
        <div className="absolute -right-8 -bottom-8 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            <Badge variant="secondary" className="bg-white/20 text-white border-0">v1.0</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">RS 정산 서비스 설명서</h1>
          <p className="text-blue-100 max-w-2xl leading-relaxed">
            매출 업로드부터 세금 계산, MG 차감, 정산서 발행까지 — 더그림의 수익배분(Revenue Share) 정산을 자동화하는 서비스입니다.
          </p>
        </div>
      </div>

      {/* TOC */}
      <Card>
        <CardContent className="py-4">
          <nav className="flex flex-wrap items-center gap-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="px-3 py-1.5 text-sm rounded-full border hover:bg-muted transition-colors"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </CardContent>
      </Card>

      <div className="space-y-10">
        {/* 1. 개요 */}
        <section id="overview" className="scroll-mt-24 space-y-4">
          <SectionHeading icon={<LayoutDashboard className="h-5 w-5" />} title="개요" />
          <div className="grid md:grid-cols-3 gap-4">
            <FeatureCard
              icon={<Upload className="h-5 w-5 text-blue-600" />}
              title="매출 업로드"
              desc="엑셀 매출 데이터를 수익유형별로 업로드. 기존 데이터는 자동 덮어쓰기."
            />
            <FeatureCard
              icon={<Calculator className="h-5 w-5 text-green-600" />}
              title="자동 정산"
              desc="RS요율 × 매출로 수익분배금 산출, 세금·MG 차감 후 최종 지급액 자동 계산."
            />
            <FeatureCard
              icon={<FileSpreadsheet className="h-5 w-5 text-purple-600" />}
              title="정산서·내보내기"
              desc="파트너별 정산서 조회, 수익정산금 집계·RS검증 등 엑셀 내보내기 지원."
            />
          </div>
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="py-4">
              <h4 className="font-semibold text-sm mb-3">데이터 구조</h4>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <DataBox label="rs_works" desc="작품 마스터" color="blue" />
                <DataBox label="rs_partners" desc="파트너(작가/사업자)" color="green" />
                <DataBox label="rs_work_partners" desc="작품-파트너 계약" color="purple" />
                <DataBox label="rs_revenues" desc="월별 매출 데이터" color="orange" />
                <DataBox label="rs_settlements" desc="정산 결과" color="red" />
                <DataBox label="rs_mg_balances" desc="MG 잔액 이력" color="yellow" />
                <DataBox label="rs_revenue_uploads" desc="업로드 이력" color="gray" />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 2. 정산 흐름 */}
        <section id="flow" className="scroll-mt-24 space-y-4">
          <SectionHeading icon={<Workflow className="h-5 w-5" />} title="정산 흐름" />
          <div className="space-y-0">
            <FlowStep
              step={1}
              title="작품·파트너 등록"
              desc="작품과 파트너를 등록하고, 작품-파트너 간 계약(RS요율, MG 적용 여부, 계약기간 등)을 설정합니다."
              link="/accounting/settlement/works"
              linkLabel="작품 관리"
            />
            <FlowConnector />
            <FlowStep
              step={2}
              title="매출 엑셀 업로드"
              desc="더그림 매출마스터 엑셀에서 수익유형(국내유료, 글로벌유료, 국내광고, 글로벌광고, 2차사업)별로 데이터를 업로드합니다. 같은 월·유형은 자동 덮어쓰기됩니다."
              link="/accounting/settlement/upload"
              linkLabel="업로드"
            />
            <FlowConnector />
            <FlowStep
              step={3}
              title="정산 계산 실행"
              desc="'정산 계산' 버튼을 누르면 매출 × RS요율로 수익분배금을 산출하고, 세금(10원 절사) 및 MG 차감을 자동 적용하여 최종 지급액을 계산합니다."
              link="/accounting/settlement/settlements"
              linkLabel="정산"
            />
            <FlowConnector />
            <FlowStep
              step={4}
              title="검증·확인"
              desc="RS검증 뷰에서 산출분배금 vs DB분배금 차이를 확인하고, 수익정산금 집계에서 파트너별 합계·세금·예고료·MG차감 등을 검토합니다."
              link="/accounting/settlement/verification"
              linkLabel="RS검증"
            />
            <FlowConnector />
            <FlowStep
              step={5}
              title="정산서 발행·내보내기"
              desc="파트너별 정산서를 조회하고, 각 뷰를 엑셀로 내보내어 최종 확인 및 지급 처리를 진행합니다."
              link="/accounting/settlement/partners"
              linkLabel="파트너 정산서"
            />
          </div>
        </section>

        {/* 3. 페이지 안내 */}
        <section id="pages" className="scroll-mt-24 space-y-4">
          <SectionHeading icon={<BarChart3 className="h-5 w-5" />} title="페이지 안내" />
          <div className="space-y-3">
            <PageRow
              href="/accounting/settlement"
              icon={<LayoutDashboard className="h-4 w-4" />}
              name="대시보드"
              desc="총 매출, 정산 합계, 작품/파트너 수 등 핵심 지표를 한눈에 확인합니다."
              badge="메인"
              badgeColor="blue"
            />
            <PageRow
              href="/accounting/settlement/works"
              icon={<BookOpen className="h-4 w-4" />}
              name="작품"
              desc="작품 목록 조회, 작품별 매출·정산 상세, 파트너 연결 현황을 확인합니다."
            />
            <PageRow
              href="/accounting/settlement/partners"
              icon={<Users className="h-4 w-4" />}
              name="파트너"
              desc="파트너 목록, 파트너 상세(계약 작품, 월별 추이), 개별 정산서를 조회합니다."
            />
            <PageRow
              href="/accounting/settlement/settlements"
              icon={<Calculator className="h-4 w-4" />}
              name="정산"
              desc="수익정산금 집계(파트너별 합산), RS검증(산출 vs DB 비교) 뷰를 제공합니다."
              badge="집계"
              badgeColor="green"
            />
            <PageRow
              href="/accounting/settlement/mg"
              icon={<PiggyBank className="h-4 w-4" />}
              name="MG현황"
              desc="최소보장금(MG) 잔액 현황, 추가/차감 이력, 작품별 MG 추이를 관리합니다."
            />
            <PageRow
              href="/accounting/settlement/contracts"
              icon={<FileText className="h-4 w-4" />}
              name="계약 테이블"
              desc="작품-파트너 간 RS요율, MG요율, 계약구분, 계약기간 등 전체 계약 현황을 조회합니다."
            />
            <PageRow
              href="/accounting/settlement/verification"
              icon={<Shield className="h-4 w-4" />}
              name="RS검증"
              desc="매출 × RS요율 산출 분배금과 DB 저장값을 비교하여 불일치를 탐지합니다. MG요율도 표시됩니다."
              badge="검증"
              badgeColor="amber"
            />
          </div>
        </section>

        {/* 4. 세금 계산 */}
        <section id="tax" className="scroll-mt-24 space-y-4">
          <SectionHeading icon={<Banknote className="h-5 w-5" />} title="세금 계산" />
          <Card>
            <CardContent className="py-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                모든 세금은 <strong>10원 미만 절사</strong> 방식으로 계산됩니다 (Excel 정산서 방식).
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="py-2 px-3 text-left font-semibold">파트너 유형</th>
                      <th className="py-2 px-3 text-left font-semibold">소득세</th>
                      <th className="py-2 px-3 text-left font-semibold">지방세</th>
                      <th className="py-2 px-3 text-left font-semibold">부가세</th>
                      <th className="py-2 px-3 text-left font-semibold">합계세율</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 px-3"><Badge variant="outline">개인</Badge></td>
                      <td className="py-2 px-3 tabular-nums">수익정산금 × 3%</td>
                      <td className="py-2 px-3 tabular-nums">소득세 × 10%</td>
                      <td className="py-2 px-3 text-muted-foreground">-</td>
                      <td className="py-2 px-3 font-medium">3.3%</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 px-3"><Badge variant="outline">사업자(국내)</Badge></td>
                      <td className="py-2 px-3 text-muted-foreground">-</td>
                      <td className="py-2 px-3 text-muted-foreground">-</td>
                      <td className="py-2 px-3 tabular-nums">수익정산금 × 10%</td>
                      <td className="py-2 px-3 font-medium">별도 청구</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 px-3"><Badge variant="outline">사업자(해외)</Badge></td>
                      <td className="py-2 px-3 tabular-nums">수익정산금 × 20%</td>
                      <td className="py-2 px-3 tabular-nums">소득세 × 10%</td>
                      <td className="py-2 px-3 text-muted-foreground">-</td>
                      <td className="py-2 px-3 font-medium">22%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                <strong>예시 (한남수):</strong> 수익정산금 87,340원 일 때<br />
                소득세 = floor(87,340 × 0.03 / 10) × 10 = <strong>2,620원</strong><br />
                지방세 = floor(2,620 × 0.1 / 10) × 10 = <strong>260원</strong><br />
                세액 합계 = 2,880원
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 5. MG 정산 */}
        <section id="mg" className="scroll-mt-24 space-y-4">
          <SectionHeading icon={<PiggyBank className="h-5 w-5" />} title="MG 정산 (최소보장금)" />
          <Card>
            <CardContent className="py-5 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                MG(Minimum Guarantee)는 작가에게 미리 지급한 선급금입니다.
                정산 시 수익분배금에서 세금을 뺀 금액이 MG 잔액보다 크면, 해당 금액만큼 MG를 차감합니다.
              </p>
              <div className="p-4 bg-muted/50 rounded-lg space-y-2 text-sm font-mono">
                <p>수익정산금 = 매출 × RS요율 - 제작비 + 조정</p>
                <p>세후금액 = 수익정산금 - 세액</p>
                <p>MG차감 = min(MG잔액, max(0, 세후금액))</p>
                <p>최종지급 = 세후금액 - MG차감</p>
              </div>
              <div className="space-y-2 text-sm">
                <h4 className="font-semibold">MG 전체 이력</h4>
                <p className="text-muted-foreground">
                  파트너 정산서에서 당월 MG 차감뿐 아니라, MG 시작부터 현재까지의 전체 이력(추가/차감/잔액)을
                  접기/펼치기로 확인할 수 있습니다.
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <h4 className="font-semibold">MG요율 vs RS요율</h4>
                <p className="text-muted-foreground">
                  일부 계약은 MG 적용 시 별도의 MG요율을 사용합니다.
                  RS검증 뷰에서 RS요율과 MG요율을 나란히 확인할 수 있습니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 6. 예고료 */}
        <section id="insurance" className="scroll-mt-24 space-y-4">
          <SectionHeading icon={<Shield className="h-5 w-5" />} title="예고료 (고용보험)" />
          <Card>
            <CardContent className="py-5 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong>개인 사업소득자</strong>이면서 수익정산금이 양수인 경우, 고용보험 예고료가 차감됩니다.
              </p>
              <div className="p-4 bg-muted/50 rounded-lg text-sm font-mono">
                예고료 = floor(수익정산금 × 0.75 × 0.008)
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg text-sm text-purple-800 dark:text-purple-200">
                <strong>예시:</strong> 수익정산금 9,582,819원 (개인)<br />
                예고료 = floor(9,582,819 × 0.75 × 0.008) = <strong>57,496원</strong><br />
                수익정산금 집계 테이블의 '예고료' 컬럼에서 확인 가능합니다.
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 7. 내보내기 */}
        <section id="export" className="scroll-mt-24 space-y-4">
          <SectionHeading icon={<FileSpreadsheet className="h-5 w-5" />} title="엑셀 내보내기" />
          <Card>
            <CardContent className="py-5">
              <div className="space-y-3">
                {[
                  { type: 'revenue', name: '매출액 집계', desc: '작품별 수익유형별 매출 합계' },
                  { type: 'settlement', name: 'RS 정산', desc: '작품×파트너별 정산 상세' },
                  { type: 'settlement-summary', name: '수익정산금 집계', desc: '파트너별 합산 (세금, 예고료, MG차감 포함)' },
                  { type: 'verification', name: 'RS 검증', desc: '산출분배금 vs DB분배금 비교' },
                  { type: 'contracts', name: '계약 테이블', desc: '전체 작품-파트너 계약 현황' },
                  { type: 'mg-summary', name: 'MG 현황', desc: '월별 MG 잔액 추이' },
                ].map((item) => (
                  <div key={item.type} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                    <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{item.desc}</span>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{item.type}</Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                각 페이지 상단의 '내보내기' 버튼 또는 API <code className="bg-muted px-1 py-0.5 rounded">/api/accounting/settlement/export?month=YYYY-MM&type=...</code> 로 다운로드 가능합니다.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* 8. FAQ */}
        <section id="faq" className="scroll-mt-24 space-y-4">
          <SectionHeading icon={<CheckCircle2 className="h-5 w-5" />} title="자주 묻는 질문" />
          <div className="space-y-3">
            <FaqItem
              q="매출 데이터를 다시 업로드하면 어떻게 되나요?"
              a="같은 월·수익유형의 데이터는 자동으로 덮어쓰기(upsert)됩니다. 이전 값이 새 값으로 교체되고, 업로드 이력이 기록됩니다."
            />
            <FaqItem
              q="정산 계산은 언제 실행해야 하나요?"
              a="매출 업로드 후, 또는 계약 정보(RS요율, MG 등)를 수정한 후에 '정산 계산' 버튼을 눌러주세요. 기존 정산 결과를 덮어씁니다."
            />
            <FaqItem
              q="세금 금액이 Excel과 미세하게 다릅니다."
              a="본 서비스는 Excel과 동일한 '10원 미만 절사' 방식을 사용합니다. 차이가 있다면 RS검증 뷰에서 불일치 항목을 확인해주세요."
            />
            <FaqItem
              q="MG를 수동으로 추가할 수 있나요?"
              a="파트너 상세 페이지에서 'MG 추가' 버튼으로 특정 작품에 MG를 추가할 수 있습니다. 메모도 함께 기록 가능합니다."
            />
            <FaqItem
              q="네이버 파트너는 세금이 어떻게 되나요?"
              a="네이버 파트너는 세금 0%로 처리됩니다. 소득구분은 '네이버', 신고구분은 '-'로 표시됩니다."
            />
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground py-8 border-t">
        RS 정산 서비스 설명서 &middot; 더그림
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="p-1.5 rounded-lg bg-primary/10 text-primary">{icon}</div>
      <h2 className="text-xl font-bold">{title}</h2>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="py-5 space-y-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </CardContent>
    </Card>
  );
}

function DataBox({ label, desc, color }: { label: string; desc: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30',
    green: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30',
    purple: 'border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/30',
    orange: 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30',
    red: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
    yellow: 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30',
    gray: 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/30',
  };
  return (
    <div className={`p-2.5 rounded-lg border ${colors[color] || colors.gray}`}>
      <code className="text-xs font-semibold">{label}</code>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </div>
  );
}

function FlowStep({ step, title, desc, link, linkLabel }: { step: number; title: string; desc: string; link: string; linkLabel: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
        {step}
      </div>
      <div className="flex-1 p-4 border rounded-xl hover:bg-muted/30 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-sm">{title}</h3>
          <Link href={link} className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0">
            {linkLabel} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="flex gap-4">
      <div className="w-8 flex justify-center">
        <div className="w-0.5 h-4 bg-border" />
      </div>
    </div>
  );
}

function PageRow({ href, icon, name, desc, badge, badgeColor }: { href: string; icon: React.ReactNode; name: string; desc: string; badge?: string; badgeColor?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  };
  return (
    <Link href={href}>
      <div className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/40 hover:shadow-sm transition-all group">
        <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{name}</span>
            {badge && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colorMap[badgeColor || 'blue']}`}>
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{desc}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <h4 className="text-sm font-semibold">{q}</h4>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{a}</p>
      </CardContent>
    </Card>
  );
}
