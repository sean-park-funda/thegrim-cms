import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 서버 사이드에서 사용할 Supabase 클라이언트 (Service Role Key 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileIds, currentUserId } = body as { fileIds: string[]; currentUserId?: string };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    // RPC 함수를 사용하여 파생 이미지 개수 조회
    // 이 방식은 URL 길이 제한 없이 많은 파일 ID를 처리할 수 있음
    const { data: rpcResult, error: rpcError } = await supabase.rpc('get_derived_counts', {
      file_ids: fileIds,
      user_id: currentUserId || null
    });

    if (!rpcError && rpcResult) {
      // RPC 결과를 counts 객체로 변환
      const counts: Record<string, number> = {};
      for (const row of rpcResult) {
        if (row.source_file_id) {
          counts[row.source_file_id] = Number(row.count);
        }
      }
      return NextResponse.json({ counts });
    }

    // RPC 실패 시 기존 방식으로 fallback (청크로 나누어 처리)
    console.warn('[파생 이미지 개수] RPC 실패, 청크 방식으로 fallback:', rpcError?.message);
    
    const counts: Record<string, number> = {};
    const chunkSize = 100; // 한 번에 처리할 파일 ID 수
    
    for (let i = 0; i < fileIds.length; i += chunkSize) {
      const chunk = fileIds.slice(i, i + chunkSize);
      
      let query = supabase
        .from('files')
        .select('source_file_id')
        .in('source_file_id', chunk);

      if (currentUserId) {
        query = query.or(`is_public.eq.true,created_by.eq.${currentUserId}`);
      } else {
        query = query.eq('is_public', true);
      }

      const { data: derivedFiles, error } = await query;

      if (error) {
        console.error('[파생 이미지 개수 일괄 조회] 청크 실패:', error);
        continue;
      }

      if (derivedFiles) {
        for (const file of derivedFiles) {
          if (file.source_file_id) {
            counts[file.source_file_id] = (counts[file.source_file_id] || 0) + 1;
          }
        }
      }
    }

    return NextResponse.json({ counts });
  } catch (error: unknown) {
    console.error('[파생 이미지 개수 일괄 조회] 예외:', error);
    return NextResponse.json({ counts: {} });
  }
}
