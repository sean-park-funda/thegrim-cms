'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SalesSidebar } from '@/components/sales/SalesSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { TrendingUp } from 'lucide-react';

export default function SalesLayout({ children }: { children: React.ReactNode }) {
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
      <SalesSidebar />
      <SidebarInset>
        <div className="flex md:hidden items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <SidebarTrigger className="text-zinc-400 hover:text-zinc-200" />
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-blue-500">
            <TrendingUp className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-medium flex-1">매출 분석</span>
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
