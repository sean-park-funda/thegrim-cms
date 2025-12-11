'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { Navigation } from '@/components/Navigation';
import { BreadcrumbNav } from '@/components/BreadcrumbNav';

export function AppLayout({ children }: { children: React.ReactNode }) {
  useAuth();

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navigation />
      <BreadcrumbNav />
      <div className="flex-1 min-h-0 bg-background">
        {children}
      </div>
    </div>
  );
}


