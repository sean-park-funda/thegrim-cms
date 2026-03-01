import type { VideoProvider, VideoGenRequest, VideoGenResult, ProviderCapabilities } from '../providers';

const FAL_KEY = process.env.FAL_KEY || '';
const FAL_BASE = 'https://queue.fal.run';

interface FalModelConfig {
  capabilities: ProviderCapabilities;
  endpoint: string;
  buildPayload: (req: VideoGenRequest) => Record<string, unknown>;
  extractVideo: (result: Record<string, unknown>) => { url: string };
}

async function falRequest(endpoint: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  // 1. Submit
  const submitRes = await fetch(`${FAL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`fal.ai submit failed (${submitRes.status}): ${err}`);
  }

  const { request_id, status: initStatus } = await submitRes.json();

  if (initStatus === 'COMPLETED') {
    // 동기 결과 (queue bypass)
    const resultRes = await fetch(`${FAL_BASE}/${endpoint}/requests/${request_id}`, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
    });
    return resultRes.json();
  }

  // 2. Poll
  const timeout = Date.now() + 600000; // 10min
  while (Date.now() < timeout) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetch(
      `${FAL_BASE}/${endpoint}/requests/${request_id}/status`,
      { headers: { 'Authorization': `Key ${FAL_KEY}` } }
    );
    const statusData = await statusRes.json();

    if (statusData.status === 'COMPLETED') {
      const resultRes = await fetch(
        `${FAL_BASE}/${endpoint}/requests/${request_id}`,
        { headers: { 'Authorization': `Key ${FAL_KEY}` } }
      );
      return resultRes.json();
    }

    if (statusData.status === 'FAILED') {
      throw new Error(`fal.ai failed: ${statusData.error || 'unknown error'}`);
    }
  }

  throw new Error('fal.ai timeout (10min)');
}

function imageToDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}

function createFalProvider(config: FalModelConfig): VideoProvider {
  return {
    capabilities: config.capabilities,
    async generate(req: VideoGenRequest): Promise<VideoGenResult> {
      if (!FAL_KEY) throw new Error('FAL_KEY 환경변수가 설정되지 않았습니다');

      const startedAt = Date.now();
      const payload = config.buildPayload(req);
      const result = await falRequest(config.endpoint, payload);
      const { url } = config.extractVideo(result);

      // Download video
      const videoRes = await fetch(url);
      if (!videoRes.ok) throw new Error(`Video download failed: ${videoRes.status}`);
      const videoBase64 = Buffer.from(await videoRes.arrayBuffer()).toString('base64');

      return {
        videoBase64,
        mimeType: 'video/mp4',
        provider: config.capabilities.id,
        elapsedMs: Date.now() - startedAt,
      };
    },
  };
}

// --- Model Configs ---

const klingConfig: FalModelConfig = {
  capabilities: {
    id: 'kling',
    name: 'Kling 2.0',
    inputModes: ['single_image', 'start_end_frame'],
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    contentSafety: 'moderate',
    costPerSec: 0.04,
    platform: 'fal.ai',
  },
  endpoint: 'fal-ai/kling-video/v2/master/image-to-video',
  buildPayload: (req) => {
    const startImg = req.images.find((i) => i.role === 'start' || i.role === 'reference');
    const endImg = req.images.find((i) => i.role === 'end');
    return {
      prompt: req.prompt,
      image_url: startImg ? imageToDataUrl(startImg.base64, startImg.mimeType) : undefined,
      tail_image_url: endImg ? imageToDataUrl(endImg.base64, endImg.mimeType) : undefined,
      duration: req.duration <= 5 ? '5' : '10',
      aspect_ratio: req.aspectRatio,
    };
  },
  extractVideo: (result) => {
    const video = (result as { video?: { url: string } }).video;
    if (!video?.url) throw new Error('Kling: no video in response');
    return { url: video.url };
  },
};

const pika22Config: FalModelConfig = {
  capabilities: {
    id: 'pika22',
    name: 'Pika 2.2',
    inputModes: ['single_image'],
    durations: [3, 5],
    aspectRatios: ['16:9', '9:16', '1:1'],
    contentSafety: 'moderate',
    costPerSec: 0.07,
    platform: 'fal.ai',
  },
  endpoint: 'fal-ai/pika/v2.2/image-to-video',
  buildPayload: (req) => {
    const img = req.images[0];
    return {
      prompt: req.prompt,
      image_url: img ? imageToDataUrl(img.base64, img.mimeType) : undefined,
      duration: req.duration,
      aspect_ratio: req.aspectRatio,
    };
  },
  extractVideo: (result) => {
    const video = (result as { video?: { url: string } }).video;
    if (!video?.url) throw new Error('Pika: no video in response');
    return { url: video.url };
  },
};

const lumaRay2Config: FalModelConfig = {
  capabilities: {
    id: 'luma_ray2',
    name: 'Luma Ray 2',
    inputModes: ['single_image', 'start_end_frame'],
    durations: [5, 9],
    aspectRatios: ['16:9', '9:16', '1:1'],
    contentSafety: 'moderate',
    costPerSec: 0.05,
    platform: 'fal.ai',
  },
  endpoint: 'fal-ai/luma-dream-machine/ray-2/image-to-video',
  buildPayload: (req) => {
    const startImg = req.images.find((i) => i.role === 'start' || i.role === 'reference');
    const endImg = req.images.find((i) => i.role === 'end');
    return {
      prompt: req.prompt,
      image_url: startImg ? imageToDataUrl(startImg.base64, startImg.mimeType) : undefined,
      end_image_url: endImg ? imageToDataUrl(endImg.base64, endImg.mimeType) : undefined,
      aspect_ratio: req.aspectRatio,
    };
  },
  extractVideo: (result) => {
    const video = (result as { video?: { url: string } }).video;
    if (!video?.url) throw new Error('Luma: no video in response');
    return { url: video.url };
  },
};

const wan21FlF2VConfig: FalModelConfig = {
  capabilities: {
    id: 'wan21_flf2v',
    name: 'Wan 2.1 (Start+End)',
    inputModes: ['start_end_frame'],
    durations: [3, 5],
    aspectRatios: ['16:9', '9:16'],
    contentSafety: 'lenient',
    costPerSec: 0.03,
    platform: 'fal.ai',
  },
  endpoint: 'fal-ai/wan/v2.1/first-last-frame-to-video',
  buildPayload: (req) => {
    const startImg = req.images.find((i) => i.role === 'start');
    const endImg = req.images.find((i) => i.role === 'end');
    return {
      prompt: req.prompt,
      first_frame_image_url: startImg ? imageToDataUrl(startImg.base64, startImg.mimeType) : undefined,
      last_frame_image_url: endImg ? imageToDataUrl(endImg.base64, endImg.mimeType) : undefined,
      num_frames: Math.round(req.duration * 16),
    };
  },
  extractVideo: (result) => {
    const video = (result as { video?: { url: string } }).video;
    if (!video?.url) throw new Error('Wan FLF2V: no video in response');
    return { url: video.url };
  },
};

const wan21I2VConfig: FalModelConfig = {
  capabilities: {
    id: 'wan21_i2v',
    name: 'Wan 2.1 I2V',
    inputModes: ['single_image'],
    durations: [3, 5],
    aspectRatios: ['16:9', '9:16'],
    contentSafety: 'lenient',
    costPerSec: 0.03,
    platform: 'fal.ai',
  },
  endpoint: 'fal-ai/wan/v2.1/image-to-video',
  buildPayload: (req) => {
    const img = req.images[0];
    return {
      prompt: req.prompt,
      image_url: img ? imageToDataUrl(img.base64, img.mimeType) : undefined,
      num_frames: Math.round(req.duration * 16),
    };
  },
  extractVideo: (result) => {
    const video = (result as { video?: { url: string } }).video;
    if (!video?.url) throw new Error('Wan I2V: no video in response');
    return { url: video.url };
  },
};

const hunyuanConfig: FalModelConfig = {
  capabilities: {
    id: 'hunyuan_i2v',
    name: 'Hunyuan I2V',
    inputModes: ['single_image'],
    durations: [4, 6],
    aspectRatios: ['16:9', '9:16'],
    contentSafety: 'lenient',
    costPerSec: 0.04,
    platform: 'fal.ai',
  },
  endpoint: 'fal-ai/hunyuan-video/image-to-video',
  buildPayload: (req) => {
    const img = req.images[0];
    return {
      prompt: req.prompt,
      image_url: img ? imageToDataUrl(img.base64, img.mimeType) : undefined,
      num_frames: Math.round(req.duration * 24),
    };
  },
  extractVideo: (result) => {
    const video = (result as { video?: { url: string } }).video;
    if (!video?.url) throw new Error('Hunyuan: no video in response');
    return { url: video.url };
  },
};

export function getFalProviders(): VideoProvider[] {
  return [
    klingConfig,
    pika22Config,
    lumaRay2Config,
    wan21FlF2VConfig,
    wan21I2VConfig,
    hunyuanConfig,
  ].map(createFalProvider);
}
