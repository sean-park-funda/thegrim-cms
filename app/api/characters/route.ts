import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const webtoonId = searchParams.get('webtoon_id');

    if (!webtoonId) {
      return NextResponse.json({ error: 'webtoon_id is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('characters')
      .select(`
        *,
        character_sheets (id, file_path, thumbnail_path, file_name)
      `)
      .eq('webtoon_id', webtoonId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Failed to fetch characters:', error);
    return NextResponse.json({ error: 'Failed to fetch characters' }, { status: 500 });
  }
}
