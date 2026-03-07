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
  SidebarTrigger,
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
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/20">
              <Calculator className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-primary-foreground">RS 정산</span>
              <span className="text-[10px] text-sidebar-foreground/50">더그림 CMS</span>
            </div>
          </div>
          <SidebarTrigger className="text-sidebar-foreground/60 hover:text-sidebar-foreground" />
        </div>
        <div className="mt-2 group-data-[collapsible=icon]:hidden">
          <MonthSelector />
        </div>
      </SidebarHeader>

      <SidebarSeparator className="opacity-30" />

      <SidebarContent className="px-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-2">
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-2">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = 'exact' in item && item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <SidebarMenuItem key={item.href} className="relative">
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-cyan-400" />
                      )}
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <Link href={item.href}>
                          <item.icon className={isActive ? 'text-cyan-400' : ''} />
                          <span className={isActive ? 'text-sidebar-primary-foreground font-medium' : ''}>
                            {item.label}
                          </span>
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

      <SidebarSeparator className="opacity-30" />

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
