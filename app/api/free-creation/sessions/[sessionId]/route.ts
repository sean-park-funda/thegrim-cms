import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// GET /api/free-creation/sessions/[sessionId] - 세션 상세 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;

    const { data: session, error } = await supabase
      .from('free_creation_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('[자유창작 세션] 조회 실패:', error);
      return NextResponse.json(
        { error: '세션을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('[자유창작 세션] 예외 발생:', error);
    return NextResponse.json(
      { error: '세션 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PATCH /api/free-creation/sessions/[sessionId] - 세션 수정
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const { title } = body;

    const { data: session, error } = await supabase
      .from('free_creation_sessions')
      .update({ title })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('[자유창작 세션] 수정 실패:', error);
      return NextResponse.json(
        { error: '세션 수정에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('[자유창작 세션] 예외 발생:', error);
    return NextResponse.json(
      { error: '세션 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE /api/free-creation/sessions/[sessionId] - 세션 삭제
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;

    const { error } = await supabase
      .from('free_creation_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      console.error('[자유창작 세션] 삭제 실패:', error);
      return NextResponse.json(
        { error: '세션 삭제에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[자유창작 세션] 예외 발생:', error);
    return NextResponse.json(
      { error: '세션 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
