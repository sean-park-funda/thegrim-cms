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
 * POST: 완료된 무빙웹툰 컷 영상들을 FFmpeg로 합치기
 */
export async function POST(request: NextRequest) {
  let tempDir: string | null = null;

  try {
    const { movingProjectId, transition } = await request.json();

    if (!movingProjectId) {
      return NextResponse.json({ error: 'movingProjectId 필요' }, { status: 400 });
    }

    // 1. completed 컷 조회 (순서대로)
    const { data: cuts, error } = await supabase
      .from('moving_webtoon_cuts')
      .select('*')
      .eq('moving_project_id', movingProjectId)
      .eq('status', 'completed')
      .order('order_index', { ascending: true });

    if (error) throw error;
    if (!cuts || cuts.length === 0) {
      return NextResponse.json({ error: '합칠 수 있는 완료된 컷이 없습니다' }, { status: 400 });
    }

    // 영상이 1개면 그대로 반환
    if (cuts.length === 1 && cuts[0].video_url) {
      const res = await fetch(cuts[0].video_url);
      if (!res.ok) throw new Error('영상 다운로드 실패');
      const buffer = Buffer.from(await res.arrayBuffer());
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="moving_webtoon_${Date.now()}.mp4"`,
          'Content-Length': String(buffer.length),
        },
      });
    }

    // 2. 영상 파일들 다운로드
    tempDir = join(tmpdir(), `mw-merge-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const videoPaths: string[] = [];
    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i];
      if (!cut.video_url) continue;

      const res = await fetch(cut.video_url);
      if (!res.ok) {
        console.error(`[mw-merge] 컷 ${cut.order_index} 다운로드 실패`);
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const filePath = join(tempDir, `cut_${String(i).padStart(3, '0')}.mp4`);
      await fs.writeFile(filePath, buffer);
      videoPaths.push(filePath);
    }

    if (videoPaths.length === 0) {
      return NextResponse.json({ error: '다운로드된 영상이 없습니다' }, { status: 400 });
    }

    // 3. FFmpeg concat
    const outputPath = join(tempDir, 'merged.mp4');

    if (transition === 'fade') {
      // 페이드 트랜지션: 각 영상 사이에 0.5초 크로스페이드
      // 복잡한 filter_complex 사용
      const inputs = videoPaths.flatMap((p) => ['-i', p]);
      const filterParts: string[] = [];
      const concatInputs: string[] = [];

      // 단순화: xfade 필터 체이닝
      if (videoPaths.length === 2) {
        const filter = `[0:v][1:v]xfade=transition=fade:duration=0.5:offset=2.5[outv]`;
        await execFileAsync('ffmpeg', [
          ...inputs,
          '-filter_complex', filter,
          '-map', '[outv]',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-movflags', '+faststart', '-y', outputPath,
        ], { timeout: 300000 });
      } else {
        // 3개 이상: 순차 xfade 체이닝
        let lastLabel = '0:v';
        let filterComplex = '';
        for (let i = 1; i < videoPaths.length; i++) {
          const outLabel = i < videoPaths.length - 1 ? `v${i}` : 'outv';
          const offset = (i * 3) - 0.5; // 3초 영상 기준
          filterComplex += `[${lastLabel}][${i}:v]xfade=transition=fade:duration=0.5:offset=${offset}[${outLabel}];`;
          lastLabel = outLabel;
        }
        filterComplex = filterComplex.slice(0, -1); // 마지막 세미콜론 제거

        await execFileAsync('ffmpeg', [
          ...inputs,
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-movflags', '+faststart', '-y', outputPath,
        ], { timeout: 300000 });
      }
    } else {
      // 기본: 단순 이어붙이기
      const listContent = videoPaths.map((p) => `file '${p}'`).join('\n');
      const listPath = join(tempDir, 'filelist.txt');
      await fs.writeFile(listPath, listContent);

      await execFileAsync('ffmpeg', [
        '-f', 'concat', '-safe', '0', '-i', listPath,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-movflags', '+faststart', '-y', outputPath,
      ], { timeout: 300000 });
    }

    const resultBuffer = await fs.readFile(outputPath);
    console.log(`[mw-merge] 합치기 완료 (${cuts.length}개 컷, ${resultBuffer.length} bytes, transition: ${transition || 'none'})`);

    // 정리
    fs.rm(tempDir, { recursive: true }).catch(() => {});

    return new NextResponse(resultBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="moving_webtoon_${Date.now()}.mp4"`,
        'Content-Length': String(resultBuffer.length),
      },
    });
  } catch (error) {
    console.error('[mw-merge] 실패:', error);
    if (tempDir) fs.rm(tempDir, { recursive: true }).catch(() => {});

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '영상 합치기 실패' },
      { status: 500 }
    );
  }
}
