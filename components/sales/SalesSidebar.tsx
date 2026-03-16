'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
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
  Trophy,
  MessageCircle,
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

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
      { href: '/accounting/sales/ranking', label: '랭킹', icon: Trophy },
      { href: '/accounting/sales/growth', label: '성장률', icon: TrendingUp },
    ],
  },
  {
    label: '도구',
    items: [
      { href: '/accounting/sales/chat', label: 'AI 검색', icon: MessageCircle },
    ],
  },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export function SalesSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentConvId = searchParams.get('id');
  const isOnChat = pathname === '/accounting/sales/chat';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [hoveredConv, setHoveredConv] = useState<string | null>(null);

  const loadConversations = useCallback(() => {
    fetch('/api/accounting/sales/chat/conversations')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setConversations(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadConversations();
    const handler = () => loadConversations();
    window.addEventListener('chat-conversations-changed', handler);
    return () => window.removeEventListener('chat-conversations-changed', handler);
  }, [loadConversations]);

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/accounting/sales/chat/conversations/${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConvId === id) {
      window.location.href = '/accounting/sales/chat';
    }
  };

  return (
    <Sidebar side="right" collapsible="icon" className="border-l-0">
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

        {/* Chat History */}
        {conversations.length > 0 && (
          <SidebarGroup className="py-2">
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-2 flex items-center justify-between">
              <span>대화 기록</span>
              <Link
                href="/accounting/sales/chat"
                className="text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
                title="새 대화"
              >
                <Plus className="h-3 w-3" />
              </Link>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {conversations.map((conv) => {
                  const isActive = isOnChat && currentConvId === conv.id;
                  return (
                    <SidebarMenuItem
                      key={conv.id}
                      className="relative group/conv"
                      onMouseEnter={() => setHoveredConv(conv.id)}
                      onMouseLeave={() => setHoveredConv(null)}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-purple-400" />
                      )}
                      <SidebarMenuButton asChild isActive={isActive} tooltip={conv.title}>
                        <Link href={`/accounting/sales/chat?id=${conv.id}`}>
                          <Sparkles className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-purple-400' : 'text-sidebar-foreground/30'}`} />
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <span className={`truncate text-xs ${isActive ? 'text-sidebar-primary-foreground font-medium' : ''}`}>
                              {conv.title}
                            </span>
                            {hoveredConv !== conv.id && (
                              <span className="text-[10px] text-sidebar-foreground/30 flex-shrink-0 group-data-[collapsible=icon]:hidden">
                                {timeAgo(conv.updated_at)}
                              </span>
                            )}
                          </div>
                          {hoveredConv === conv.id && (
                            <button
                              onClick={(e) => deleteConversation(conv.id, e)}
                              className="flex-shrink-0 p-0.5 rounded text-sidebar-foreground/30 hover:text-red-400 transition-colors group-data-[collapsible=icon]:hidden"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
