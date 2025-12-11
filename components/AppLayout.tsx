'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { Navigation } from '@/components/Navigation';

export function AppLayout({ children }: { children: React.ReactNode }) {
  useAuth();

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navigation />
      <div className="flex-1 overflow-hidden bg-background">
        {children}
      </div>
    </div>
  );
}


