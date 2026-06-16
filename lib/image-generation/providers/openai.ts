import type { GenerateImageResult, OpenAIRequest } from '../types';

const DEFAULT_MODEL = 'gpt-image-1';
const DEFAULT_TIMEOUT = 120000;
const OPENAI_API_BASE = 'https://api.openai.com/v1';

// aspect ratio → OpenAI size 매핑 (가장 근접한 값)
function mapAspectRatioToSize(aspectRatio?: string): string {
  if (!aspectRatio) return 'auto';
  const map: Record<string, string> = {
    '16:9': '1536x1024',
    '3:2': '1536x1024',
    '4:3': '1536x1024',
    '21:9': '1536x1024',
    '1:1': '1024x1024',
    '9:16': '1024x1536',
    '2:3': '1024x1536',
    '3:4': '1024x1536',
  };
  return map[aspectRatio] ?? 'auto';
}

// base64 data URL → PNG Buffer
async function dataUrlToPngBuffer(dataUrl: string): Promise<Buffer> {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(base64, 'base64');
}

export async function generateOpenAIImage(request: OpenAIRequest): Promise<GenerateImageResult> {
  const startTime = Date.now();
  const apiKey = request.apiKey || process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');

  const model = request.model || DEFAULT_MODEL;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT;
  const size = mapAspectRatioToSize(request.aspectRatio);
  const hasImages = request.images && request.images.length > 0;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let b64: string;

    if (hasImages) {
      // 레퍼런스 이미지 있을 때: /v1/images/edits (multipart)
      const formData = new FormData();
      formData.append('model', model);
      formData.append('prompt', request.prompt);
      formData.append('n', '1');
      if (size !== 'auto') formData.append('size', size);
      formData.append('response_format', 'b64_json');

      // 첫 번째 이미지를 메인 image로, 나머지는 추가 참조로 prompt에 통합
      const imgBuf = await dataUrlToPngBuffer(request.images![0]);
      const imgBlob = new Blob([new Uint8Array(imgBuf)], { type: 'image/png' });
      formData.append('image', imgBlob, 'image.png');

      const res = await fetch(`${OPENAI_API_BASE}/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI edits API 오류 (${res.status}): ${err.slice(0, 400)}`);
      }

      const data = await res.json() as { data: Array<{ b64_json?: string }> };
      b64 = data.data[0]?.b64_json ?? '';
    } else {
      // 이미지 없을 때: /v1/images/generations
      const res = await fetch(`${OPENAI_API_BASE}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: request.prompt,
          n: 1,
          size: size === 'auto' ? '1024x1024' : size,
          response_format: 'b64_json',
          moderation: 'low',
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI generations API 오류 (${res.status}): ${err.slice(0, 400)}`);
      }

      const data = await res.json() as { data: Array<{ b64_json?: string }> };
      b64 = data.data[0]?.b64_json ?? '';
    }

    if (!b64) throw new Error('OpenAI API: 이미지 데이터가 없습니다.');

    return {
      base64: b64,
      mimeType: 'image/png',
      provider: 'openai',
      model,
      elapsedMs: Date.now() - startTime,
    };
  } finally {
    clearTimeout(timer);
  }
}
