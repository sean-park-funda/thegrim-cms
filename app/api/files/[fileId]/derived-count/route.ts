import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 서버 사이드에서 사용할 Supabase 클라이언트 (Service Role Key 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const currentUserId = searchParams.get('currentUserId') || undefined;

    // 파생 이미지 개수 조회
    let query = supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('source_file_id', fileId);

    // 공개/비공개 필터링: 공개 이미지이거나 본인이 생성한 이미지
    if (currentUserId) {
      query = query.or(`is_public.eq.true,created_by.eq.${currentUserId}`);
    } else {
      query = query.eq('is_public', true);
    }

    const { count, error } = await query;

    if (error) {
      console.error('[파생 이미지 개수 조회] 실패:', error);
      return NextResponse.json({ count: 0 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error: unknown) {
    console.error('[파생 이미지 개수 조회] 예외:', error);
    return NextResponse.json({ count: 0 });
  }
}



