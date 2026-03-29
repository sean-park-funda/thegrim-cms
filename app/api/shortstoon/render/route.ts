import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const maxDuration = 120;

/**
 * POST: 개별 블록을 FFmpeg로 렌더링
 * viewport(scale, offset_x/y) + effect_type 적용 → MP4 → Supabase Storage
 */
export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  let blockId: string | null = null;

  try {
    const body = await request.json();
    blockId = body.blockId;
    if (!blockId) return NextResponse.json({ error: 'blockId 필요' }, { status: 400 });

    // 블록 조회
    const { data: block, error: bErr } = await supabase
      .from('shortstoon_blocks')
      .select('*')
      .eq('id', blockId)
      .single();
    if (bErr || !block) return NextResponse.json({ error: '블록 없음' }, { status: 404 });

    // 상태 → rendering
    await supabase
      .from('shortstoon_blocks')
      .update({ status: 'rendering', error_message: null, updated_at: new Date().toISOString() })
      .eq('id', blockId);

    // 임시 디렉토리
    tempDir = join(tmpdir(), `ss-render-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // 이미지 다운로드
    const imgRes = await fetch(block.image_url);
    if (!imgRes.ok) throw new Error('이미지 다운로드 실패');
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const inputPath = join(tempDir, 'input.jpg');
    await fs.writeFile(inputPath, imgBuffer);

    // 원본 이미지 크기 확인
    const meta = await sharp(inputPath).metadata();
    const imgW = meta.width ?? 1080;
    const imgH = meta.height ?? 1920;

    // 출력 크기
    const outW = 1080;
    const outH = 1920;

    // scale=1.0 이 cover 배율 → 실제 픽셀 스케일 계산
    const coverScale = Math.max(outW / imgW, outH / imgH);
    const actualScale = coverScale * block.viewport.scale;

    const scaledW = Math.round(imgW * actualScale);
    const scaledH = Math.round(imgH * actualScale);

    // crop 오프셋 (0~1 → 픽셀)
    const maxOffX = Math.max(0, scaledW - outW);
    const maxOffY = Math.max(0, scaledH - outH);
    const cropX = Math.round(maxOffX * block.viewport.offset_x);
    const cropY = Math.round(maxOffY * block.viewport.offset_y);

    const durationSec = block.duration_ms / 1000;
    const outputPath = join(tempDir, 'output.mp4');

    const effect = block.effect_type;
    const params = block.effect_params as Record<string, number>;

    // 공통: scale → crop 기본 필터
    const baseScale = `scale=${scaledW}:${scaledH}`;
    const baseCrop = `crop=${outW}:${outH}:${cropX}:${cropY}`;

    let ffmpegArgs: string[];

    if (effect === 'scroll_h') {
      // 좌우 스크롤: crop X 오프셋을 시간에 따라 이동
      const dir = (params.direction as unknown as string) === 'right' ? -1 : 1;
      // 스크롤 범위: maxOffX 전체를 duration 동안 이동
      const scrollRange = Math.max(outW, scaledW - outW);
      const startX = dir > 0 ? 0 : scrollRange;
      const endX = dir > 0 ? scrollRange : 0;
      ffmpegArgs = [
        '-loop', '1', '-i', inputPath,
        '-vf', `${baseScale},crop=${outW}:${outH}:'${startX}+t/${durationSec}*(${endX}-${startX})':${cropY}`,
        '-t', String(durationSec), '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-y', outputPath,
      ];
    } else if (effect === 'scroll_v') {
      const dir = (params.direction as unknown as string) === 'down' ? -1 : 1;
      const scrollRange = Math.max(outH, scaledH - outH);
      const startY = dir > 0 ? 0 : scrollRange;
      const endY = dir > 0 ? scrollRange : 0;
      ffmpegArgs = [
        '-loop', '1', '-i', inputPath,
        '-vf', `${baseScale},crop=${outW}:${outH}:${cropX}:'${startY}+t/${durationSec}*(${endY}-${startY})'`,
        '-t', String(durationSec), '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-y', outputPath,
      ];
    } else if (effect === 'zoom_in') {
      const fromZ = params.from ?? 1.0;
      const toZ = params.to ?? 1.3;
      const frames = Math.round(durationSec * 30);
      ffmpegArgs = [
        '-loop', '1', '-i', inputPath,
        '-vf', `${baseScale},${baseCrop},zoompan=z='${fromZ}+(${toZ}-${fromZ})*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${outW}x${outH}:fps=30`,
        '-t', String(durationSec), '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-y', outputPath,
      ];
    } else if (effect === 'zoom_out') {
      const fromZ = params.from ?? 1.3;
      const toZ = params.to ?? 1.0;
      const frames = Math.round(durationSec * 30);
      ffmpegArgs = [
        '-loop', '1', '-i', inputPath,
        '-vf', `${baseScale},${baseCrop},zoompan=z='${fromZ}+(${toZ}-${fromZ})*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${outW}x${outH}:fps=30`,
        '-t', String(durationSec), '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-y', outputPath,
      ];
    } else if (effect === 'shake') {
      const amplitude = params.amplitude ?? 8;
      const frequency = params.frequency ?? 8;
      // 이미지를 약간 크게 스케일해서 흔들려도 빈 공간 없게
      const shakeScale = `scale=${scaledW + amplitude * 4}:${scaledH + amplitude * 4}`;
      ffmpegArgs = [
        '-loop', '1', '-i', inputPath,
        '-vf', `${shakeScale},crop=${outW}:${outH}:'${cropX + amplitude * 2}+${amplitude}*sin(2*PI*${frequency}*t)':'${cropY + amplitude * 2}+${amplitude}*sin(2*PI*${frequency}*t+PI/3)'`,
        '-t', String(durationSec), '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-y', outputPath,
      ];
    } else if (effect === 'flash') {
      const interval = params.interval ?? 0.5;
      const minBrightness = params.min_brightness ?? 0.6;
      ffmpegArgs = [
        '-loop', '1', '-i', inputPath,
        '-vf', `${baseScale},${baseCrop},eq=brightness='${minBrightness / 2}*sin(2*PI*t/${interval})-${minBrightness / 2}'`,
        '-t', String(durationSec), '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-y', outputPath,
      ];
    } else {
      // none: 정적 이미지
      ffmpegArgs = [
        '-loop', '1', '-i', inputPath,
        '-vf', `${baseScale},${baseCrop}`,
        '-t', String(durationSec), '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-y', outputPath,
      ];
    }

    const startMs = Date.now();
    await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 120000 });
    const elapsed = Date.now() - startMs;

    // Storage 업로드
    const videoBuffer = await fs.readFile(outputPath);
    const videoPath = `shortstoon/${block.shortstoon_project_id}/blocks/${blockId}_${Date.now()}.mp4`;

    const { error: storeErr } = await supabase.storage
      .from('webtoon-files')
      .upload(videoPath, videoBuffer, { contentType: 'video/mp4', upsert: true });
    if (storeErr) throw new Error(`Storage 업로드 실패: ${storeErr.message}`);

    const { data: { publicUrl: videoUrl } } = supabase.storage
      .from('webtoon-files')
      .getPublicUrl(videoPath);

    // DB 업데이트
    const { data: updated } = await supabase
      .from('shortstoon_blocks')
      .update({
        status: 'completed',
        video_url: videoUrl,
        video_path: videoPath,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', blockId)
      .select()
      .single();

    console.log(`[ss-render] 완료 blockId=${blockId} effect=${effect} ${elapsed}ms`);
    fs.rm(tempDir, { recursive: true }).catch(() => {});

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[ss-render] 실패:', error);
    if (tempDir) fs.rm(tempDir, { recursive: true }).catch(() => {});

    const msg = error instanceof Error ? error.message : '렌더링 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
