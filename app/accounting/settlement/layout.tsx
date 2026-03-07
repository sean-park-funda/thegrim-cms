'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementSidebar } from '@/components/settlement/SettlementSidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';

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
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
