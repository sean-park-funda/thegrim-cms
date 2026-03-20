'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { SalesSidebar } from '@/components/sales/SalesSidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile, isLoading } = useStore();

  useEffect(() => {
    if (!isLoading && profile && !canViewSales(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, isLoading, router]);

  if (!profile || !canViewSales(profile.role)) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <SalesSidebar />
      <SidebarInset>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
