import { supabase, Process } from '../supabase';

// 공정 목록 조회
export async function getProcesses(): Promise<Process[]> {
  const { data, error } = await supabase
    .from('processes')
    .select('*')
    .order('order_index', { ascending: true });

  if (error) throw error;
  return data || [];
}

// 공정 생성
export async function createProcess(process: Omit<Process, 'id' | 'created_at' | 'updated_at'>): Promise<Process> {
  const { data, error } = await supabase
    .from('processes')
    .insert(process)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 공정 업데이트
export async function updateProcess(id: string, updates: Partial<Process>): Promise<Process> {
  const { data, error } = await supabase
    .from('processes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 공정 삭제
export async function deleteProcess(id: string): Promise<void> {
  const { error } = await supabase
    .from('processes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// 공정 순서 변경
export async function reorderProcesses(processIds: string[]): Promise<void> {
  const updates = processIds.map((id, index) => ({
    id,
    order_index: index + 1
  }));

  for (const update of updates) {
    await supabase
      .from('processes')
      .update({ order_index: update.order_index })
      .eq('id', update.id);
  }
}


