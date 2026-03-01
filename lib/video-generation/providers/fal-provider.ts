import type { VideoProvider, VideoGenRequest, VideoGenResult, ProviderCapabilities } from '../providers';

const FAL_KEY = process.env.FAL_KEY || '';
const FAL_BASE = 'https://queue.fal.run';

interface FalModelConfig {
  capabilities: ProviderCapabilities;
  endpoint: string;
  buildPayload: (req: VideoGenRequest) => Record<string, unknown>;
  extractVideo: (result: Record<string, unknown>) => { url: string };
}

async function safeFalJson(res: Response, label: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`fal.ai ${label}: invalid JSON (${res.status}) — ${text.slice(0, 500)}`);
  }
}

async function falRequest(endpoint: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const log = (msg: string) => console.log(`[fal.ai][${endpoint}] ${msg}`);

  // Strip image data from payload for logging
  const logPayload = { ...payload };
  for (const key of Object.keys(logPayload)) {
    if (typeof logPayload[key] === 'string' && (logPayload[key] as string).startsWith('data:')) {
      logPayload[key] = `<data-uri ${Math.round((logPayload[key] as string).length / 1024)}KB>`;
    }
  }
  log(`SUBMIT payload: ${JSON.stringify(logPayload)}`);

  // 1. Submit
  const submitRes = await fetch(`${FAL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  log(`SUBMIT response: ${submitRes.status} ${submitRes.statusText}`);

  if (!submitRes.ok) {
    const err = await submitRes.text();
    log(`SUBMIT error body: ${err.slice(0, 1000)}`);
    throw new Error(`fal.ai submit failed (${submitRes.status}): ${err.slice(0, 500)}`);
  }

  const submitData = await safeFalJson(submitRes, 'submit');
  const request_id = submitData.request_id as string;
  const initStatus = submitData.status as string;
  const statusUrl = (submitData.status_url as string) || `${FAL_BASE}/${endpoint}/requests/${request_id}/status`;
  const responseUrl = (submitData.response_url as string) || `${FAL_BASE}/${endpoint}/requests/${request_id}`;

  log(`SUBMIT result: request_id=${request_id}, status=${initStatus}`);
  log(`URLs: status=${statusUrl}, response=${responseUrl}`);

  if (!request_id) {
    throw new Error(`fal.ai: no request_id in response: ${JSON.stringify(submitData).slice(0, 500)}`);
  }

  if (initStatus === 'COMPLETED') {
    log('Immediate COMPLETED, fetching result...');
    const resultRes = await fetch(responseUrl, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
    });
    log(`Result response: ${resultRes.status}`);
    return safeFalJson(resultRes, 'result');
  }

  // 2. Poll
  const timeout = Date.now() + 600000; // 10min
  let pollCount = 0;
  while (Date.now() < timeout) {
    await new Promise((r) => setTimeout(r, 5000));
    pollCount++;

    const statusRes = await fetch(statusUrl, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
    });
    log(`POLL #${pollCount}: HTTP ${statusRes.status}`);
    const statusData = await safeFalJson(statusRes, 'status');
    log(`POLL #${pollCount}: status=${statusData.status}, queue_position=${statusData.queue_position ?? 'n/a'}`);

    if (statusData.status === 'COMPLETED') {
      log('COMPLETED, fetching result...');
      const resultRes = await fetch(responseUrl, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
      });
      log(`Result response: ${resultRes.status}`);
      const result = await safeFalJson(resultRes, 'result');
      log(`Result keys: ${Object.keys(result).join(', ')}`);
      return result;
    }

    if (statusData.status === 'FAILED') {
      log(`FAILED: ${JSON.stringify(statusData).slice(0, 500)}`);
      throw new Error(`fal.ai failed: ${statusData.error || JSON.stringify(statusData).slice(0, 300)}`);
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
      const id = config.capabilities.id;
      console.log(`[fal.ai][${id}] generate() start — mode=${req.inputMode}, images=${req.images.length}, duration=${req.duration}, aspect=${req.aspectRatio}`);

      if (!FAL_KEY) throw new Error('FAL_KEY 환경변수가 설정되지 않았습니다');

      const startedAt = Date.now();
      const payload = config.buildPayload(req);
      const result = await falRequest(config.endpoint, payload);

      console.log(`[fal.ai][${id}] extractVideo from result keys: ${Object.keys(result).join(', ')}`);
      const { url } = config.extractVideo(result);
      console.log(`[fal.ai][${id}] video URL: ${url.slice(0, 100)}`);

      // Download video
      const videoRes = await fetch(url);
      console.log(`[fal.ai][${id}] video download: ${videoRes.status}, content-type=${videoRes.headers.get('content-type')}, size=${videoRes.headers.get('content-length')}`);
      if (!videoRes.ok) throw new Error(`Video download failed: ${videoRes.status}`);
      const videoBase64 = Buffer.from(await videoRes.arrayBuffer()).toString('base64');

      const elapsed = Date.now() - startedAt;
      console.log(`[fal.ai][${id}] done in ${elapsed}ms, video size=${Math.round(videoBase64.length / 1024)}KB`);

      return {
        videoBase64,
        mimeType: 'video/mp4',
        provider: id,
        elapsedMs: elapsed,
      };
    },
  };
}

// --- Model Configs ---

const klingConfig: FalModelConfig = {
  capabilities: {
    id: 'kling',
    name: 'Kling 2.0',
    inputModes: ['single_image'],
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    maxImages: 1,
    contentSafety: 'moderate',
    costPerSec: 0.04,
    platform: 'fal.ai',
  },
  endpoint: 'fal-ai/kling-video/v2/master/image-to-video',
  buildPayload: (req) => {
    const img = req.images.find((i) => i.role === 'start' || i.role === 'reference');
    return {
      prompt: req.prompt,
      image_url: img ? imageToDataUrl(img.base64, img.mimeType) : undefined,
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
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    maxImages: 1,
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
      duration: req.duration <= 5 ? 5 : 10,
      resolution: '720p',
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
    maxImages: 2,
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
    maxImages: 2,
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
    maxImages: 1,
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
    maxImages: 1,
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
