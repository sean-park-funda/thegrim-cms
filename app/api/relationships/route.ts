import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const webtoonId = searchParams.get('webtoon_id');

    if (!webtoonId) {
      return NextResponse.json(
        { error: 'webtoon_id is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('character_relationships')
      .select(`
        *,
        character_a:characters!character_a_id(*),
        character_b:characters!character_b_id(*)
      `)
      .eq('webtoon_id', webtoonId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch relationships' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      webtoon_id,
      character_a_id,
      character_b_id,
      relationship_type,
      label,
      direction,
      intensity,
      tension,
      notes,
    } = body;

    if (!webtoon_id || !character_a_id || !character_b_id || !relationship_type) {
      return NextResponse.json(
        { error: 'webtoon_id, character_a_id, character_b_id, and relationship_type are required' },
        { status: 400 }
      );
    }

    // Auto-set color from relationship_types table
    const { data: typeData } = await supabase
      .from('relationship_types')
      .select('color')
      .eq('id', relationship_type)
      .single();

    const color = typeData?.color ?? '#94A3B8';

    const { data, error } = await supabase
      .from('character_relationships')
      .insert({
        webtoon_id,
        character_a_id,
        character_b_id,
        relationship_type,
        label: label ?? null,
        direction: direction ?? 'mutual',
        intensity: intensity ?? 5,
        tension: tension ?? 0,
        color,
        notes: notes ?? null,
      })
      .select(`
        *,
        character_a:characters!character_a_id(*),
        character_b:characters!character_b_id(*)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create relationship' },
      { status: 500 }
    );
  }
}
