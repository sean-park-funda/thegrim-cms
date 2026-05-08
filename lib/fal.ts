const FAL_EDIT_URL = 'https://fal.run/openai/gpt-image-2/edit';
const FAL_STORAGE_INITIATE = 'https://rest.alpha.fal.ai/storage/upload/initiate';

export interface FalEditResult {
  imageData: string;  // base64
  mimeType: string;
}

/**
 * data:image/...;base64,... URL을 fal.ai 스토리지에 업로드하고 HTTPS URL을 반환.
 * fal.ai는 data: URL을 image_urls로 직접 지원하지 않음.
 */
async function uploadDataUrlToFal(dataUrl: string, falKey: string): Promise<string> {
  const [header, base64Data] = dataUrl.split(',');
  const mimeType = header.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const buffer = Buffer.from(base64Data, 'base64');

  // 1. 업로드 URL 발급
  const initRes = await fetch(FAL_STORAGE_INITIATE, {
    method: 'POST',
    headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: `upload.${ext}`, content_type: mimeType }),
  });
  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`fal.ai 스토리지 초기화 실패 (${initRes.status}): ${err}`);
  }
  const { upload_url, file_url } = await initRes.json();

  // 2. 바이너리 PUT 업로드
  const putRes = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: buffer,
  });
  if (!putRes.ok) {
    throw new Error(`fal.ai 스토리지 PUT 실패 (${putRes.status})`);
  }

  return file_url as string;
}

/**
 * GPT Image 2 Edit — 동기 호출 (fal.run, timeout 300s)
 * image_urls: HTTPS URL 또는 data:... base64 URL 배열 (data: URL은 자동으로 fal.ai 스토리지에 업로드)
 */
export async function falGptImageEdit(params: {
  prompt: string;
  imageUrls: string[];
  size?: { width: number; height: number };
}): Promise<FalEditResult> {
  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) throw new Error('FAL_KEY 없음');

  // data: URL을 fal.ai 스토리지에 먼저 업로드
  const resolvedUrls = await Promise.all(
    params.imageUrls.map(url =>
      url.startsWith('data:') ? uploadDataUrlToFal(url, FAL_KEY) : Promise.resolve(url)
    )
  );

  const response = await fetch(FAL_EDIT_URL, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      image_urls: resolvedUrls,
      image_size: params.size ?? { width: 1024, height: 1024 },
      quality: 'high',
      n: 1,
    }),
    // @ts-ignore — Node fetch signal
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`fal.ai 실패 (${response.status}): ${err}`);
  }

  const data = await response.json();

  const imageUrl: string | undefined =
    data.images?.[0]?.url ??
    data.image?.url ??
    data.output?.images?.[0]?.url;

  if (!imageUrl) {
    throw new Error(`fal.ai 이미지 URL 없음: ${JSON.stringify(data)}`);
  }

  // 이미지 다운로드 → base64
  const imgRes = await fetch(imageUrl);
  const buf = await imgRes.arrayBuffer();
  const mimeType = imgRes.headers.get('content-type') || 'image/png';
  const imageData = Buffer.from(buf).toString('base64');

  return { imageData, mimeType };
}
