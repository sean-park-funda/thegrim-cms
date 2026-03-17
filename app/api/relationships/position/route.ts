import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { character_id, position } = body;

    if (!character_id || !position) {
      return NextResponse.json(
        { error: 'character_id and position are required' },
        { status: 400 }
      );
    }

    if (
      typeof position.x !== 'number' ||
      typeof position.y !== 'number' ||
      typeof position.z !== 'number'
    ) {
      return NextResponse.json(
        { error: 'position must have numeric x, y, and z values' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('characters')
      .update({ position: { x: position.x, y: position.y, z: position.z } })
      .eq('id', character_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update character position' },
      { status: 500 }
    );
  }
}
