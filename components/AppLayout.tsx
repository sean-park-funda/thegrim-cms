'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { Navigation } from '@/components/Navigation';
import { BreadcrumbNav } from '@/components/BreadcrumbNav';
import { ImageModelProvider } from '@/lib/contexts/ImageModelContext';

export function AppLayout({ children }: { children: React.ReactNode }) {
  useAuth();

  return (
    <ImageModelProvider>
      <div className="flex flex-col h-screen bg-background">
        <Navigation />
        <BreadcrumbNav />
        <div className="flex-1 min-h-0 bg-background">
          {children}
        </div>
      </div>
    </ImageModelProvider>
  );
}


