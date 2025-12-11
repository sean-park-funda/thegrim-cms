'use client';

import { useParams } from 'next/navigation';
import { ProcessView } from '@/components/ProcessView';

export default function ProcessDetailPage() {
  const params = useParams();
  const processId = params.processId as string;

  return <ProcessView processId={processId} />;
}

