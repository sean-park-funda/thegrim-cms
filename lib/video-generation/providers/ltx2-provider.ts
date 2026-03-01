import type { VideoProvider, VideoGenRequest, VideoGenResult } from '../providers';

const COMFYUI_HOST = process.env.COMFYUI_HOST || 'http://100.79.136.74:8188';

function buildI2VWorkflow(imageBase64: string, prompt: string, width: number, height: number, frames: number): Record<string, unknown> {
  return {
    '1': {
      class_type: 'LoadImage',
      inputs: { image: imageBase64, upload: true },
    },
    '2': {
      class_type: 'LTXVImgToVideo',
      inputs: {
        positive_prompt: prompt,
        negative_prompt: 'blurry, distorted, low quality, watermark, text',
        image: ['1', 0],
        width,
        height,
        num_frames: frames,
        steps: 8,
        cfg: 1.0,
        seed: Math.floor(Math.random() * 2147483647),
        ckpt_name: 'ltx-2-19b-dev-fp8.safetensors',
        text_encoder_name: 'gemma_3_12B_it_fp4_mixed.safetensors',
        lora_name: 'ltx-2-19b-distilled-lora-384.safetensors',
        lora_strength: 1.0,
      },
    },
    '3': {
      class_type: 'VHS_VideoCombine',
      inputs: {
        images: ['2', 0],
        frame_rate: 24,
        format: 'video/h264-mp4',
        filename_prefix: 'ltx2_i2v',
      },
    },
  };
}

export const ltx2Provider: VideoProvider = {
  capabilities: {
    id: 'ltx2',
    name: 'LTX-2 (Local)',
    inputModes: ['single_image'],
    durations: [3, 5, 8],
    aspectRatios: ['16:9', '9:16'],
    maxImages: 1,
    contentSafety: 'lenient',
    costPerSec: 0,
    platform: 'comfyui',
  },

  async generate(req: VideoGenRequest): Promise<VideoGenResult> {
    const img = req.images[0];
    if (!img) throw new Error('LTX-2: 이미지가 필요합니다');

    const startedAt = Date.now();
    const frames = Math.round(req.duration * 24);
    const [width, height] = req.aspectRatio === '9:16' ? [480, 848] : [848, 480];

    // 1. Upload image to ComfyUI
    const formData = new FormData();
    const imageBuffer = Buffer.from(img.base64, 'base64');
    formData.append('image', new Blob([imageBuffer], { type: img.mimeType }), 'input.png');
    formData.append('overwrite', 'true');

    const uploadRes = await fetch(`${COMFYUI_HOST}/upload/image`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) throw new Error(`ComfyUI image upload failed: ${uploadRes.status}`);
    const uploadData = await uploadRes.json();
    const imageName = uploadData.name;

    // 2. Build and submit workflow
    const workflow = buildI2VWorkflow(imageName, req.prompt, width, height, frames);
    const promptRes = await fetch(`${COMFYUI_HOST}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!promptRes.ok) throw new Error(`ComfyUI prompt submit failed: ${promptRes.status}`);
    const { prompt_id } = await promptRes.json();

    // 3. Poll for completion
    const timeout = Date.now() + 600000;
    let outputFilename = '';

    while (Date.now() < timeout) {
      await new Promise((r) => setTimeout(r, 3000));

      const historyRes = await fetch(`${COMFYUI_HOST}/history/${prompt_id}`);
      const history = await historyRes.json();
      const entry = history[prompt_id];

      if (!entry) continue;

      if (entry.status?.status_str === 'error') {
        throw new Error(`ComfyUI error: ${JSON.stringify(entry.status)}`);
      }

      // Check outputs
      const outputs = entry.outputs;
      if (outputs) {
        for (const nodeId of Object.keys(outputs)) {
          const nodeOutput = outputs[nodeId];
          if (nodeOutput.gifs?.[0]?.filename) {
            outputFilename = nodeOutput.gifs[0].filename;
            break;
          }
          if (nodeOutput.videos?.[0]?.filename) {
            outputFilename = nodeOutput.videos[0].filename;
            break;
          }
        }
        if (outputFilename) break;
      }
    }

    if (!outputFilename) throw new Error('ComfyUI: timeout or no output');

    // 4. Download result
    const videoRes = await fetch(`${COMFYUI_HOST}/view?filename=${encodeURIComponent(outputFilename)}&type=output`);
    if (!videoRes.ok) throw new Error(`ComfyUI video download failed: ${videoRes.status}`);
    const videoBase64 = Buffer.from(await videoRes.arrayBuffer()).toString('base64');

    return {
      videoBase64,
      mimeType: 'video/mp4',
      provider: 'ltx2',
      elapsedMs: Date.now() - startedAt,
    };
  },
};
