import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const maxDuration = 300;

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const COMFYUI_URL = 'http://100.79.136.74:8188';
const GPU_SSH = 'admin@100.79.136.74';
const GPU_INPUT = 'C:/AI/ComfyUI/input';
const GPU_OUTPUT = 'C:/AI/ComfyUI/output';

function buildWan22Workflow(startImg: string, endImg: string, prompt: string, seed: number, prefix: string) {
  return {
    prompt: {
      '1': { class_type: 'LoadImage', inputs: { image: startImg } },
      '2': { class_type: 'LoadImage', inputs: { image: endImg } },
      '13': { class_type: 'WanVideoLoraSelect', inputs: { lora: 'wan2.2_i2v_A14b_high_noise_lora_rank64_lightx2v_4step_1022.safetensors', strength: 1.0 } },
      '14': { class_type: 'WanVideoLoraSelect', inputs: { lora: 'wan2.2_i2v_A14b_low_noise_lora_rank64_lightx2v_4step_1022.safetensors', strength: 1.0 } },
      '3': { class_type: 'WanVideoModelLoader', inputs: { model: 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors', base_precision: 'bf16', quantization: 'disabled', load_device: 'offload_device', attention_mode: 'sageattn', lora: ['13', 0] } },
      '4': { class_type: 'WanVideoModelLoader', inputs: { model: 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors', base_precision: 'bf16', quantization: 'disabled', load_device: 'offload_device', attention_mode: 'sageattn', lora: ['14', 0] } },
      '5': { class_type: 'WanVideoVAELoader', inputs: { model_name: 'Wan2_1_VAE_bf16.safetensors', precision: 'bf16' } },
      '6': { class_type: 'LoadWanVideoT5TextEncoder', inputs: { model_name: 'umt5-xxl-enc-bf16.safetensors', precision: 'bf16', load_device: 'offload_device' } },
      '7': { class_type: 'WanVideoTextEncode', inputs: { positive_prompt: prompt, negative_prompt: 'live action, 3D render, blurry, distorted face, bad anatomy, extra limbs, watermark, text, low quality, choppy motion', t5: ['6', 0], force_offload: true } },
      '8': { class_type: 'WanVideoImageToVideoEncode', inputs: { width: 832, height: 480, num_frames: 113, noise_aug_strength: 0.0, start_latent_strength: 1.0, end_latent_strength: 1.0, force_offload: true, vae: ['5', 0], start_image: ['1', 0], end_image: ['2', 0], fun_or_fl2v_model: true } },
      '9': { class_type: 'WanVideoSampler', inputs: { model: ['3', 0], image_embeds: ['8', 0], text_embeds: ['7', 0], steps: 4, cfg: 1.0, shift: 5.0, seed, scheduler: 'euler', riflex_freq_index: 0, force_offload: true, end_step: 2 } },
      '10': { class_type: 'WanVideoSampler', inputs: { model: ['4', 0], image_embeds: ['8', 0], text_embeds: ['7', 0], steps: 4, cfg: 1.0, shift: 5.0, seed, scheduler: 'euler', riflex_freq_index: 0, force_offload: true, samples: ['9', 0], start_step: 2, add_noise_to_samples: false } },
      '11': { class_type: 'WanVideoDecode', inputs: { vae: ['5', 0], samples: ['10', 0], enable_vae_tiling: false, tile_x: 272, tile_y: 272, tile_stride_x: 144, tile_stride_y: 128 } },
      '12': { class_type: 'VHS_VideoCombine', inputs: { images: ['11', 0], frame_rate: 16, loop_count: 0, filename_prefix: prefix, format: 'video/h264-mp4', pingpong: false, save_output: true, pix_fmt: 'yuv420p', crf: 19, save_metadata: true, trim_to_audio: false } },
    },
  };
}

async function downloadImage(url: string, localPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${url}`);
  fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));
}

async function scpToGpu(localPath: string, remoteName: string) {
  await execAsync(`scp -i ~/.ssh/id_ed25519_migration -o StrictHostKeyChecking=no "${localPath}" "${GPU_SSH}:${GPU_INPUT}/${remoteName}"`, { timeout: 30000 });
}

async function scpFromGpu(remoteFilename: string, localPath: string) {
  await execAsync(`scp -i ~/.ssh/id_ed25519_migration -o StrictHostKeyChecking=no "${GPU_SSH}:${GPU_OUTPUT}/${remoteFilename}" "${localPath}"`, { timeout: 120000 });
}

async function submitComfyUI(workflow: object): Promise<string> {
  const res = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  });
  if (!res.ok) throw new Error(`ComfyUI 제출 실패: ${res.status}`);
  const data = await res.json();
  return data.prompt_id;
}

async function pollComfyUI(promptId: string, timeoutMs = 240000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000));
    try {
      const res = await fetch(`${COMFYUI_URL}/history/${promptId}`);
      const data = await res.json();
      if (promptId in data) {
        const outputs = data[promptId]?.outputs || {};
        const gifs = outputs['12']?.gifs || [];
        if (gifs.length > 0) return gifs[0].filename;
        const status = data[promptId]?.status?.status_str;
        if (status === 'error') throw new Error('ComfyUI 렌더링 실패');
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('렌더링 실패')) throw e;
    }
  }
  throw new Error('ComfyUI 타임아웃');
}

/**
 * POST: start_frame + end_frame → Wan 2.2 MoE (5090 PC) → 영상
 * { cutId, seed? }
 */
export async function POST(request: NextRequest) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comfyui-'));
  try {
    const { cutId, seed: inputSeed } = await request.json();
    if (!cutId) return NextResponse.json({ error: 'cutId 필요' }, { status: 400 });

    const { data: cut, error: cutError } = await supabase
      .from('webtoonanimation_cuts')
      .select('*')
      .eq('id', cutId)
      .single();

    if (cutError || !cut) return NextResponse.json({ error: '컷을 찾을 수 없습니다' }, { status: 404 });
    if (!cut.video_prompt) {
      return NextResponse.json({ error: 'video_prompt를 먼저 작성해주세요' }, { status: 400 });
    }

    const frameRole: string = cut.frame_role || 'end';
    const isMidRef = frameRole === 'middle';

    // 중간 레퍼런스 모드: start_frame_url을 start+end 둘 다로 사용
    const startUrl = cut.start_frame_url;
    const endUrl = isMidRef ? cut.start_frame_url : cut.end_frame_url;

    if (!startUrl) {
      return NextResponse.json({ error: '앵커 프레임을 먼저 생성해주세요' }, { status: 400 });
    }
    if (!isMidRef && !cut.end_frame_url) {
      return NextResponse.json({ error: '나머지 프레임을 먼저 생성해주세요' }, { status: 400 });
    }

    const seed = inputSeed ?? Math.floor(Math.random() * 999999999);
    const prefix = `cut_${cutId.slice(0, 8)}_${seed}`;

    // 1. 이미지 로컬 다운로드
    const startLocal = path.join(tmpDir, `${prefix}_start.png`);
    const endLocal = path.join(tmpDir, `${prefix}_end.png`);
    console.log('[comfyui] 이미지 다운로드 중...');
    await Promise.all([
      downloadImage(startUrl, startLocal),
      downloadImage(endUrl!, endLocal),
    ]);

    // 2. 5090 PC로 SCP 전송
    const startRemote = `${prefix}_start.png`;
    const endRemote = `${prefix}_end.png`;
    console.log('[comfyui] 5090 PC로 전송 중...');
    await Promise.all([
      scpToGpu(startLocal, startRemote),
      scpToGpu(endLocal, endRemote),
    ]);

    // 3. ComfyUI 워크플로우 제출
    const workflow = buildWan22Workflow(startRemote, endRemote, cut.video_prompt, seed, prefix);
    console.log('[comfyui] 워크플로우 제출...');
    const promptId = await submitComfyUI(workflow);
    console.log(`[comfyui] prompt_id: ${promptId}, 폴링 시작...`);

    // 4. 완료 대기 (최대 4분)
    const outputFilename = await pollComfyUI(promptId);
    console.log(`[comfyui] 렌더 완료: ${outputFilename}`);

    // 5. 결과 다운로드
    const videoLocal = path.join(tmpDir, outputFilename);
    await scpFromGpu(outputFilename, videoLocal);

    // 6. Supabase Storage에 업로드
    const storagePath = `${cut.project_id}/${cutId}/comfyui_${seed}.mp4`;
    const videoBuf = fs.readFileSync(videoLocal);
    const { error: uploadError } = await supabase.storage
      .from('webtoonanimation')
      .upload(storagePath, videoBuf, { contentType: 'video/mp4', upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('webtoonanimation').getPublicUrl(storagePath);
    const videoUrl = urlData.publicUrl;

    // 7. DB 저장
    await supabase
      .from('webtoonanimation_cuts')
      .update({ comfyui_video_url: videoUrl })
      .eq('id', cutId);

    return NextResponse.json({ video_url: videoUrl, seed, prompt_id: promptId });
  } catch (error) {
    console.error('[generate-comfyui-video] 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '영상 생성 실패' },
      { status: 500 }
    );
  } finally {
    // 임시 파일 정리
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  }
}
