import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import archiver from 'archiver';
import { PassThrough } from 'stream';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { groupId, projectId } = await req.json();

    if (!groupId || !projectId) {
      return NextResponse.json({ error: 'groupId, projectId 필수' }, { status: 400 });
    }

    const { data: group } = await supabase
      .from('webtoonanimation_prompt_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (!group) {
      return NextResponse.json({ error: '프롬프트 그룹을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: cutPrompts } = await supabase
      .from('webtoonanimation_cut_prompts')
      .select('*')
      .eq('group_id', groupId)
      .order('cut_index', { ascending: true });

    if (!cutPrompts?.length) {
      return NextResponse.json({ error: '컷 프롬프트가 없습니다.' }, { status: 404 });
    }

    const { data: cuts } = await supabase
      .from('webtoonanimation_cuts')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true });

    if (!cuts?.length) {
      return NextResponse.json({ error: '컷 이미지가 없습니다.' }, { status: 404 });
    }

    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '-',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');
    const folderName = `output-${timestamp}`;

    const passthrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(passthrough);

    const rangeStart = group.range_start as number;
    const rangeEnd = group.range_end as number;
    const rangeCuts = cuts.filter(
      (c: { order_index: number }) => c.order_index >= rangeStart && c.order_index <= rangeEnd
    );

    for (let i = 0; i < rangeCuts.length; i++) {
      const cut = rangeCuts[i];
      const filePath: string = cut.file_path;

      try {
        let imageBuffer: Buffer;

        if (filePath.startsWith('http')) {
          const res = await fetch(filePath);
          if (!res.ok) continue;
          imageBuffer = Buffer.from(await res.arrayBuffer());
        } else {
          const { data, error } = await supabase.storage
            .from('webtoon-files')
            .download(filePath);
          if (error || !data) continue;
          imageBuffer = Buffer.from(await data.arrayBuffer());
        }

        const ext = getImageExtension(filePath);
        const cutName = `cut${String(i + 1).padStart(2, '0')}.${ext}`;
        archive.append(imageBuffer, { name: `${folderName}/${cutName}` });
      } catch (e) {
        console.error(`컷 이미지 다운로드 실패 (index ${i}):`, e);
      }
    }

    if (group.storyboard_image_path) {
      try {
        let storyboardBuffer: Buffer;
        const sbPath: string = group.storyboard_image_path;

        if (sbPath.startsWith('http')) {
          const res = await fetch(sbPath);
          if (res.ok) {
            storyboardBuffer = Buffer.from(await res.arrayBuffer());
            archive.append(storyboardBuffer, { name: `${folderName}/storyboard.png` });
          }
        } else {
          const { data, error } = await supabase.storage
            .from('webtoon-files')
            .download(sbPath);
          if (!error && data) {
            storyboardBuffer = Buffer.from(await data.arrayBuffer());
            archive.append(storyboardBuffer, { name: `${folderName}/storyboard.png` });
          }
        }
      } catch (e) {
        console.error('스토리보드 이미지 다운로드 실패:', e);
      }
    }

    const promptJson = {
      aspect_ratio: group.aspect_ratio,
      cuts: cutPrompts.map((p: { cut_index: number; prompt: string; camera: string | null; continuity: string; duration: number }, i: number) => ({
        cut_index: p.cut_index,
        reference_image: `@cut${String(i + 1).padStart(2, '0')}`,
        prompt: p.prompt,
        camera: p.camera || '',
        continuity: p.continuity,
        duration: p.duration,
      })),
    };

    archive.append(JSON.stringify(promptJson, null, 2), {
      name: `${folderName}/prompt.json`,
    });

    const zipBufferPromise = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
      passthrough.on('end', () => resolve(Buffer.concat(chunks)));
      passthrough.on('error', reject);
    });

    await archive.finalize();

    const zipBuffer = await zipBufferPromise;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${folderName}.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error('프롬프트 내보내기 실패:', error);
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json({ error: `내보내기 실패: ${message}` }, { status: 500 });
  }
}

function getImageExtension(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes('.png')) return 'png';
  if (lower.includes('.webp')) return 'webp';
  if (lower.includes('.gif')) return 'gif';
  return 'jpg';
}
