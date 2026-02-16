'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PartnerRevenuePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/accounting/settlement/partners');
  }, [router]);
  return null;
}
