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

/**
 * POST: 완료된 세그먼트 영상들을 FFmpeg로 합치기
 * 입력: { groupId }
 * 동작: completed 상태 세그먼트 영상 다운로드 → FFmpeg concat → 결과 반환
 */
export async function POST(request: NextRequest) {
  const tempFiles: string[] = [];

  try {
    const { groupId } = await request.json();

    if (!groupId) {
      return NextResponse.json({ error: 'groupId 필요' }, { status: 400 });
    }

    // 1. completed 세그먼트 조회 (순서대로)
    const { data: segments, error } = await supabase
      .from('webtoonanimation_video_segments')
      .select('*')
      .eq('group_id', groupId)
      .eq('status', 'completed')
      .order('segment_index', { ascending: true });

    if (error) throw error;
    if (!segments || segments.length === 0) {
      return NextResponse.json({ error: '합칠 수 있는 완료된 세그먼트가 없습니다' }, { status: 400 });
    }

    if (segments.length === 1 && segments[0].video_url) {
      // 영상이 1개면 그대로 반환
      const res = await fetch(segments[0].video_url);
      if (!res.ok) throw new Error('영상 다운로드 실패');
      const buffer = Buffer.from(await res.arrayBuffer());
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="merged_${Date.now()}.mp4"`,
          'Content-Length': String(buffer.length),
        },
      });
    }

    // 2. 영상 파일들 다운로드
    const tempDir = join(tmpdir(), `merge-segments-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    tempFiles.push(tempDir);

    const videoPaths: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg.video_url) continue;

      const res = await fetch(seg.video_url);
      if (!res.ok) {
        console.error(`[merge-segments] 세그먼트 ${seg.segment_index} 다운로드 실패`);
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const filePath = join(tempDir, `seg_${String(i).padStart(3, '0')}.mp4`);
      await fs.writeFile(filePath, buffer);
      videoPaths.push(filePath);
    }

    if (videoPaths.length === 0) {
      return NextResponse.json({ error: '다운로드된 영상이 없습니다' }, { status: 400 });
    }

    // 3. FFmpeg concat list 생성
    const listContent = videoPaths.map((p) => `file '${p}'`).join('\n');
    const listPath = join(tempDir, 'filelist.txt');
    await fs.writeFile(listPath, listContent);

    // 4. FFmpeg로 합치기 (re-encode for consistency)
    const outputPath = join(tempDir, 'merged.mp4');

    console.log(`[merge-segments] FFmpeg 합치기 시작 (${videoPaths.length}개 세그먼트)`);

    await execFileAsync('ffmpeg', [
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ], { timeout: 300000 });

    const resultBuffer = await fs.readFile(outputPath);

    console.log(`[merge-segments] 합치기 완료 (${resultBuffer.length} bytes)`);

    // 5. 임시 파일 정리
    fs.rm(tempDir, { recursive: true }).catch(() => {});

    return new NextResponse(resultBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="merged_${Date.now()}.mp4"`,
        'Content-Length': String(resultBuffer.length),
      },
    });
  } catch (error) {
    console.error('[merge-segments] 실패:', error);

    // 임시 파일 정리
    for (const f of tempFiles) {
      fs.rm(f, { recursive: true }).catch(() => {});
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '영상 합치기 실패' },
      { status: 500 }
    );
  }
}
