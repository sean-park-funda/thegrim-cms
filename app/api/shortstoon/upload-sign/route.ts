import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 브라우저에서 대용량 파일을 직접 업로드할 수 있도록 서명된 URL 발급
export async function POST(request: NextRequest) {
  try {
    const { projectId, fileName } = await request.json();
    if (!projectId || !fileName) {
      return NextResponse.json({ error: 'projectId, fileName 필요' }, { status: 400 });
    }

    const timestamp = Date.now();
    const sanitized = fileName
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 100) || 'file';
    const storagePath = `shortstoon/${projectId}/${timestamp}-${sanitized}`;

    const { data, error } = await supabase.storage
      .from('webtoon-files')
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return NextResponse.json({ error: '서명 URL 발급 실패', details: error }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl, storagePath, token: data.token });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '실패' },
      { status: 500 }
    );
  }
}
