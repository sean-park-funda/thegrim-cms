import { SupabaseClient } from '@supabase/supabase-js';
import { normalizeWorkName } from './excel-parser';

interface MergeResult {
  merged: { kept: string; removed: string; kept_name: string; removed_name: string }[];
  errors: string[];
}

/**
 * normalizeWorkName 기준으로 중복 작품을 감지하고 병합한다.
 * - primary: work_partners가 많은 쪽 (같으면 먼저 생성된 쪽)
 * - duplicate의 revenues, settlements, mg_balances를 primary로 이관
 * - primary의 naver_name을 띄어쓰기 있는 이름으로 설정 (엑셀 매칭용)
 * - duplicate 삭제
 */
export async function deduplicateWorks(supabase: SupabaseClient): Promise<MergeResult> {
  const result: MergeResult = { merged: [], errors: [] };

  const { data: works, error } = await supabase
    .from('rs_works')
    .select('id, name, naver_name, created_at');
  if (error || !works) {
    result.errors.push('작품 목록 조회 실패');
    return result;
  }

  const { data: allWps } = await supabase
    .from('rs_work_partners')
    .select('work_id');

  const wpCountMap = new Map<string, number>();
  if (allWps) {
    for (const wp of allWps) {
      wpCountMap.set(wp.work_id, (wpCountMap.get(wp.work_id) || 0) + 1);
    }
  }

  const groups = new Map<string, typeof works>();
  for (const w of works) {
    const norm = normalizeWorkName(w.name);
    const group = groups.get(norm) || [];
    group.push(w);
    groups.set(norm, group);
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    group.sort((a, b) => {
      const aCount = wpCountMap.get(a.id) || 0;
      const bCount = wpCountMap.get(b.id) || 0;
      if (aCount !== bCount) return bCount - aCount;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const primary = group[0];
    const duplicates = group.slice(1);

    for (const dup of duplicates) {
      try {
        await mergeWork(supabase, primary.id, dup.id);

        // naver_name: 띄어쓰기가 있는 이름(엑셀 원본)을 naver_name에 보존
        const spacedName = [primary.name, dup.name].find(n => n.includes(' '));
        if (spacedName && primary.naver_name !== spacedName) {
          await supabase
            .from('rs_works')
            .update({ naver_name: spacedName })
            .eq('id', primary.id);
        }

        result.merged.push({
          kept: primary.id,
          removed: dup.id,
          kept_name: primary.name,
          removed_name: dup.name,
        });
      } catch (e) {
        result.errors.push(`병합 실패: ${primary.name} ← ${dup.name}: ${e}`);
      }
    }
  }

  return result;
}

async function mergeWork(supabase: SupabaseClient, primaryId: string, dupId: string) {
  // 1) rs_revenues: 중복 → primary로 이관 (동일 월이면 금액 합산)
  const { data: dupRevenues } = await supabase
    .from('rs_revenues')
    .select('*')
    .eq('work_id', dupId);

  if (dupRevenues) {
    for (const rev of dupRevenues) {
      const { data: existing } = await supabase
        .from('rs_revenues')
        .select('id, domestic_paid, global_paid, domestic_ad, global_ad, secondary')
        .eq('work_id', primaryId)
        .eq('month', rev.month)
        .single();

      if (existing) {
        await supabase
          .from('rs_revenues')
          .update({
            domestic_paid: Number(existing.domestic_paid) + Number(rev.domestic_paid),
            global_paid: Number(existing.global_paid) + Number(rev.global_paid),
            domestic_ad: Number(existing.domestic_ad) + Number(rev.domestic_ad),
            global_ad: Number(existing.global_ad) + Number(rev.global_ad),
            secondary: Number(existing.secondary) + Number(rev.secondary),
          })
          .eq('id', existing.id);
        await supabase.from('rs_revenues').delete().eq('id', rev.id);
      } else {
        await supabase
          .from('rs_revenues')
          .update({ work_id: primaryId })
          .eq('id', rev.id);
      }
    }
  }

  // 2) rs_settlements: work_id 변경
  await supabase
    .from('rs_settlements')
    .update({ work_id: primaryId })
    .eq('work_id', dupId);

  // 3) rs_mg_balances: work_id 변경
  await supabase
    .from('rs_mg_balances')
    .update({ work_id: primaryId })
    .eq('work_id', dupId);

  // 4) rs_work_partners: 중복에만 있는 파트너 연결은 primary로 이관
  const { data: dupWps } = await supabase
    .from('rs_work_partners')
    .select('id, partner_id')
    .eq('work_id', dupId);

  if (dupWps) {
    const { data: primaryWps } = await supabase
      .from('rs_work_partners')
      .select('partner_id')
      .eq('work_id', primaryId);

    const primaryPartnerIds = new Set((primaryWps || []).map(wp => wp.partner_id));

    for (const wp of dupWps) {
      if (primaryPartnerIds.has(wp.partner_id)) {
        await supabase.from('rs_work_partners').delete().eq('id', wp.id);
      } else {
        await supabase
          .from('rs_work_partners')
          .update({ work_id: primaryId })
          .eq('id', wp.id);
      }
    }
  }

  // 5) 중복 작품 삭제
  await supabase.from('rs_works').delete().eq('id', dupId);
}
