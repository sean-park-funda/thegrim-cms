import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  const workDir = join(tmpdir(), `merge-${randomUUID()}`);

  try {
    await mkdir(workDir, { recursive: true });

    const formData = await req.formData();
    const files = formData.getAll('videos') as File[];

    if (!files || files.length < 2) {
      return NextResponse.json({ error: '영상 파일이 2개 이상 필요합니다.' }, { status: 400 });
    }

    const inputPaths: string[] = [];
    const concatLines: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = getExtension(file.name) || 'mp4';
      const inputPath = join(workDir, `input_${String(i).padStart(3, '0')}.${ext}`);
      await writeFile(inputPath, buffer);
      inputPaths.push(inputPath);
    }

    const outputPath = join(workDir, 'output.mp4');

    const needsReencode = await checkNeedsReencode(inputPaths);

    if (needsReencode) {
      const intermediates: string[] = [];

      for (let i = 0; i < inputPaths.length; i++) {
        const intermediatePath = join(workDir, `intermediate_${String(i).padStart(3, '0')}.ts`);
        await execFileAsync('ffmpeg', [
          '-y', '-i', inputPaths[i],
          '-c:v', 'libx264', '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k',
          '-ar', '44100', '-ac', '2',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-r', '30',
          '-f', 'mpegts',
          intermediatePath,
        ], { timeout: 300000 });
        intermediates.push(intermediatePath);
      }

      const concatInput = intermediates
        .map((p) => p.replace(/\\/g, '/'))
        .join('|');

      await execFileAsync('ffmpeg', [
        '-y',
        '-i', `concat:${concatInput}`,
        '-c:v', 'libx264', '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath,
      ], { timeout: 600000 });
    } else {
      const concatFilePath = join(workDir, 'concat.txt');
      for (const p of inputPaths) {
        concatLines.push(`file '${p.replace(/\\/g, '/')}'`);
      }
      await writeFile(concatFilePath, concatLines.join('\n'), 'utf-8');

      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputPath,
      ], { timeout: 300000 });
    }

    const resultBuffer = await readFile(outputPath);

    // 비동기로 정리
    rm(workDir, { recursive: true, force: true }).catch(() => {});

    return new NextResponse(resultBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="merged_${Date.now()}.mp4"`,
        'Content-Length': String(resultBuffer.length),
      },
    });
  } catch (error) {
    console.error('영상 병합 실패:', error);
    rm(workDir, { recursive: true, force: true }).catch(() => {});

    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json({ error: `영상 병합 실패: ${message}` }, { status: 500 });
  }
}

function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'mp4';
}

async function checkNeedsReencode(paths: string[]): Promise<boolean> {
  try {
    const codecs: string[] = [];
    const resolutions: string[] = [];

    for (const p of paths) {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        p,
      ]);
      const info = JSON.parse(stdout);
      const videoStream = info.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
      if (videoStream) {
        codecs.push(videoStream.codec_name);
        resolutions.push(`${videoStream.width}x${videoStream.height}`);
      }
    }

    const allSameCodec = codecs.every((c) => c === codecs[0]);
    const allSameRes = resolutions.every((r) => r === resolutions[0]);
    const allH264 = codecs.every((c) => c === 'h264');

    return !(allSameCodec && allSameRes && allH264);
  } catch {
    return true;
  }
}
