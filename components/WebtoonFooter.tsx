'use client';

import Link from 'next/link';
import { Beaker } from 'lucide-react';

export function WebtoonFooter() {
  return (
    <footer className="mt-12 pt-8 pb-6 border-t border-border/50">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-2 mb-4">
          <Beaker className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground">실험 중인 기능</h3>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/monster-generator"
            className="text-sm text-primary hover:underline transition-colors"
          >
            괴수 생성기
          </Link>
        </div>
      </div>
    </footer>
  );
}

