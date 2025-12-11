import { getProcesses } from '@/lib/api/processes';
import { ProcessView } from '@/components/ProcessView';

export default async function ProcessesPage() {
  const processes = await getProcesses();

  return <ProcessView initialProcesses={processes} />;
}

