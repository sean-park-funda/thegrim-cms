'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canManageAccounting } from '@/lib/utils/permissions';
import { MonthSelector } from './MonthSelector';
import { RevenueUploadForm } from './RevenueUploadForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Calculator,
  Landmark,
  Shield,
  UserCog,
  Upload,
  HelpCircle,
  FileText,
  FileCheck,
  BarChart3,
} from 'lucide-react';

const navGroups = [
  {
    label: '개요',
    items: [
      { href: '/accounting/settlement', label: '대시보드', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: '데이터 관리',
    items: [
      { href: '/accounting/settlement/works', label: '작품', icon: BookOpen },
      { href: '/accounting/settlement/partners', label: '파트너', icon: Users },
      { href: '/accounting/settlement/staff', label: '인력', icon: UserCog },
      { href: '/accounting/settlement/contracts', label: '계약', icon: FileText },
    ],
  },
  {
    label: '정산',
    items: [
      { href: '/accounting/settlement/settlements', label: '정산 내역', icon: Calculator },
      { href: '/accounting/settlement/mg', label: 'MG 현황', icon: Landmark },
      { href: '/accounting/settlement/insurance', label: '예고료', icon: Shield },
    ],
  },
  {
    label: '분석',
    items: [
      { href: '/accounting/settlement/revenue', label: '매출 현황', icon: BarChart3 },
      { href: '/accounting/settlement/partner-revenue', label: '파트너별 매출', icon: BarChart3 },
      { href: '/accounting/settlement/verification', label: '검증', icon: FileCheck },
    ],
  },
];

export function SettlementSidebar() {
  const pathname = usePathname();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [uploadOpen, setUploadOpen] = useState(false);
  const canManage = profile && canManageAccounting(profile.role);

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Calculator className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">RS 정산</span>
            <span className="text-[10px] text-muted-foreground">더그림 CMS</span>
          </div>
        </div>
        <div className="group-data-[collapsible=icon]:hidden">
          <MonthSelector />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = 'exact' in item && item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          {canManage && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="업로드" onClick={() => setUploadOpen(true)}>
                <Upload />
                <span>매출 업로드</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="가이드">
              <Link href="/accounting/settlement/guide">
                <HelpCircle />
                <span>서비스 설명서</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>매출 엑셀 업로드 — {selectedMonth}</DialogTitle>
          </DialogHeader>
          <RevenueUploadForm />
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
