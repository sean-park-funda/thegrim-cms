import type { VideoProvider, VideoGenRequest, VideoGenResult, VideoGenImage } from '../providers';
import { generateVeoVideo } from '../veo';

async function getBase64(img: VideoGenImage): Promise<string | undefined> {
  if (img.base64) return img.base64;
  if (img.url) {
    const res = await fetch(img.url);
    if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).toString('base64');
  }
  return undefined;
}

export const veoProvider: VideoProvider = {
  capabilities: {
    id: 'veo',
    name: 'Veo 3.1 Fast',
    inputModes: ['single_image'],
    durations: [4, 6, 8],
    aspectRatios: ['16:9', '9:16'],
    maxImages: 1,
    contentSafety: 'moderate',
    costPerSec: 0.15,
    platform: 'direct',
  },

  async generate(req: VideoGenRequest): Promise<VideoGenResult> {
    const startImage = req.images.find((i) => i.role === 'start' || i.role === 'reference');
    const endImage = req.images.find((i) => i.role === 'end');

    const duration = ([4, 6, 8].includes(req.duration) ? req.duration : 4) as 4 | 6 | 8;
    const aspectRatio = req.aspectRatio === '9:16' ? '9:16' : '16:9';

    const startBase64 = startImage ? await getBase64(startImage) : undefined;
    const endBase64 = endImage ? await getBase64(endImage) : undefined;

    const result = await generateVeoVideo({
      prompt: req.prompt,
      startImageBase64: startBase64,
      startImageMimeType: startImage?.mimeType || 'image/png',
      endImageBase64: endBase64,
      endImageMimeType: endImage?.mimeType || 'image/png',
      config: {
        aspectRatio,
        durationSeconds: duration,
        personGeneration: 'allow_adult',
      },
    });

    return {
      videoBase64: result.videoBase64,
      mimeType: result.mimeType,
      provider: 'veo',
      elapsedMs: result.elapsedMs,
    };
  },
};
