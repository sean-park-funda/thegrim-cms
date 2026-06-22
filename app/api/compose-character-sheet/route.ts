import { NextRequest, NextResponse } from 'next/server';
import type { ReferenceImage } from '@/lib/types/compose';
import { falGptImageEditQueue } from '@/lib/fal';

export type { ReferenceImage };

interface ComposeRequest {
  baseSheetUrl: string;
  outfitImages: ReferenceImage[];
  propImages: ReferenceImage[];
  globalInstruction?: string;
  previewOnly?: boolean;    // true → Gemini 분석 후 프롬프트만 반환 (fal.ai 미호출)
  preBuiltPrompt?: string;  // 제공 시 Gemini 분석 스킵, 바로 fal.ai 제출
}

interface AnalyzedImage extends ReferenceImage {
  aiDescription: string;
}

// ── Gemini 이미지 분석 ───────────────────────────────────────
async function analyzeImage(imageUrl: string, role: 'outfit' | 'hair' | 'accessory'): Promise<string> {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return '';

  const promptMap = {
    outfit: 'Describe this clothing/outfit item for a manga character designer. Be specific about: collar/neckline type, button or fastener details, sleeve length and style, fit (tight/relaxed/oversized), hemline position, and any distinctive design features or structural details. 2-3 sentences max.',
    hair: 'Describe this hairstyle for a manga character designer. Include: overall silhouette and shape, length (where it falls on the body), layering, volume, flow direction, and any distinctive features. 1-2 sentences max.',
    accessory: 'Describe this accessory for a manga character designer. Include its shape, size, how it would be worn/placed, and any distinctive details. 1-2 sentences max.',
  };

  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return '';
    const buf = await imgRes.arrayBuffer();
    const mimeType = imgRes.headers.get('content-type')?.split(';')[0] || 'image/png';
    const base64 = Buffer.from(buf).toString('base64');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: promptMap[role] },
            { inlineData: { mimeType, data: base64 } },
          ]}],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.2,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error(`[analyzeImage] Gemini API error ${res.status}:`, err);
      return '';
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  } catch (e) {
    console.error('[analyzeImage] fetch error:', e);
    return '';
  }
}

// ── 헤어 감지 ───────────────────────────────────────────────
// H1, H2 등 헤어 아이템 네이밍 컨벤션 포함
const HAIR_PATTERN = /헤어|hair|wig|가발|머리|\bH\d/i;
function isHairItem(instruction?: string): boolean {
  return HAIR_PATTERN.test(instruction ?? '');
}

// ── 의상 부위 감지 ───────────────────────────────────────────
// BT는 B보다 먼저 체크 (prefix 우선순위)
function getOutfitPartLabel(instruction?: string): { part: string; changeVerb: string; details: string } {
  const s = (instruction ?? '').toUpperCase();
  if (/\bBT\d*\b/.test(s) || /BOOT|SHOE|FOOTWEAR|부츠|신발/.test(instruction ?? '')) {
    return { part: 'BOOTS/FOOTWEAR', changeVerb: 'Replace the boots/footwear with', details: 'silhouette, height, sole, any straps or buckles' };
  }
  if (/\bB\d*\b/.test(s) || /PANT|TROUSER|SKIRT|하의|바지|치마/.test(instruction ?? '')) {
    return { part: 'PANTS/LOWER GARMENT', changeVerb: 'Replace the pants/lower garment with', details: 'silhouette, length, fit, waistband, any pockets or seams' };
  }
  if (/\bS\d*\b/.test(s) || /SHAWL|CAPE|MANTLE|SHOULDER|숄|망토/.test(instruction ?? '')) {
    return { part: 'SHOULDER PIECE/SHAWL', changeVerb: 'Replace the shoulder piece with', details: 'shape, drape, coverage, how it attaches' };
  }
  // T* or unrecognized → treat as top/jacket
  return { part: 'TOP/JACKET', changeVerb: 'Replace the top/jacket with', details: 'silhouette, collar, fasteners, sleeves, fit, hemline' };
}

