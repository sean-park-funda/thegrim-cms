import { NextRequest, NextResponse } from 'next/server';
import { deleteCharacterSheet } from '@/lib/api/characterSheets';

type Params = Promise<{ characterId: string; sheetId: string }> | { characterId: string; sheetId: string };

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const { sheetId } = await Promise.resolve(params);
  try {
    await deleteCharacterSheet(sheetId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '삭제 실패' }, { status: 500 });
  }
}
