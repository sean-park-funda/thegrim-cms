'use client';

import { Suspense } from 'react';
import { SearchResults } from '@/components/SearchResults';

function SearchContent() {
  return <SearchResults />;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">로딩 중...</div>}>
      <SearchContent />
    </Suspense>
  );
}

