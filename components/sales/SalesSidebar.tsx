'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  SidebarFooter,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  TrendingUp,
  BookOpen,
  GitCompareArrows,
  Trophy,
  MessageCircle,
  Activity,
  ArrowLeft,
} from 'lucide-react';

const navGroups = [
  {
    label: '개요',
    items: [
      { href: '/accounting/sales', label: '대시보드', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: '분석',
    items: [
      { href: '/accounting/sales/works', label: '작품별 매출', icon: BookOpen },
      { href: '/accounting/sales/compare', label: '비교 분석', icon: GitCompareArrows },
      { href: '/accounting/sales/ranking', label: '랭킹', icon: Trophy },
    ],
  },
  {
    label: '도구',
    items: [
      { href: '/accounting/sales/chat', label: 'AI 검색', icon: MessageCircle },
      { href: '/accounting/sales/status', label: '데이터 현황', icon: Activity },
    ],
  },
];

export function SalesSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/20">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-primary-foreground">매출 분석</span>
              <span className="text-[10px] text-sidebar-foreground/50">일별 매출 대시보드</span>
            </div>
          </div>
          <SidebarTrigger className="text-sidebar-foreground/60 hover:text-sidebar-foreground" />
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
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="회계 홈">
              <Link href="/accounting">
                <ArrowLeft />
                <span>회계 홈</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