// ── 프롬프트 빌더 ───────────────────────────────────────────
function buildComposePrompt(
  rawOutfitImages: AnalyzedImage[],
  rawPropImages: AnalyzedImage[],
  globalInstruction?: string,
): string {
  // outfit으로 저장됐더라도 이름이 헤어면 hair로 재분류
  const outfitItems = rawOutfitImages.filter(img => !isHairItem(img.instruction));
  const hairItems = [
    ...rawOutfitImages.filter(img => isHairItem(img.instruction)),
    ...rawPropImages.filter(img => isHairItem(img.instruction)),
  ];
  const accessoryItems = rawPropImages.filter(img => !isHairItem(img.instruction));

  const changeSummary: string[] = [];
  if (outfitItems.length > 0) {
    outfitItems.forEach(img => changeSummary.push(getOutfitPartLabel(img.instruction).part.toLowerCase()));
  }
  if (hairItems.length > 0) changeSummary.push('hairstyle');
  if (accessoryItems.length > 0) changeSummary.push('accessories');

  const parts: string[] = [];
  parts.push('You are a professional character designer specializing in anime/manga-style character reference sheets.');
  parts.push('');
  parts.push(`TASK: Modify ONLY the ${changeSummary.join(', ')} on the character in IMAGE 1 to exactly match the reference images. Apply changes across all 4 views (FRONT, THREE-QUARTER, SIDE, BACK).`);
  parts.push('');
  parts.push('IMAGE 1 (base character): The character reference sheet to edit. Contains 4 views: FRONT, THREE-QUARTER, SIDE, BACK — plus an equipment callouts panel on the right.');
  parts.push('');

  let idx = 2;
  for (const img of outfitItems) {
    const { part } = getOutfitPartLabel(img.instruction);
    parts.push(`IMAGE ${idx} (${part.toLowerCase()} reference):`);
    if (img.aiDescription) parts.push(`  Visual analysis: ${img.aiDescription}`);
    if (img.instruction) parts.push(`  Label: ${img.instruction}`);
    parts.push('');
    idx++;
  }
  for (const img of hairItems) {
    parts.push(`IMAGE ${idx} (hairstyle reference):`);
    if (img.aiDescription) parts.push(`  Visual analysis: ${img.aiDescription}`);
    if (img.instruction) parts.push(`  Label: ${img.instruction}`);
    parts.push('');
    idx++;
  }
  for (const img of accessoryItems) {
    parts.push(`IMAGE ${idx} (accessory reference):`);
    if (img.aiDescription) parts.push(`  Visual analysis: ${img.aiDescription}`);
    if (img.instruction) parts.push(`  Label: ${img.instruction}`);
    parts.push('');
    idx++;
  }

  parts.push('CHANGES TO MAKE:');

  idx = 2;
  for (const img of outfitItems) {
    const { changeVerb, details } = getOutfitPartLabel(img.instruction);
    parts.push(`- ${changeVerb} IMAGE ${idx}. Replicate every detail: ${details}.`);
    idx++;
  }
  for (const img of hairItems) {
    parts.push(`- CHANGE the hairstyle to exactly match IMAGE ${idx}. Replicate the shape, silhouette, length, and volume.`);
    idx++;
  }
  for (const img of accessoryItems) {
    parts.push(`- Add the accessory from IMAGE ${idx} to the character.`);
    idx++;
  }
  if (globalInstruction) {
    parts.push(`- Additional: ${globalInstruction}`);
  }

  return parts.join('\n');
}

// ── POST 핸들러 ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  let body: ComposeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없습니다.' }, { status: 400 });
  }

  const { baseSheetUrl, outfitImages = [], propImages = [] } = body;

  if (!baseSheetUrl) {
    return NextResponse.json({ error: '베이스 캐릭터시트가 필요합니다.' }, { status: 400 });
  }
  if (outfitImages.length + propImages.length === 0) {
    return NextResponse.json({ error: '의상 또는 소품 레퍼런스가 필요합니다.' }, { status: 400 });
  }
  if (outfitImages.length + propImages.length > 5) {
    return NextResponse.json({ error: '레퍼런스 이미지는 최대 5개까지 가능합니다.' }, { status: 400 });
  }

  const imageUrls: string[] = [
    baseSheetUrl,
    ...outfitImages.map(img => img.fileUrl),
    ...propImages.map(img => img.fileUrl),
  ];

  let prompt: string;
  if (body.preBuiltPrompt) {
    prompt = body.preBuiltPrompt;
  } else {
    // Gemini로 레퍼런스 이미지 병렬 분석 (헤어 재분류 후 role 결정)
    const [analyzedOutfits, analyzedProps] = await Promise.all([
      Promise.all(outfitImages.map(async img => ({
        ...img,
        aiDescription: await analyzeImage(img.fileUrl, isHairItem(img.instruction) ? 'hair' : 'outfit'),
      }))),
      Promise.all(propImages.map(async img => ({
        ...img,
        aiDescription: await analyzeImage(img.fileUrl, isHairItem(img.instruction) ? 'hair' : 'accessory'),
      }))),
    ]);
    prompt = buildComposePrompt(analyzedOutfits, analyzedProps, body.globalInstruction);
  }

  if (body.previewOnly) {
    return NextResponse.json({ prompt });
  }

  try {
    const job = await falGptImageEditQueue({ prompt, imageUrls, size: { width: 1920, height: 1080 } });
    return NextResponse.json(job);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
