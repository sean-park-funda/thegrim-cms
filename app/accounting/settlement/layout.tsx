'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementSidebar } from '@/components/settlement/SettlementSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { BreadcrumbNav } from './breadcrumb-nav';

export default function SettlementLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile, isLoading } = useStore();

  useEffect(() => {
    if (!isLoading && profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, isLoading, router]);

  if (!profile || !canViewAccounting(profile.role)) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <SidebarProvider>
      <SettlementSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <BreadcrumbNav />
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
