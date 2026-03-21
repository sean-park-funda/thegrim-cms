import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cutId: string }> }
) {
  const { cutId } = await params;
  const { data, error } = await supabase
    .from('webtoonanimation_cuts')
    .select('id, comfyui_video_url, start_frame_url, end_frame_url')
    .eq('id', cutId)
    .single();

  if (error || !data) return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });
  return NextResponse.json(data);
}
