import { NextRequest, NextResponse } from 'next/server';
import { deleteCharacterSheet, updateCharacterSheet } from '@/lib/api/characterSheets';

type Params = Promise<{ characterId: string; sheetId: string }> | { characterId: string; sheetId: string };

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { sheetId } = await Promise.resolve(params);
  try {
    const body = await request.json();
    const sheet = await updateCharacterSheet(sheetId, { description: body.description ?? null });
    return NextResponse.json(sheet);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const { sheetId } = await Promise.resolve(params);
  try {
    await deleteCharacterSheet(sheetId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '삭제 실패' }, { status: 500 });
  }
}
