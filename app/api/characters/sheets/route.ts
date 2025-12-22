import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: 모든 웹툰의 캐릭터 시트 목록 조회
export async function GET() {
  console.log('[characters/sheets][GET] 캐릭터 시트 전체 목록 조회');

  try {
    // character_sheets 테이블에서 캐릭터와 웹툰 정보를 함께 조회
    const { data, error } = await supabase
      .from('character_sheets')
      .select(`
        id,
        file_path,
        file_name,
        character_id,
        characters (
          id,
          name,
          webtoon_id,
          webtoons (
            id,
            title
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[characters/sheets][GET] 조회 실패:', error);
      return NextResponse.json({ error: '캐릭터 시트 조회에 실패했습니다.' }, { status: 500 });
    }

    // 응답 형식 변환
    const sheets = (data || []).map((sheet) => {
      const character = sheet.characters as { id: string; name: string; webtoons: { id: string; title: string } | null } | null;
      return {
        id: sheet.id,
        file_path: sheet.file_path,
        file_name: sheet.file_name,
        character_name: character?.name || '알 수 없음',
        webtoon_title: character?.webtoons?.title || '알 수 없음',
      };
    });

    console.log('[characters/sheets][GET] 조회 완료:', sheets.length, '개');
    return NextResponse.json(sheets);
  } catch (err) {
    console.error('[characters/sheets][GET] 오류:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

