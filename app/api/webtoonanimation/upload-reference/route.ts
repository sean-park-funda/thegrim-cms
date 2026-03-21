import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { cutId, imageData, mimeType } = await request.json();
    if (!cutId || !imageData) {
      return NextResponse.json({ error: 'cutId, imageData 필요' }, { status: 400 });
    }

    const base64 = imageData.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    const ext = mimeType?.split('/')[1] || 'png';
    const path = `references/${cutId}/ref_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('webtoonanimation')
      .upload(path, buf, { contentType: mimeType || 'image/png', upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('webtoonanimation').getPublicUrl(path);
    const url = data.publicUrl;

    await supabase
      .from('webtoonanimation_cuts')
      .update({ colorize_reference_url: url })
      .eq('id', cutId);

    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '업로드 실패' },
      { status: 500 }
    );
  }
}
