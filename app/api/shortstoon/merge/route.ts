import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const maxDuration = 300;

/**
 * POST: completed 블록들을 트랜지션과 함께 병합
 */
export async function POST(request: NextRequest) {
  let tempDir: string | null = null;

  try {
    const { projectId } = await request.json();
    if (!projectId) return NextResponse.json({ error: 'projectId 필요' }, { status: 400 });

    // completed 블록만 순서대로
    const { data: blocks, error } = await supabase
      .from('shortstoon_blocks')
      .select('*')
      .eq('shortstoon_project_id', projectId)
      .eq('status', 'completed')
      .order('order_index', { ascending: true });

    if (error) throw error;
    if (!blocks || blocks.length === 0) {
      return NextResponse.json({ error: '렌더링 완료된 블록이 없습니다' }, { status: 400 });
    }

    // 단일 블록이면 바로 반환
    if (blocks.length === 1 && blocks[0].video_url) {
      const res = await fetch(blocks[0].video_url);
      if (!res.ok) throw new Error('영상 다운로드 실패');
      const buffer = Buffer.from(await res.arrayBuffer());
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="shortstoon_${Date.now()}.mp4"`,
          'Content-Length': String(buffer.length),
        },
      });
    }

    tempDir = join(tmpdir(), `ss-merge-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // 영상 다운로드
    const videoPaths: string[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block.video_url) continue;
      const res = await fetch(block.video_url);
      if (!res.ok) { console.error(`[ss-merge] 블록 ${i} 다운로드 실패`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const p = join(tempDir, `clip_${String(i).padStart(3, '0')}.mp4`);
      await fs.writeFile(p, buf);
      videoPaths.push(p);
    }

    if (videoPaths.length === 0) {
      return NextResponse.json({ error: '다운로드된 영상이 없습니다' }, { status: 400 });
    }

    const outputPath = join(tempDir, 'merged.mp4');

    // 트랜지션 분석: 각 블록의 transition_type과 duration
    // blocks[i].transition_type = 이 블록에서 다음 블록으로의 전환
    const hasAnyTransition = blocks.some(b => b.transition_type !== 'none');

    if (hasAnyTransition && videoPaths.length > 1) {
      // xfade 필터 체이닝
      const inputs = videoPaths.flatMap(p => ['-i', p]);
      let filterComplex = '';
      let lastLabel = '0:v';
      let accumulatedOffset = 0;

      for (let i = 0; i < videoPaths.length - 1; i++) {
        const block = blocks[i];
        const durationSec = block.duration_ms / 1000;
        const transType = block.transition_type as string;
        const transDur = block.transition_duration_ms / 1000;

        const outLabel = i === videoPaths.length - 2 ? 'outv' : `v${i + 1}`;
        accumulatedOffset += durationSec - transDur;

        const xfadeTransition = ffmpegXfadeName(transType);
        filterComplex += `[${lastLabel}][${i + 1}:v]xfade=transition=${xfadeTransition}:duration=${transDur}:offset=${accumulatedOffset.toFixed(3)}[${outLabel}];`;
        lastLabel = outLabel;
      }
      filterComplex = filterComplex.slice(0, -1); // 마지막 세미콜론 제거

      await execFileAsync('ffmpeg', [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', '[outv]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-y', outputPath,
      ], { timeout: 300000 });
    } else {
      // concat (트랜지션 없음)
      const listContent = videoPaths.map(p => `file '${p}'`).join('\n');
      const listPath = join(tempDir, 'filelist.txt');
      await fs.writeFile(listPath, listContent);

      await execFileAsync('ffmpeg', [
        '-f', 'concat', '-safe', '0', '-i', listPath,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-y', outputPath,
      ], { timeout: 300000 });
    }

    const resultBuffer = await fs.readFile(outputPath);
    console.log(`[ss-merge] 완료 ${blocks.length}개 블록, ${resultBuffer.length} bytes`);
    fs.rm(tempDir, { recursive: true }).catch(() => {});

    return new NextResponse(resultBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="shortstoon_${Date.now()}.mp4"`,
        'Content-Length': String(resultBuffer.length),
      },
    });
  } catch (error) {
    console.error('[ss-merge] 실패:', error);
    if (tempDir) fs.rm(tempDir, { recursive: true }).catch(() => {});
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '병합 실패' },
      { status: 500 }
    );
  }
}

function ffmpegXfadeName(transition: string): string {
  const map: Record<string, string> = {
    fade: 'fade',
    fadeblack: 'fadeblack',
    fadewhite: 'fadewhite',
    slideleft: 'slideleft',
    slidedown: 'slidedown',
    zoom: 'zoom',
    none: 'fade',
  };
  return map[transition] ?? 'fade';
}
