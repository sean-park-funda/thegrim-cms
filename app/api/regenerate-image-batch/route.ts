import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import crypto from 'crypto';
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY;
const SEEDREAM_API_BASE_URL = process.env.SEEDREAM_API_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';
const SEEDREAM_API_ENDPOINT = `${SEEDREAM_API_BASE_URL}/images/generations`;

const SEEDREAM_API_TIMEOUT = 60000; // 60珥?
const GEMINI_API_TIMEOUT = 120000; // 120珥?(?대?吏 ?앹꽦?????ㅻ옒 嫄몃┫ ???덉쓬)
const SEEDREAM_MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const SEEDREAM_MAX_PIXELS = 36000000; // 36,000,000 ?쎌?

// ?덊띁?곗뒪 ?대?吏 由ъ궗?댁쭠 寃곌낵 罹먯떆
const referenceImageResizeCache = new Map<string, { base64: string; mimeType: string; resized: boolean }>();
const MAX_CACHE_SIZE = 100;

// Gemini API?먯꽌 吏?먰븯???대?吏 鍮꾩쑉 紐⑸줉
const GEMINI_ASPECT_RATIOS = [
  '21:9', '16:9', '4:3', '3:2',
  '1:1',
  '9:16', '3:4', '2:3',
  '5:4', '4:5',
] as const;

// Seedream API?먯꽌 吏?먰븯???대?吏 鍮꾩쑉 紐⑸줉
const SEEDREAM_ASPECT_RATIOS = [
  '21:9', '16:9', '4:3', '3:2',
  '1:1',
  '9:16', '3:4', '2:3',
] as const;

// ?먮윭 媛앹껜???곸꽭 ?뺣낫瑜?異붿텧?섎뒗 ?ы띁 ?⑥닔
function extractErrorDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {};

  if (error instanceof Error) {
    details.name = error.name;
    
    // message媛 JSON 臾몄옄?댁씤 寃쎌슦 ?뚯떛 ?쒕룄
    let parsedMessage: unknown = error.message;
    if (typeof error.message === 'string') {
      try {
        // JSON 臾몄옄?댁씤吏 ?뺤씤?섍퀬 ?뚯떛 ?쒕룄
        const trimmed = error.message.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          parsedMessage = JSON.parse(error.message);
        }
      } catch {
        // ?뚯떛 ?ㅽ뙣 ???먮낯 硫붿떆吏 ?ъ슜
        parsedMessage = error.message;
      }
    }
    details.message = parsedMessage;
    details.stack = error.stack;

    // cause ?띿꽦???덉쑝硫??ш??곸쑝濡?異붿텧
    if (error.cause) {
      details.cause = extractErrorDetails(error.cause);
    }

    // Error 媛앹껜??異붽? ?띿꽦??異붿텧 (????⑥뼵???듯빐 ?묎렐)
    const errorObj = error as unknown as Record<string, unknown>;
    Object.keys(errorObj).forEach(key => {
      if (!['name', 'message', 'stack', 'cause'].includes(key)) {
        try {
          // 吏곷젹??媛?ν븳 媛믩쭔 ?ы븿
          JSON.stringify(errorObj[key]);
          details[key] = errorObj[key];
        } catch {
          // 吏곷젹??遺덇??ν븳 媛믪? 臾몄옄?대줈 蹂??
          details[key] = String(errorObj[key]);
        }
      }
    });
  } else if (typeof error === 'object' && error !== null) {
    // Error 媛앹껜媛 ?꾨땶 寃쎌슦 紐⑤뱺 ?띿꽦 異붿텧
    const errorObj = error as Record<string, unknown>;
    Object.keys(errorObj).forEach(key => {
      try {
        JSON.stringify(errorObj[key]);
        details[key] = errorObj[key];
      } catch {
        details[key] = String(errorObj[key]);
      }
    });
  } else {
    details.value = String(error);
  }

  return details;
}

// ?먮윭 ??낃낵 ?ъ슜??硫붿떆吏瑜?援щ텇?섎뒗 ?⑥닔
function categorizeError(error: unknown, provider: 'gemini' | 'seedream'): { code: string; message: string } {
  if (error instanceof Error) {
    // ??꾩븘???먮윭
    if (error.message.toLowerCase().includes('timeout')) {
      return {
        code: provider === 'gemini' ? 'GEMINI_TIMEOUT' : 'SEEDREAM_TIMEOUT',
        message: `${provider === 'gemini' ? 'Gemini' : 'Seedream'} API ?붿껌???쒓컙 珥덇낵?섏뿀?듬땲?? ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.`,
      };
    }

    // ApiError??寃쎌슦 status ?뺤씤
    const errorObj = error as unknown as Record<string, unknown>;
    if ('status' in errorObj && typeof errorObj.status === 'number') {
      const status = errorObj.status;
      
      // 503 Service Unavailable (?ㅻ쾭濡쒕뱶)
      if (status === 503) {
        // 硫붿떆吏??"overloaded" ?ы븿 ?щ? ?뺤씤
        const errorMessage = String(error.message || '');
        if (errorMessage.toLowerCase().includes('overload') || errorMessage.toLowerCase().includes('overloaded')) {
          return {
            code: provider === 'gemini' ? 'GEMINI_OVERLOAD' : 'SEEDREAM_OVERLOAD',
            message: `${provider === 'gemini' ? 'Gemini' : 'Seedream'} ?쒕퉬?ㅺ? ?꾩옱 怨쇰????곹깭?낅땲?? ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.`,
          };
        }
        return {
          code: provider === 'gemini' ? 'GEMINI_SERVICE_UNAVAILABLE' : 'SEEDREAM_SERVICE_UNAVAILABLE',
          message: `${provider === 'gemini' ? 'Gemini' : 'Seedream'} ?쒕퉬?ㅻ? ?ъ슜?????놁뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.`,
        };
      }

      // 429 Too Many Requests
      if (status === 429) {
        return {
          code: provider === 'gemini' ? 'GEMINI_RATE_LIMIT' : 'SEEDREAM_RATE_LIMIT',
          message: `?붿껌???덈Т 留롮뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.`,
        };
      }
    }
  }

  // 湲고? ?먮윭
  return {
    code: provider === 'gemini' ? 'GEMINI_ERROR' : 'SEEDREAM_ERROR',
    message: `?대?吏 ?앹꽦 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.`,
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = SEEDREAM_API_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

function getClosestAspectRatio(width: number, height: number, provider: 'gemini' | 'seedream'): string {
  const originalRatio = width / height;
  const supportedRatios = provider === 'gemini' ? GEMINI_ASPECT_RATIOS : SEEDREAM_ASPECT_RATIOS;
  
  let closestRatio = '1:1';
  let minDifference = Infinity;
  
  for (const ratio of supportedRatios) {
    const [w, h] = ratio.split(':').map(Number);
    const ratioValue = w / h;
    const difference = Math.abs(originalRatio - ratioValue);
    
    if (difference < minDifference) {
      minDifference = difference;
      closestRatio = ratio;
    }
  }
  
  return closestRatio;
}

async function resizeImageIfNeeded(
  imageBuffer: Buffer,
  maxSize: number = SEEDREAM_MAX_IMAGE_SIZE,
  maxPixels: number = SEEDREAM_MAX_PIXELS
): Promise<{ base64: string; mimeType: string; resized: boolean }> {
  const currentSize = imageBuffer.length;
  const metadata = await sharp(imageBuffer).metadata();
  const originalWidth = metadata.width || 1920;
  const originalHeight = metadata.height || 1080;
  const currentPixels = originalWidth * originalHeight;

  if (currentSize <= maxSize && currentPixels <= maxPixels) {
    return {
      base64: imageBuffer.toString('base64'),
      mimeType: metadata.format === 'jpeg' ? 'image/jpeg' : 'image/png',
      resized: false,
    };
  }

  const needsPixelResize = currentPixels > maxPixels;
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (needsPixelResize) {
    const pixelScale = Math.sqrt(maxPixels / currentPixels) * 0.95;
    targetWidth = Math.round(originalWidth * pixelScale);
    targetHeight = Math.round(originalHeight * pixelScale);
  }

  let resizedBuffer: Buffer;
  let quality = 85;

  resizedBuffer = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: 'inside' })
    .jpeg({ quality })
    .toBuffer();

  if (resizedBuffer.length <= maxSize) {
    return {
      base64: resizedBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      resized: true,
    };
  }

  for (quality = 80; quality >= 50; quality -= 10) {
    resizedBuffer = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, { fit: 'inside' })
      .jpeg({ quality })
      .toBuffer();

    if (resizedBuffer.length <= maxSize) {
      return {
        base64: resizedBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        resized: true,
      };
    }
  }

  for (let scale = 0.8; scale >= 0.4; scale -= 0.1) {
    const newWidth = Math.round(targetWidth * scale);
    const newHeight = Math.round(targetHeight * scale);

    resizedBuffer = await sharp(imageBuffer)
      .resize(newWidth, newHeight, { fit: 'inside' })
      .jpeg({ quality: 70 })
      .toBuffer();

    if (resizedBuffer.length <= maxSize) {
      return {
        base64: resizedBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        resized: true,
      };
    }
  }

  resizedBuffer = await sharp(imageBuffer)
    .resize(2048, 2048, { fit: 'inside' })
    .jpeg({ quality: 60 })
    .toBuffer();

  return {
    base64: resizedBuffer.toString('base64'),
    mimeType: 'image/jpeg',
    resized: true,
  };
}

function calculateSeedreamSize(width: number, height: number): string {
  const originalRatio = width / height;
  const baseSize = 2048;
  const minPixels = 3686400; // Seedream ?붽뎄 理쒖냼 ?쎌? (??1920x1920)
  
  let targetWidth: number;
  let targetHeight: number;
  
  if (originalRatio >= 1) {
    targetWidth = baseSize;
    targetHeight = Math.round(baseSize / originalRatio);
  } else {
    targetHeight = baseSize;
    targetWidth = Math.round(baseSize * originalRatio);
  }
  
  const minWidth = 1280;
  const minHeight = 720;
  const maxWidth = 4096;
  const maxHeight = 4096;
  
  if (targetWidth < minWidth) {
    targetWidth = minWidth;
    targetHeight = Math.round(minWidth / originalRatio);
  }
  if (targetHeight < minHeight) {
    targetHeight = minHeight;
    targetWidth = Math.round(minHeight * originalRatio);
  }
  
  if (targetWidth > maxWidth) {
    targetWidth = maxWidth;
    targetHeight = Math.round(maxWidth / originalRatio);
  }
  if (targetHeight > maxHeight) {
    targetHeight = maxHeight;
    targetWidth = Math.round(maxHeight * originalRatio);
  }
  
  // 8??諛곗닔濡?諛섏삱由?
  targetWidth = Math.round(targetWidth / 8) * 8;
  targetHeight = Math.round(targetHeight / 8) * 8;
  
  // 理쒖냼 ?쎌? ??蹂댁옣 (3686400px ?댁긽) - 8??諛곗닔 諛섏삱由???理쒖쥌 ?뺤씤
  let area = targetWidth * targetHeight;
  if (area < minPixels) {
    const scale = Math.sqrt(minPixels / area);
    targetWidth = Math.ceil((targetWidth * scale) / 8) * 8;
    targetHeight = Math.ceil((targetHeight * scale) / 8) * 8;
    // ?ㅼ??쇱뾽 ?꾩뿉??max ?쒗븳 ?뺤씤
    if (targetWidth > maxWidth) targetWidth = maxWidth;
    if (targetHeight > maxHeight) targetHeight = maxHeight;
  }
  
  return `${targetWidth}x${targetHeight}`;
}

interface RegenerateImageRequest {
  stylePrompt: string;
  index: number;
  apiProvider: 'gemini' | 'seedream';
  styleId?: string; // ?ㅽ???ID (?좏깮??
  styleKey?: string; // ?ㅽ?????(?좏깮??
  styleName?: string; // ?ㅽ????대쫫 (?좏깮??
}

interface RegenerateImageBatchRequest {
  characterSheets?: Array<{ sheetId: string }>; // 罹먮┃?곗떆???뺣낫 (sheetId留??꾩슂, file_path??DB?먯꽌 議고쉶)
  fileId: string;
  referenceFileId?: string; // ?섏쐞 ?명솚??
  referenceFileIds?: string[]; // ?덊띁?곗뒪 ?대?吏 ?뚯씪 ID 諛곗뿴
  requests: RegenerateImageRequest[];
  createdBy?: string; // ?ъ깮?깆쓣 ?붿껌???ъ슜??ID (?좏깮?? ?놁쑝硫??먮낯 ?뚯씪???앹꽦???ъ슜)
}

interface RegenerateImageBatchResponse {
  images: Array<{
    index: number;
    fileId?: string; // ?뚯씪 ID (DB????λ맂, ?깃났 ?쒖뿉留?議댁옱)
    filePath?: string; // ?뚯씪 寃쎈줈 (Storage 寃쎈줈, ?깃났 ?쒖뿉留?議댁옱)
    fileUrl?: string; // ?뚯씪 URL (誘몃━蹂닿린?? ?깃났 ?쒖뿉留?議댁옱)
    mimeType?: string; // ?깃났 ?쒖뿉留?議댁옱
    apiProvider: 'gemini' | 'seedream';
    stylePrompt: string; // ?꾨＼?꾪듃 (?덉뒪?좊━??
    imageData?: string; // ?섏쐞 ?명솚?깆쓣 ?꾪빐 ?좏깮?곸쑝濡??좎? (?꾩떆 ?뚯씪 ????ㅽ뙣 ?쒖뿉留??ъ슜)
    styleId?: string; // ?ㅽ???ID
    styleKey?: string; // ?ㅽ?????
    styleName?: string; // ?ㅽ????대쫫
    // ?먮윭 ?뺣낫 (?ㅽ뙣 ?쒖뿉留?議댁옱)
    error?: {
      code: string; // ?먮윭 肄붾뱶 ('GEMINI_OVERLOAD', 'GEMINI_TIMEOUT', 'GEMINI_ERROR', 'SEEDREAM_ERROR' ??
      message: string; // ?ъ슜?먯뿉寃??쒖떆??硫붿떆吏
      details?: unknown; // ?곸꽭 ?먮윭 ?뺣낫 (?붾쾭源낆슜)
    };
  }>;
}

// MIME ??낆뿉???뺤옣??異붿텧
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return mimeToExt[mimeType] || '.png';
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[?대?吏 ?ъ깮??諛곗튂] 諛곗튂 ?ъ깮???붿껌 ?쒖옉');

  try {
    const body: RegenerateImageBatchRequest = await request.json();
    const { fileId, referenceFileId, referenceFileIds, requests, characterSheets, createdBy } = body;
    
    // referenceFileIds媛 ?덉쑝硫??ъ슜, ?놁쑝硫?referenceFileId瑜?諛곗뿴濡?蹂??(?섏쐞 ?명솚??
    const finalReferenceFileIds = referenceFileIds || (referenceFileId ? [referenceFileId] : undefined);
    
    const hasCharacterSheets = !!(characterSheets && characterSheets.length > 0);
    
    // apiProvider媛 鍮꾩뼱?덈뒗 ?붿껌?????湲곕낯媛??ㅼ젙 (?꾩뿭 湲곕낯: Seedream, ??罹먮┃?곗떆??紐⑤뱶 ?쒖쇅)
    const defaultProvider: 'gemini' | 'seedream' = 'seedream';
    requests.forEach(req => {
      if (!req.apiProvider) {
        req.apiProvider = defaultProvider;
      }
    });

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId媛 ?꾩슂?⑸땲??' },
        { status: 400 }
      );
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json(
        { error: '?앹꽦 ?붿껌???꾩슂?⑸땲??' },
        { status: 400 }
      );
    }

    console.log('[?대?吏 ?ъ깮??諛곗튂] ?붿껌 ?뚮씪誘명꽣:', {
      fileId,
      referenceFileIds: finalReferenceFileIds || '?놁쓬',
      referenceFileIdsCount: finalReferenceFileIds?.length || 0,
      requestCount: requests.length,
      createdBy: createdBy || '?놁쓬 (?먮낯 ?뚯씪 ?앹꽦???ъ슜)',
    });

    // ?뚯씪 ?뺣낫 議고쉶 (??踰덈쭔)
    console.log('[?대?吏 ?ъ깮??諛곗튂] ?뚯씪 ?뺣낫 議고쉶 ?쒖옉...');
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      console.error('[?대?吏 ?ъ깮??諛곗튂] ?뚯씪 議고쉶 ?ㅽ뙣:', fileError);
      return NextResponse.json(
        { error: '?뚯씪??李얠쓣 ???놁뒿?덈떎.' },
        { status: 404 }
      );
    }

    if (file.file_type !== 'image') {
      return NextResponse.json(
        { error: '?대?吏 ?뚯씪留??ъ깮?깊븷 ???덉뒿?덈떎.' },
        { status: 400 }
      );
    }

    // ?덊띁?곗뒪 ?뚯씪 ?뺣낫 議고쉶 (?덈뒗 寃쎌슦)
    const referenceFiles: Array<{ file_path: string }> = [];
    if (finalReferenceFileIds && finalReferenceFileIds.length > 0) {
      console.log('[?대?吏 ?ъ깮??諛곗튂] ?덊띁?곗뒪 ?뚯씪 ?뺣낫 議고쉶 ?쒖옉...', { count: finalReferenceFileIds.length });
      
      for (const refFileId of finalReferenceFileIds) {
        // 癒쇱? reference_files ?뚯씠釉붿뿉??議고쉶 ?쒕룄
        const { data: refFile, error: refFileError } = await supabase
          .from('reference_files')
          .select('file_path')
          .eq('id', refFileId)
          .single();

        if (refFileError || !refFile) {
          // reference_files?먯꽌 李얠? 紐삵븯硫?files ?뚯씠釉붿뿉??議고쉶 ?쒕룄
          console.log('[?대?吏 ?ъ깮??諛곗튂] reference_files?먯꽌 李얠? 紐삵븿, files ?뚯씠釉붿뿉??議고쉶 ?쒕룄...', { refFileId });
          const { data: regularFile, error: regularFileError } = await supabase
            .from('files')
            .select('file_path')
            .eq('id', refFileId)
            .single();

          if (regularFileError || !regularFile) {
            console.error('[?대?吏 ?ъ깮??諛곗튂] ?덊띁?곗뒪 ?뚯씪 議고쉶 ?ㅽ뙣:', { refFileId, error: refFileError || regularFileError });
            continue; // 媛쒕퀎 ?ㅽ뙣?대룄 怨꾩냽 吏꾪뻾
          }
          referenceFiles.push(regularFile);
          console.log('[?대?吏 ?ъ깮??諛곗튂] files ?뚯씠釉붿뿉???덊띁?곗뒪 ?뚯씪 李얠쓬', { refFileId });
        } else {
          referenceFiles.push(refFile);
          console.log('[?대?吏 ?ъ깮??諛곗튂] reference_files ?뚯씠釉붿뿉???덊띁?곗뒪 ?뚯씪 李얠쓬', { refFileId });
        }
      }
      
      if (referenceFiles.length === 0) {
        console.error('[?대?吏 ?ъ깮??諛곗튂] 紐⑤뱺 ?덊띁?곗뒪 ?뚯씪 議고쉶 ?ㅽ뙣');
        return NextResponse.json(
          { error: '?덊띁?곗뒪 ?뚯씪??李얠쓣 ???놁뒿?덈떎.' },
          { status: 404 }
        );
      }
      
      console.log('[?대?吏 ?ъ깮??諛곗튂] ?덊띁?곗뒪 ?뚯씪 議고쉶 ?꾨즺:', {
        total: finalReferenceFileIds.length,
        success: referenceFiles.length,
      });
    }

    // 罹먮┃?곗떆???대?吏 罹먯떆 (??踰덈쭔 ?ㅼ슫濡쒕뱶)
    let characterSheetImagesCache: Array<{ base64: string; mimeType: string }> | null = null;
    
    if (hasCharacterSheets && characterSheets) {
      console.log('[?대?吏 ?ъ깮??諛곗튂] 罹먮┃?곗떆???대?吏 ?ㅼ슫濡쒕뱶 ?쒖옉...', { count: characterSheets.length });
      characterSheetImagesCache = [];
      
      for (const sheet of characterSheets) {
        try {
          // ?덊띁?곗뒪 ?뚯씪泥섎읆 DB?먯꽌 file_path 議고쉶
          console.log('[?대?吏 ?ъ깮??諛곗튂] 罹먮┃?곗떆???뚯씪 ID濡??뚯씪 ?뺣낫 議고쉶 ?쒖옉...', { sheetId: sheet.sheetId });
          const { data: sheetFile, error: sheetFileError } = await supabase
            .from('character_sheets')
            .select('file_path')
            .eq('id', sheet.sheetId)
            .single();

          if (sheetFileError || !sheetFile) {
            console.error('[?대?吏 ?ъ깮??諛곗튂] 罹먮┃?곗떆???뚯씪 議고쉶 ?ㅽ뙣:', {
              sheetId: sheet.sheetId,
              error: sheetFileError,
            });
            continue;
          }

          console.log('[?대?吏 ?ъ깮??諛곗튂] 罹먮┃?곗떆???대?吏 ?ㅼ슫濡쒕뱶 ?쒖옉...', { sheetId: sheet.sheetId, filePath: sheetFile.file_path });
          const sheetResponse = await fetch(sheetFile.file_path);
          
          if (!sheetResponse.ok) {
            console.error('[?대?吏 ?ъ깮??諛곗튂] 罹먮┃?곗떆???대?吏 ?ㅼ슫濡쒕뱶 ?ㅽ뙣:', {
              sheetId: sheet.sheetId,
              status: sheetResponse.status,
              filePath: sheetFile.file_path,
            });
            continue;
          }
          
          const sheetArrayBuffer = await sheetResponse.arrayBuffer();
          const sheetBuffer = Buffer.from(sheetArrayBuffer);
          const sheetBase64 = sheetBuffer.toString('base64');
          const sheetMimeType = sheetResponse.headers.get('content-type') || 'image/jpeg';
          
          characterSheetImagesCache.push({
            base64: sheetBase64,
            mimeType: sheetMimeType,
          });
        } catch (error) {
          console.error('[?대?吏 ?ъ깮??諛곗튂] 罹먮┃?곗떆???대?吏 ?ㅼ슫濡쒕뱶 以??ㅻ쪟:', {
            sheetId: sheet.sheetId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      if (characterSheetImagesCache.length === 0) {
        console.error('[?대?吏 ?ъ깮??諛곗튂] 紐⑤뱺 罹먮┃?곗떆???대?吏 ?ㅼ슫濡쒕뱶 ?ㅽ뙣');
        return NextResponse.json(
          { error: '罹먮┃?곗떆???대?吏瑜?媛?몄삱 ???놁뒿?덈떎.' },
          { status: 400 }
        );
      }
      
      console.log('[?대?吏 ?ъ깮??諛곗튂] 罹먮┃?곗떆???대?吏 ?ㅼ슫濡쒕뱶 ?꾨즺:', {
        total: characterSheets.length,
        success: characterSheetImagesCache.length,
      });
    }

    // ?대?吏 ?ㅼ슫濡쒕뱶 (?먮낯怨??덊띁?곗뒪瑜?蹂묐젹濡? ??꾩븘???ㅼ젙)
    console.log('[?대?吏 ?ъ깮??諛곗튂] ?대?吏 ?ㅼ슫濡쒕뱶 ?쒖옉...');
    const IMAGE_DOWNLOAD_TIMEOUT = 30000; // 30珥?
    
    // ?먮낯 ?대?吏 ?ㅼ슫濡쒕뱶
    const imageDownloadPromise = fetchWithTimeout(file.file_path, {}, IMAGE_DOWNLOAD_TIMEOUT)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`?대?吏 ?ㅼ슫濡쒕뱶 ?ㅽ뙣: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log('[?대?吏 ?ъ깮??諛곗튂] ?먮낯 ?대?吏 ?ㅼ슫濡쒕뱶 ?꾨즺:', {
          size: buffer.length,
          mimeType: response.headers.get('content-type') || 'image/jpeg',
        });
        return {
          buffer,
          mimeType: response.headers.get('content-type') || 'image/jpeg',
        };
      });

    // ?덊띁?곗뒪 ?대?吏???ㅼ슫濡쒕뱶 (蹂묐젹)
    const referenceDownloadPromises = referenceFiles.map((refFile, index) =>
      fetchWithTimeout(refFile.file_path, {}, IMAGE_DOWNLOAD_TIMEOUT)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`?덊띁?곗뒪 ?대?吏 ?ㅼ슫濡쒕뱶 ?ㅽ뙣: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          console.log('[?대?吏 ?ъ깮??諛곗튂] ?덊띁?곗뒪 ?대?吏 ?ㅼ슫濡쒕뱶 ?꾨즺:', {
            index: index + 1,
            total: referenceFiles.length,
            size: buffer.length,
            mimeType: response.headers.get('content-type') || 'image/jpeg',
          });
          return {
            buffer,
            mimeType: response.headers.get('content-type') || 'image/jpeg',
          };
        })
    );

    // ?먮낯怨??덊띁?곗뒪 ?대?吏?ㅼ쓣 蹂묐젹濡??ㅼ슫濡쒕뱶
    const [imageResult, ...referenceResults] = await Promise.allSettled([
      imageDownloadPromise,
      ...referenceDownloadPromises,
    ]);

    // ?먮낯 ?대?吏 泥섎━
    if (imageResult.status === 'rejected') {
      console.error('[?대?吏 ?ъ깮??諛곗튂] ?대?吏 ?ㅼ슫濡쒕뱶 ?ㅽ뙣:', imageResult.reason);
      return NextResponse.json(
        { error: '?대?吏瑜?媛?몄삱 ???놁뒿?덈떎.' },
        { status: 400 }
      );
    }

    const imageBuffer = imageResult.value.buffer;
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = imageResult.value.mimeType;

    // ?대?吏 硫뷀??곗씠??媛?몄삤湲?
    console.log('[?대?吏 ?ъ깮??諛곗튂] ?대?吏 硫뷀??곗씠??異붿텧 ?쒖옉...');
    const imageMetadata = await sharp(imageBuffer).metadata();
    const originalWidth = imageMetadata.width || 1920;
    const originalHeight = imageMetadata.height || 1080;
    console.log('[?대?吏 ?ъ깮??諛곗튂] ?대?吏 硫뷀??곗씠??異붿텧 ?꾨즺:', {
      width: originalWidth,
      height: originalHeight,
      format: imageMetadata.format,
    });

    // ?덊띁?곗뒪 ?대?吏 泥섎━
    const refImages: Array<{ base64: string; mimeType: string }> = [];
    referenceResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        refImages.push({
          base64: result.value.buffer.toString('base64'),
          mimeType: result.value.mimeType,
        });
      } else {
        console.error('[?대?吏 ?ъ깮??諛곗튂] ?덊띁?곗뒪 ?대?吏 ?ㅼ슫濡쒕뱶 ?ㅽ뙣:', {
          index: index + 1,
          error: result.reason,
        });
      }
    });
    
    if (referenceFiles.length > 0 && refImages.length === 0) {
      console.error('[?대?吏 ?ъ깮??諛곗튂] 紐⑤뱺 ?덊띁?곗뒪 ?대?吏 ?ㅼ슫濡쒕뱶 ?ㅽ뙣');
      return NextResponse.json(
        { error: '?덊띁?곗뒪 ?대?吏瑜?媛?몄삱 ???놁뒿?덈떎.' },
        { status: 400 }
      );
    }
    
    console.log('[?대?吏 ?ъ깮??諛곗튂] ?덊띁?곗뒪 ?대?吏 ?ㅼ슫濡쒕뱶 ?꾨즺:', {
      total: referenceFiles.length,
      success: refImages.length,
    });

    // Provider蹂꾨줈 洹몃９??(?꾨떖??apiProvider瑜?洹몃?濡??ъ슜)
    console.log('[?대?吏 ?ъ깮??諛곗튂] Provider蹂?洹몃９???쒖옉...');
    const geminiRequests = requests.filter(r => r.apiProvider === 'gemini');
    const seedreamRequests = requests.filter(r => r.apiProvider === 'seedream');
    console.log('[?대?吏 ?ъ깮??諛곗튂] Provider蹂?洹몃９???꾨즺:', {
      geminiCount: geminiRequests.length,
      seedreamCount: seedreamRequests.length,
      totalCount: requests.length,
    });

    const results: RegenerateImageBatchResponse['images'] = [];

    // Seedream???대?吏 由ъ궗?댁쭠 (蹂묐젹 泥섎━ ?꾩뿉 誘몃━ 以鍮?
    let seedreamImageBase64: string | undefined;
    let seedreamMimeType: string | undefined;
    let seedreamImages: string[] | undefined;
    let seedreamSize: string | undefined;

    if (seedreamRequests.length > 0) {
      console.log('[?대?吏 ?ъ깮??諛곗튂] Seedream???대?吏 由ъ궗?댁쭠 以鍮??쒖옉...');
      // ?대?吏 由ъ궗?댁쭠 (??踰덈쭔)
      console.log('[?대?吏 ?ъ깮??諛곗튂] ?먮낯 ?대?吏 由ъ궗?댁쭠 ?쒖옉 (Seedream??...');
      const resizeStartTime = Date.now();
      const resizeResult = await resizeImageIfNeeded(imageBuffer);
      const resizeTime = Date.now() - resizeStartTime;
      console.log('[?대?吏 ?ъ깮??諛곗튂] ?먮낯 ?대?吏 由ъ궗?댁쭠 ?꾨즺:', {
        resized: resizeResult.resized,
        resizeTime: `${resizeTime}ms`,
        originalSize: imageBuffer.length,
        resizedBase64Length: resizeResult.base64.length,
      });
      
      seedreamImageBase64 = resizeResult.resized ? resizeResult.base64 : imageBase64;
      seedreamMimeType = resizeResult.resized ? resizeResult.mimeType : mimeType;
      const seedreamImageInput = `data:${seedreamMimeType};base64,${seedreamImageBase64}`;

      seedreamImages = [seedreamImageInput];
      if (refImages.length > 0) {
        console.log('[?대?吏 ?ъ깮??諛곗튂] ?덊띁?곗뒪 ?대?吏 由ъ궗?댁쭠 ?쒖옉 (Seedream??...', { count: refImages.length });
        
        for (const refImage of refImages) {
          const refResizeStartTime = Date.now();
          const cacheKey = `base64:${crypto.createHash('sha256').update(refImage.base64).digest('hex')}`;
          
          let refResizeResult: { base64: string; mimeType: string; resized: boolean };
          if (referenceImageResizeCache.has(cacheKey)) {
            refResizeResult = referenceImageResizeCache.get(cacheKey)!;
            console.log('[image-regeneration-batch] reference image resize cache hit');
          } else {
            const refBuffer = Buffer.from(refImage.base64, 'base64');
            refResizeResult = await resizeImageIfNeeded(refBuffer);
            const refResizeTime = Date.now() - refResizeStartTime;
            console.log('[?대?吏 ?ъ깮??諛곗튂] ?덊띁?곗뒪 ?대?吏 由ъ궗?댁쭠 ?꾨즺:', {
              resized: refResizeResult.resized,
              resizeTime: `${refResizeTime}ms`,
              originalBase64Length: refImage.base64.length,
              resizedBase64Length: refResizeResult.base64.length,
            });
            
            if (referenceImageResizeCache.size >= MAX_CACHE_SIZE) {
              const firstKey = referenceImageResizeCache.keys().next().value;
              if (firstKey) {
                referenceImageResizeCache.delete(firstKey);
              }
            }
            referenceImageResizeCache.set(cacheKey, refResizeResult);
          }
          
          const finalRefBase64 = refResizeResult.resized ? refResizeResult.base64 : refImage.base64;
          const finalRefMimeType = refResizeResult.resized ? refResizeResult.mimeType : refImage.mimeType;
          const refDataUrl = `data:${finalRefMimeType};base64,${finalRefBase64}`;
          seedreamImages.push(refDataUrl);
        }
        
        console.log('[?대?吏 ?ъ깮??諛곗튂] Seedream API???덊띁?곗뒪 ?대?吏 ?ы븿', { count: refImages.length });
      }

      // 罹먮┃?곗떆???대?吏 異붽? (罹먮┃??諛붽씀湲곗슜)
      if (characterSheetImagesCache && characterSheetImagesCache.length > 0) {
        console.log('[?대?吏 ?ъ깮??諛곗튂] 罹먮┃?곗떆???대?吏 由ъ궗?댁쭠 ?쒖옉 (Seedream??...', { count: characterSheetImagesCache.length });
        
        for (const sheetImage of characterSheetImagesCache) {
          const sheetResizeStartTime = Date.now();
          const cacheKey = `sheet:${crypto.createHash('sha256').update(sheetImage.base64).digest('hex')}`;
          
          let sheetResizeResult: { base64: string; mimeType: string; resized: boolean };
          if (referenceImageResizeCache.has(cacheKey)) {
            sheetResizeResult = referenceImageResizeCache.get(cacheKey)!;
            console.log('[image-regeneration-batch] character sheet resize cache hit');
          } else {
            const sheetBuffer = Buffer.from(sheetImage.base64, 'base64');
            sheetResizeResult = await resizeImageIfNeeded(sheetBuffer);
            const sheetResizeTime = Date.now() - sheetResizeStartTime;
            console.log('[?대?吏 ?ъ깮??諛곗튂] 罹먮┃?곗떆???대?吏 由ъ궗?댁쭠 ?꾨즺:', {
              resized: sheetResizeResult.resized,
              resizeTime: `${sheetResizeTime}ms`,
              originalBase64Length: sheetImage.base64.length,
              resizedBase64Length: sheetResizeResult.base64.length,
            });
            
            if (referenceImageResizeCache.size >= MAX_CACHE_SIZE) {
              const firstKey = referenceImageResizeCache.keys().next().value;
              if (firstKey) {
                referenceImageResizeCache.delete(firstKey);
              }
            }
            referenceImageResizeCache.set(cacheKey, sheetResizeResult);
          }
          
          const finalSheetBase64 = sheetResizeResult.resized ? sheetResizeResult.base64 : sheetImage.base64;
          const finalSheetMimeType = sheetResizeResult.resized ? sheetResizeResult.mimeType : sheetImage.mimeType;
          const sheetDataUrl = `data:${finalSheetMimeType};base64,${finalSheetBase64}`;
          seedreamImages.push(sheetDataUrl);
        }
        
        console.log('[?대?吏 ?ъ깮??諛곗튂] Seedream API??罹먮┃?곗떆???대?吏 ?ы븿', { count: characterSheetImagesCache.length });
      }

      seedreamSize = calculateSeedreamSize(originalWidth, originalHeight);
      console.log('[?대?吏 ?ъ깮??諛곗튂] Seedream size 怨꾩궛:', seedreamSize);
    }

    // Gemini? Seedream 洹몃９??蹂묐젹 泥섎━
    const processGeminiGroup = async (): Promise<RegenerateImageBatchResponse['images']> => {
      if (geminiRequests.length === 0) {
        return [];
      }
      
      // ?먮낯 ?뚯씪 ?뺣낫瑜??대줈?濡??꾨떖
      const sourceFile = file;
      
      console.log(`[?대?吏 ?ъ깮??諛곗튂] Gemini 洹몃９ 泥섎━ ?쒖옉 (${geminiRequests.length}媛??붿껌)...`);
      if (!GEMINI_API_KEY) {
        console.error('[?대?吏 ?ъ깮??諛곗튂] GEMINI_API_KEY媛 ?ㅼ젙?섏? ?딆쓬');
        throw new Error('GEMINI_API_KEY媛 ?ㅼ젙?섏? ?딆븯?듬땲??');
      }

      const aspectRatio = getClosestAspectRatio(originalWidth, originalHeight, 'gemini');
      console.log('[?대?吏 ?ъ깮??諛곗튂] Gemini aspectRatio 怨꾩궛:', aspectRatio);
      const model = 'gemini-3-pro-image-preview';

      const imageConfig: { imageSize: string; aspectRatio?: string } = {
        imageSize: '1K',
      };
      if (aspectRatio) {
        imageConfig.aspectRatio = aspectRatio;
      }

      const config = {
        responseModalities: ['IMAGE', 'TEXT'] as Array<'IMAGE' | 'TEXT'>,
        imageConfig,
        temperature: 1.0,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32768,
      };

      // Gemini ?붿껌?ㅼ쓣 2媛쒖뵫 泥?겕濡??섎늻??泥섎━
      const GEMINI_CONCURRENT_LIMIT = 2;
      const geminiGroupResults: RegenerateImageBatchResponse['images'] = [];

      for (let i = 0; i < geminiRequests.length; i += GEMINI_CONCURRENT_LIMIT) {
        const chunk = geminiRequests.slice(i, i + GEMINI_CONCURRENT_LIMIT);
        console.log(`[?대?吏 ?ъ깮??諛곗튂] Gemini 泥?겕 泥섎━ ?쒖옉 (${chunk.length}媛? ?몃뜳??${i}~${i + chunk.length - 1})...`);

        const geminiPromises = chunk.map(async (req) => {
        const requestStartTime = Date.now();

        try {
            console.log(`[?대?吏 ?ъ깮??諛곗튂] Gemini API ?몄텧 ?쒖옉 (?몃뜳??${req.index}):`, {
              prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
              promptLength: req.stylePrompt.length,
            });

            const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
            
            if (hasCharacterSheets && characterSheets) {
              // 罹먮┃??諛붽씀湲? DB?먯꽌 媛?몄삩 ?꾨＼?꾪듃 ?ъ슜 + ?먮낯 ?대?吏(1踰? + 罹먮┃?곗떆???대?吏??2踰??댄썑)
              // req.stylePrompt??DB???ㅽ????꾨＼?꾪듃 ?먮뒗 ?ъ슜?먭? ?섏젙???꾨＼?꾪듃
              contentParts.push({
                text: req.stylePrompt,
              });
              // 1踰??대?吏: ?먮낯 ?대?吏
              contentParts.push({
                inlineData: {
                  mimeType: mimeType,
                  data: imageBase64,
                },
              });
              // 2踰??댄썑: 罹먮┃?곗떆???대?吏??(罹먯떆?먯꽌 ?ъ궗??
              if (characterSheetImagesCache) {
                for (const sheetImage of characterSheetImagesCache) {
                  contentParts.push({
                    inlineData: {
                      mimeType: sheetImage.mimeType,
                      data: sheetImage.base64,
                    },
                  });
                }
              }
            } else if (refImages.length > 0) {
              contentParts.push({ text: req.stylePrompt });
              contentParts.push({
                inlineData: {
                  mimeType: mimeType,
                  data: imageBase64,
                },
              });
              // ?щ윭 ?덊띁?곗뒪 ?대?吏 異붽?
              for (const refImage of refImages) {
                contentParts.push({
                  inlineData: {
                    mimeType: refImage.mimeType,
                    data: refImage.base64,
                  },
                });
              }
              console.log(`[?대?吏 ?ъ깮??諛곗튂] Gemini API ?몄텧 (?몃뜳??${req.index}): ?덊띁?곗뒪 ?대?吏 ?ы븿`, { count: refImages.length });
            } else {
              contentParts.push({ text: req.stylePrompt });
              contentParts.push({
                inlineData: {
                  mimeType: mimeType,
                  data: imageBase64,
                },
              });
            }

            const contents = [{
              role: 'user' as const,
              parts: contentParts,
            }];

            console.log(`[?대?吏 ?ъ깮??諛곗튂] Gemini API ?몄텧 (?몃뜳??${req.index}):`, {
              timeout: `${GEMINI_API_TIMEOUT}ms`,
            });

            const { base64: finalImageData, mimeType: finalMimeType } = await generateGeminiImage({
              provider: 'gemini',
              model,
              contents,
              config,
              timeoutMs: GEMINI_API_TIMEOUT,
              retries: 3,
            });

            const requestTime = Date.now() - requestStartTime;
            console.log(`[?대?吏 ?ъ깮??諛곗튂] Gemini API ?몄텧 ?꾨즺 (?몃뜳??${req.index}):`, {
              requestTime: `${requestTime}ms`,
              imageDataLength: finalImageData.length,
              mimeType: finalMimeType,
            });

            // base64 ?곗씠?곕? Buffer濡?蹂??
            const imageBuffer = Buffer.from(finalImageData, 'base64');
            
            // ?곴뎄 ?뚯씪怨?媛숈? 寃쎈줈???꾩떆 ?뚯씪 ???
            const extension = getExtensionFromMimeType(finalMimeType);
            const uuid = crypto.randomUUID().substring(0, 8);
            const baseFileName = sourceFile.file_name.replace(/\.[^/.]+$/, '') || 'regenerated';
            // ?뚯씪紐?sanitize (?쒓? 諛??뱀닔臾몄옄 泥섎━)
            const sanitizedBaseFileName = baseFileName
              .replace(/[^a-zA-Z0-9._-]/g, '_') // ?쒓? 諛??뱀닔臾몄옄瑜??몃뜑?ㅼ퐫?대줈 蹂??
              .substring(0, 100); // ?뚯씪紐?湲몄씠 ?쒗븳
            const fileName = `${sanitizedBaseFileName}-${uuid}${extension}`;
            const storagePath = `${sourceFile.cut_id}/${sourceFile.process_id}/${fileName}`;
            
            console.log(`[?대?吏 ?ъ깮??諛곗튂] ?꾩떆 ?뚯씪 ????쒖옉 (?몃뜳??${req.index}):`, storagePath);
            const { error: uploadError } = await supabase.storage
              .from('webtoon-files')
              .upload(storagePath, imageBuffer, {
                contentType: finalMimeType,
                upsert: false,
              });

            if (uploadError) {
              console.error(`[?대?吏 ?ъ깮??諛곗튂] ?꾩떆 ?뚯씪 ????ㅽ뙣 (?몃뜳??${req.index}):`, {
                error: uploadError,
                storagePath,
                fileName,
                originalFileName: sourceFile.file_name,
              });
              
              // ?뚯씪紐??ъ떆??(??媛꾨떒???뚯씪紐??ъ슜)
              const fallbackFileName = `regenerated-${uuid}${extension}`;
              const fallbackStoragePath = `${sourceFile.cut_id}/${sourceFile.process_id}/${fallbackFileName}`;
              
              console.log(`[?대?吏 ?ъ깮??諛곗튂] ?ъ떆??- 媛꾨떒???뚯씪紐??ъ슜 (?몃뜳??${req.index}):`, fallbackStoragePath);
              const { error: retryError } = await supabase.storage
                .from('webtoon-files')
                .upload(fallbackStoragePath, imageBuffer, {
                  contentType: finalMimeType,
                  upsert: false,
                });
              
              if (retryError) {
                console.error(`[?대?吏 ?ъ깮??諛곗튂] ?ъ떆?꾨룄 ?ㅽ뙣 (?몃뜳??${req.index}):`, retryError);
                // ????ㅽ뙣 ??湲곗〈 諛⑹떇?쇰줈 fallback (base64 諛섑솚)
                return {
                  index: req.index,
                  imageData: finalImageData,
                  mimeType: finalMimeType,
                  apiProvider: 'gemini' as const,
                  fileId: '',
                  filePath: '',
                  fileUrl: '',
                  stylePrompt: req.stylePrompt,
                };
              }
              
              // ?ъ떆???깃났 ??fallback 寃쎈줈 ?ъ슜
              const { data: urlData } = supabase.storage
                .from('webtoon-files')
                .getPublicUrl(fallbackStoragePath);
              const fileUrl = urlData.publicUrl;
              
              // DB???꾩떆 ?뚯씪 ?뺣낫 ???(is_temp = true)
              let imageWidth: number | undefined;
              let imageHeight: number | undefined;
              try {
                const metadata = await sharp(imageBuffer).metadata();
                imageWidth = metadata.width;
                imageHeight = metadata.height;
              } catch (error) {
                console.warn(`[?대?吏 ?ъ깮??諛곗튂] 硫뷀??곗씠??異붿텧 ?ㅽ뙣 (?몃뜳??${req.index}):`, error);
              }
              
              const finalCreatedBy = createdBy || sourceFile.created_by;
              console.log(`[?대?吏 ?ъ깮??諛곗튂] ?뚯씪 ???(?몃뜳??${req.index}, Gemini fallback):`, {
                createdBy: createdBy || '?놁쓬 (?먮낯 ?뚯씪 ?앹꽦???ъ슜)',
                sourceCreatedBy: sourceFile.created_by,
                finalCreatedBy,
              });
              
              const { data: fileData, error: dbError } = await supabase
                .from('files')
                .insert({
                  cut_id: sourceFile.cut_id,
                  process_id: sourceFile.process_id,
                  file_name: fallbackFileName,
                  file_path: fileUrl,
                  storage_path: fallbackStoragePath,
                  file_size: imageBuffer.length,
                  file_type: 'image',
                  mime_type: finalMimeType,
                  description: `AI ?ъ깮?? ${sourceFile.file_name}`,
                  prompt: req.stylePrompt,
                  created_by: finalCreatedBy,
                  source_file_id: sourceFile.id,
                  is_temp: true,
                  metadata: {
                    width: imageWidth,
                    height: imageHeight,
                    ...(req.styleId && { style_id: req.styleId }),
                    ...(req.styleKey && { style_key: req.styleKey }),
                    ...(req.styleName && { style_name: req.styleName }),
                  },
                })
                .select()
                .single();
              
              if (dbError || !fileData) {
                console.error(`[?대?吏 ?ъ깮??諛곗튂] DB ????ㅽ뙣 (?몃뜳??${req.index}):`, dbError);
                await supabase.storage.from('webtoon-files').remove([fallbackStoragePath]);
                return {
                  index: req.index,
                  imageData: finalImageData,
                  mimeType: finalMimeType,
                  apiProvider: 'gemini' as const,
                  fileId: '',
                  filePath: '',
                  fileUrl: '',
                  stylePrompt: req.stylePrompt,
                };
              }
              
              return {
                index: req.index,
                fileId: fileData.id,
                filePath: fallbackStoragePath,
                fileUrl: fileUrl,
                mimeType: finalMimeType,
                apiProvider: 'gemini' as const,
                stylePrompt: req.stylePrompt,
                ...(req.styleId && { styleId: req.styleId }),
                ...(req.styleKey && { styleKey: req.styleKey }),
                ...(req.styleName && { styleName: req.styleName }),
              };
            }

            // ?뚯씪 URL ?앹꽦
            const { data: urlData } = supabase.storage
              .from('webtoon-files')
              .getPublicUrl(storagePath);
            const fileUrl = urlData.publicUrl;

            // ?대?吏 硫뷀??곗씠??異붿텧
            let imageWidth: number | undefined;
            let imageHeight: number | undefined;
            try {
              const metadata = await sharp(imageBuffer).metadata();
              imageWidth = metadata.width;
              imageHeight = metadata.height;
            } catch (error) {
              console.warn(`[?대?吏 ?ъ깮??諛곗튂] 硫뷀??곗씠??異붿텧 ?ㅽ뙣 (?몃뜳??${req.index}):`, error);
            }

            // DB???꾩떆 ?뚯씪 ?뺣낫 ???(is_temp = true)
            const finalCreatedBy = createdBy || sourceFile.created_by;
            console.log(`[?대?吏 ?ъ깮??諛곗튂] ?뚯씪 ???(?몃뜳??${req.index}, Gemini):`, {
              createdBy: createdBy || '?놁쓬 (?먮낯 ?뚯씪 ?앹꽦???ъ슜)',
              sourceCreatedBy: sourceFile.created_by,
              finalCreatedBy,
            });
            
            const { data: fileData, error: dbError } = await supabase
              .from('files')
              .insert({
                cut_id: sourceFile.cut_id,
                process_id: sourceFile.process_id,
                file_name: fileName,
                file_path: fileUrl,
                storage_path: storagePath,
                file_size: imageBuffer.length,
                file_type: 'image',
                mime_type: finalMimeType,
                description: `AI ?ъ깮?? ${sourceFile.file_name}`,
                prompt: req.stylePrompt,
                created_by: finalCreatedBy,
                source_file_id: sourceFile.id,
                is_temp: true,
                metadata: {
                  width: imageWidth,
                  height: imageHeight,
                },
              })
              .select()
              .single();

            if (dbError || !fileData) {
              console.error(`[?대?吏 ?ъ깮??諛곗튂] DB ????ㅽ뙣 (?몃뜳??${req.index}):`, dbError);
              // Storage ?뚯씪? ??젣
              await supabase.storage.from('webtoon-files').remove([storagePath]);
              // ????ㅽ뙣 ??湲곗〈 諛⑹떇?쇰줈 fallback (base64 諛섑솚)
              return {
                index: req.index,
                imageData: finalImageData,
                mimeType: finalMimeType,
                apiProvider: 'gemini' as const,
                fileId: '',
                filePath: '',
                fileUrl: '',
                stylePrompt: req.stylePrompt,
              };
            }

            console.log(`[?대?吏 ?ъ깮??諛곗튂] ?꾩떆 ?뚯씪 ????꾨즺 (?몃뜳??${req.index}):`, {
              fileId: fileData.id,
              storagePath,
              fileUrl,
              size: imageBuffer.length,
            });

            return {
              index: req.index,
              fileId: fileData.id,
              filePath: storagePath,
              fileUrl: fileUrl,
              mimeType: finalMimeType,
              apiProvider: 'gemini' as const,
              stylePrompt: req.stylePrompt,
              ...(req.styleId && { styleId: req.styleId }),
              ...(req.styleKey && { styleKey: req.styleKey }),
              ...(req.styleName && { styleName: req.styleName }),
            };
          } catch (error: unknown) {
            const errorDetails = extractErrorDetails(error);
            const isTimeout = error instanceof Error && error.message.toLowerCase().includes('timeout');
            const errorType = isTimeout ? 'timeout' : 'error';
            
            console.error(`[?대?吏 ?ъ깮??諛곗튂] Gemini API ?몄텧 ?ㅽ뙣 (?몃뜳??${req.index}, ${errorType}):`, {
              errorDetails,
              requestIndex: req.index,
              promptLength: req.stylePrompt.length,
              promptPreview: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
              errorType,
            });
            throw error;
          }
        });

        const chunkResults = await Promise.allSettled(geminiPromises);
        chunkResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            geminiGroupResults.push(result.value);
          } else {
            console.error(`[?대?吏 ?ъ깮??諛곗튂] Gemini ?붿껌 ?ㅽ뙣:`, result.reason);
            // ?ㅽ뙣???붿껌??寃곌낵???ы븿 (?먮윭 ?뺣낫? ?④퍡)
            const failedRequest = chunk[index];
            if (failedRequest) {
              const errorInfo = categorizeError(result.reason, 'gemini');
              // ?먮윭 ?뺣낫 寃利?
              if (!errorInfo || !errorInfo.code || !errorInfo.message) {
                console.error(`[?대?吏 ?ъ깮??諛곗튂] categorizeError 諛섑솚媛믪씠 ?좏슚?섏? ?딆쓬 (?몃뜳??${failedRequest.index}):`, errorInfo);
                errorInfo.code = 'GEMINI_ERROR';
                errorInfo.message = '?대?吏 ?앹꽦 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.';
              }
              const errorResult: RegenerateImageBatchResponse['images'][0] = {
                index: failedRequest.index,
                apiProvider: 'gemini',
                stylePrompt: failedRequest.stylePrompt,
                ...(failedRequest.styleId && { styleId: failedRequest.styleId }),
                ...(failedRequest.styleKey && { styleKey: failedRequest.styleKey }),
                ...(failedRequest.styleName && { styleName: failedRequest.styleName }),
                error: {
                  code: errorInfo.code,
                  message: errorInfo.message,
                },
              };
              console.log(`[?대?吏 ?ъ깮??諛곗튂] Gemini ?먮윭 寃곌낵 ?앹꽦 (?몃뜳??${failedRequest.index}):`, {
                errorCode: errorResult.error?.code,
                errorMessage: errorResult.error?.message,
                fullResult: JSON.stringify(errorResult, null, 2),
              });
              geminiGroupResults.push(errorResult);
            }
          }
        });
      }

      // ?깃났??寃껊쭔 移댁슫??(error媛 ?녿뒗 寃껊쭔)
      const geminiSuccessCount = geminiGroupResults.filter(r => !r.error).length;
      const geminiFailCount = geminiGroupResults.filter(r => !!r.error).length;
      console.log(`[?대?吏 ?ъ깮??諛곗튂] Gemini 洹몃９ 泥섎━ ?꾨즺: ${geminiSuccessCount}媛??깃났, ${geminiFailCount}媛??ㅽ뙣`);
      
      return geminiGroupResults;
    };

    const processSeedreamGroup = async (): Promise<RegenerateImageBatchResponse['images']> => {
      if (seedreamRequests.length === 0 || !seedreamImages || !seedreamSize) {
        return [];
      }
      
      // ?먮낯 ?뚯씪 ?뺣낫瑜??대줈?濡??꾨떖
      const sourceFile = file;

      console.log(`[?대?吏 ?ъ깮??諛곗튂] Seedream 洹몃９ 泥섎━ ?쒖옉 (${seedreamRequests.length}媛??붿껌)...`);
      if (!SEEDREAM_API_KEY) {
        console.error('[?대?吏 ?ъ깮??諛곗튂] SEEDREAM_API_KEY媛 ?ㅼ젙?섏? ?딆쓬');
        throw new Error('SEEDREAM_API_KEY媛 ?ㅼ젙?섏? ?딆븯?듬땲??');
      }

      // Seedream ?붿껌?ㅼ쓣 2媛쒖뵫 泥?겕濡??섎늻??泥섎━
      const SEEDREAM_CONCURRENT_LIMIT = 2;
      const seedreamGroupResults: RegenerateImageBatchResponse['images'] = [];

      for (let i = 0; i < seedreamRequests.length; i += SEEDREAM_CONCURRENT_LIMIT) {
        const chunk = seedreamRequests.slice(i, i + SEEDREAM_CONCURRENT_LIMIT);
        console.log(`[?대?吏 ?ъ깮??諛곗튂] Seedream 泥?겕 泥섎━ ?쒖옉 (${chunk.length}媛? ?몃뜳??${i}~${i + chunk.length - 1})...`);

        const seedreamPromises = chunk.map(async (req) => {
        const requestStartTime = Date.now();

        try {
            console.log(`[?대?吏 ?ъ깮??諛곗튂] Seedream API ?몄텧 ?쒖옉 (?몃뜳??${req.index}):`, {
              prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
              promptLength: req.stylePrompt.length,
            });

              const { base64: generatedImageData, mimeType: generatedImageMimeType } = await generateSeedreamImage({
                provider: 'seedream',
                model: 'seedream-4-5-251128',
                prompt: req.stylePrompt,
                images: seedreamImages,
                responseFormat: 'url',
                size: seedreamSize,
                stream: false,
                watermark: true,
                timeoutMs: SEEDREAM_API_TIMEOUT,
                retries: 3,
              });

            const requestTime = Date.now() - requestStartTime;
            console.log(`[?대?吏 ?ъ깮??諛곗튂] Seedream API ?몄텧 ?꾨즺 (?몃뜳??${req.index}):`, {
              requestTime: `${requestTime}ms`,
              imageDataLength: generatedImageData.length,
              mimeType: generatedImageMimeType,
            });

            // base64 ?곗씠?곕? Buffer濡?蹂??
            const imageBuffer = Buffer.from(generatedImageData, 'base64');
            
            // ?곴뎄 ?뚯씪怨?媛숈? 寃쎈줈???꾩떆 ?뚯씪 ???
            const extension = getExtensionFromMimeType(generatedImageMimeType || 'image/png');
            const uuid = crypto.randomUUID().substring(0, 8);
            const baseFileName = sourceFile.file_name.replace(/\.[^/.]+$/, '') || 'regenerated';
            // ?뚯씪紐?sanitize (?쒓? 諛??뱀닔臾몄옄 泥섎━)
            const sanitizedBaseFileName = baseFileName
              .replace(/[^a-zA-Z0-9._-]/g, '_') // ?쒓? 諛??뱀닔臾몄옄瑜??몃뜑?ㅼ퐫?대줈 蹂??
              .substring(0, 100); // ?뚯씪紐?湲몄씠 ?쒗븳
            const fileName = `${sanitizedBaseFileName}-${uuid}${extension}`;
            const storagePath = `${sourceFile.cut_id}/${sourceFile.process_id}/${fileName}`;
            
            console.log(`[?대?吏 ?ъ깮??諛곗튂] ?꾩떆 ?뚯씪 ????쒖옉 (?몃뜳??${req.index}):`, storagePath);
            const { error: uploadError } = await supabase.storage
              .from('webtoon-files')
              .upload(storagePath, imageBuffer, {
                contentType: generatedImageMimeType || 'image/png',
                upsert: false,
              });

            if (uploadError) {
              console.error(`[?대?吏 ?ъ깮??諛곗튂] ?꾩떆 ?뚯씪 ????ㅽ뙣 (?몃뜳??${req.index}):`, {
                error: uploadError,
                storagePath,
                fileName,
                originalFileName: sourceFile.file_name,
              });
              
              // ?뚯씪紐??ъ떆??(??媛꾨떒???뚯씪紐??ъ슜)
              const fallbackFileName = `regenerated-${uuid}${extension}`;
              const fallbackStoragePath = `${sourceFile.cut_id}/${sourceFile.process_id}/${fallbackFileName}`;
              
              console.log(`[?대?吏 ?ъ깮??諛곗튂] ?ъ떆??- 媛꾨떒???뚯씪紐??ъ슜 (?몃뜳??${req.index}):`, fallbackStoragePath);
              const { error: retryError } = await supabase.storage
                .from('webtoon-files')
                .upload(fallbackStoragePath, imageBuffer, {
                  contentType: generatedImageMimeType || 'image/png',
                  upsert: false,
                });
              
              if (retryError) {
                console.error(`[?대?吏 ?ъ깮??諛곗튂] ?ъ떆?꾨룄 ?ㅽ뙣 (?몃뜳??${req.index}):`, retryError);
                // ????ㅽ뙣 ??湲곗〈 諛⑹떇?쇰줈 fallback (base64 諛섑솚)
                return {
                  index: req.index,
                  imageData: generatedImageData,
                  mimeType: generatedImageMimeType || 'image/png',
                  apiProvider: 'seedream' as const,
                  fileId: '',
                  filePath: '',
                  fileUrl: '',
                  stylePrompt: req.stylePrompt,
                };
              }
              
              // ?ъ떆???깃났 ??fallback 寃쎈줈 ?ъ슜
              const { data: urlData } = supabase.storage
                .from('webtoon-files')
                .getPublicUrl(fallbackStoragePath);
              const fileUrl = urlData.publicUrl;
              
              // DB???꾩떆 ?뚯씪 ?뺣낫 ???(is_temp = true)
              let imageWidth: number | undefined;
              let imageHeight: number | undefined;
              try {
                const metadata = await sharp(imageBuffer).metadata();
                imageWidth = metadata.width;
                imageHeight = metadata.height;
              } catch (error) {
                console.warn(`[?대?吏 ?ъ깮??諛곗튂] 硫뷀??곗씠??異붿텧 ?ㅽ뙣 (?몃뜳??${req.index}):`, error);
              }
              
              const finalCreatedBy = createdBy || sourceFile.created_by;
              console.log(`[?대?吏 ?ъ깮??諛곗튂] ?뚯씪 ???(?몃뜳??${req.index}, Seedream fallback):`, {
                createdBy: createdBy || '?놁쓬 (?먮낯 ?뚯씪 ?앹꽦???ъ슜)',
                sourceCreatedBy: sourceFile.created_by,
                finalCreatedBy,
              });
              
              const { data: fileData, error: dbError } = await supabase
                .from('files')
                .insert({
                  cut_id: sourceFile.cut_id,
                  process_id: sourceFile.process_id,
                  file_name: fallbackFileName,
                  file_path: fileUrl,
                  storage_path: fallbackStoragePath,
                  file_size: imageBuffer.length,
                  file_type: 'image',
                  mime_type: generatedImageMimeType || 'image/png',
                  description: `AI ?ъ깮?? ${sourceFile.file_name}`,
                  prompt: req.stylePrompt,
                  created_by: finalCreatedBy,
                  source_file_id: sourceFile.id,
                  is_temp: true,
                  metadata: {
                    width: imageWidth,
                    height: imageHeight,
                    ...(req.styleId && { style_id: req.styleId }),
                    ...(req.styleKey && { style_key: req.styleKey }),
                    ...(req.styleName && { style_name: req.styleName }),
                  },
                })
                .select()
                .single();
              
              if (dbError || !fileData) {
                console.error(`[?대?吏 ?ъ깮??諛곗튂] DB ????ㅽ뙣 (?몃뜳??${req.index}):`, dbError);
                await supabase.storage.from('webtoon-files').remove([fallbackStoragePath]);
                return {
                  index: req.index,
                  imageData: generatedImageData,
                  mimeType: generatedImageMimeType || 'image/png',
                  apiProvider: 'seedream' as const,
                  fileId: '',
                  filePath: '',
                  fileUrl: '',
                  stylePrompt: req.stylePrompt,
                };
              }
              
              return {
                index: req.index,
                fileId: fileData.id,
                filePath: fallbackStoragePath,
                fileUrl: fileUrl,
                mimeType: generatedImageMimeType || 'image/png',
                apiProvider: 'seedream' as const,
                stylePrompt: req.stylePrompt,
                ...(req.styleId && { styleId: req.styleId }),
                ...(req.styleKey && { styleKey: req.styleKey }),
                ...(req.styleName && { styleName: req.styleName }),
              };
            }

            // ?뚯씪 URL ?앹꽦
            const { data: urlData } = supabase.storage
              .from('webtoon-files')
              .getPublicUrl(storagePath);
            const fileUrl = urlData.publicUrl;

            // ?대?吏 硫뷀??곗씠??異붿텧
            let imageWidth: number | undefined;
            let imageHeight: number | undefined;
            try {
              const metadata = await sharp(imageBuffer).metadata();
              imageWidth = metadata.width;
              imageHeight = metadata.height;
            } catch (error) {
              console.warn(`[?대?吏 ?ъ깮??諛곗튂] 硫뷀??곗씠??異붿텧 ?ㅽ뙣 (?몃뜳??${req.index}):`, error);
            }

            // DB???꾩떆 ?뚯씪 ?뺣낫 ???(is_temp = true)
            const finalCreatedBy = createdBy || sourceFile.created_by;
            console.log(`[?대?吏 ?ъ깮??諛곗튂] ?뚯씪 ???(?몃뜳??${req.index}, Seedream):`, {
              createdBy: createdBy || '?놁쓬 (?먮낯 ?뚯씪 ?앹꽦???ъ슜)',
              sourceCreatedBy: sourceFile.created_by,
              finalCreatedBy,
            });
            
            const { data: fileData, error: dbError } = await supabase
              .from('files')
              .insert({
                cut_id: sourceFile.cut_id,
                process_id: sourceFile.process_id,
                file_name: fileName,
                file_path: fileUrl,
                storage_path: storagePath,
                file_size: imageBuffer.length,
                file_type: 'image',
                mime_type: generatedImageMimeType || 'image/png',
                description: `AI ?ъ깮?? ${sourceFile.file_name}`,
                prompt: req.stylePrompt,
                created_by: finalCreatedBy,
                source_file_id: sourceFile.id,
                is_temp: true,
                metadata: {
                  width: imageWidth,
                  height: imageHeight,
                },
              })
              .select()
              .single();

            if (dbError || !fileData) {
              console.error(`[?대?吏 ?ъ깮??諛곗튂] DB ????ㅽ뙣 (?몃뜳??${req.index}):`, dbError);
              // Storage ?뚯씪? ??젣
              await supabase.storage.from('webtoon-files').remove([storagePath]);
              // ????ㅽ뙣 ??湲곗〈 諛⑹떇?쇰줈 fallback (base64 諛섑솚)
              return {
                index: req.index,
                imageData: generatedImageData,
                mimeType: generatedImageMimeType || 'image/png',
                apiProvider: 'seedream' as const,
                fileId: '',
                filePath: '',
                fileUrl: '',
                stylePrompt: req.stylePrompt,
              };
            }

            console.log(`[?대?吏 ?ъ깮??諛곗튂] ?꾩떆 ?뚯씪 ????꾨즺 (?몃뜳??${req.index}):`, {
              fileId: fileData.id,
              storagePath,
              fileUrl,
              size: imageBuffer.length,
            });

            return {
              index: req.index,
              fileId: fileData.id,
              filePath: storagePath,
              fileUrl: fileUrl,
              mimeType: generatedImageMimeType || 'image/png',
              apiProvider: 'seedream' as const,
              stylePrompt: req.stylePrompt,
              ...(req.styleId && { styleId: req.styleId }),
              ...(req.styleKey && { styleKey: req.styleKey }),
              ...(req.styleName && { styleName: req.styleName }),
            };
          } catch (error: unknown) {
            const errorDetails = extractErrorDetails(error);
            console.error(`[?대?吏 ?ъ깮??諛곗튂] Seedream API ?몄텧 ?ㅽ뙣 (?몃뜳??${req.index}):`, {
              errorDetails,
              requestIndex: req.index,
              promptLength: req.stylePrompt.length,
              promptPreview: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
            });
            throw error;
          }
        });

        const chunkResults = await Promise.allSettled(seedreamPromises);
        chunkResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            seedreamGroupResults.push(result.value);
          } else {
            console.error(`[?대?吏 ?ъ깮??諛곗튂] Seedream ?붿껌 ?ㅽ뙣:`, result.reason);
            // ?ㅽ뙣???붿껌??寃곌낵???ы븿 (?먮윭 ?뺣낫? ?④퍡)
            const failedRequest = chunk[index];
            if (failedRequest) {
              const errorInfo = categorizeError(result.reason, 'seedream');
              // ?먮윭 ?뺣낫 寃利?
              if (!errorInfo || !errorInfo.code || !errorInfo.message) {
                console.error(`[?대?吏 ?ъ깮??諛곗튂] categorizeError 諛섑솚媛믪씠 ?좏슚?섏? ?딆쓬 (?몃뜳??${failedRequest.index}):`, errorInfo);
                errorInfo.code = 'SEEDREAM_ERROR';
                errorInfo.message = '?대?吏 ?앹꽦 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.';
              }
              const errorResult: RegenerateImageBatchResponse['images'][0] = {
                index: failedRequest.index,
                apiProvider: 'seedream',
                stylePrompt: failedRequest.stylePrompt,
                ...(failedRequest.styleId && { styleId: failedRequest.styleId }),
                ...(failedRequest.styleKey && { styleKey: failedRequest.styleKey }),
                ...(failedRequest.styleName && { styleName: failedRequest.styleName }),
                error: {
                  code: errorInfo.code,
                  message: errorInfo.message,
                },
              };
              console.log(`[?대?吏 ?ъ깮??諛곗튂] Seedream ?먮윭 寃곌낵 ?앹꽦 (?몃뜳??${failedRequest.index}):`, {
                errorCode: errorResult.error?.code,
                errorMessage: errorResult.error?.message,
                fullResult: JSON.stringify(errorResult, null, 2),
              });
              seedreamGroupResults.push(errorResult);
            }
          }
        });
      }

      // ?깃났??寃껊쭔 移댁슫??(error媛 ?녿뒗 寃껊쭔)
      const seedreamSuccessCount = seedreamGroupResults.filter(r => !r.error).length;
      const seedreamFailCount = seedreamGroupResults.filter(r => !!r.error).length;
      console.log(`[?대?吏 ?ъ깮??諛곗튂] Seedream 洹몃９ 泥섎━ ?꾨즺: ${seedreamSuccessCount}媛??깃났, ${seedreamFailCount}媛??ㅽ뙣`);
      
      return seedreamGroupResults;
    };

    // Gemini? Seedream 洹몃９??蹂묐젹 泥섎━
    console.log('[?대?吏 ?ъ깮??諛곗튂] Gemini? Seedream 洹몃９ 蹂묐젹 泥섎━ ?쒖옉...');
    const [geminiResults, seedreamResults] = await Promise.all([
      processGeminiGroup().catch((error) => {
        console.error('[?대?吏 ?ъ깮??諛곗튂] Gemini 洹몃９ 泥섎━ ?ㅽ뙣:', error);
        return [];
      }),
      processSeedreamGroup().catch((error) => {
        console.error('[?대?吏 ?ъ깮??諛곗튂] Seedream 洹몃９ 泥섎━ ?ㅽ뙣:', error);
        return [];
      }),
    ]);

    // 寃곌낵 ?⑹튂湲?
    results.push(...geminiResults, ...seedreamResults);

    const totalTime = Date.now() - startTime;
    console.log('[?대?吏 ?ъ깮??諛곗튂] 諛곗튂 ?ъ깮???꾨즺:', {
      totalTime: `${totalTime}ms`,
      totalRequests: requests.length,
      successCount: results.length,
      failCount: requests.length - results.length,
      geminiCount: geminiRequests.length,
      seedreamCount: seedreamRequests.length,
    });
    
    // 理쒖쥌 寃곌낵 濡쒓퉭 (?먮윭 ?뺤씤??
    const resultsWithErrors = results.filter(r => r.error);
    if (resultsWithErrors.length > 0) {
      console.log('[?대?吏 ?ъ깮??諛곗튂] ?먮윭媛 ?ы븿??寃곌낵:', JSON.stringify(resultsWithErrors, null, 2));
    }

    return NextResponse.json({
      images: results,
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[?대?吏 ?ъ깮??諛곗튂] ?덉쇅 諛쒖깮:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`
    });
    const errorMessage = error instanceof Error ? error.message : '?대?吏 ?ъ깮??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.';
    return NextResponse.json(
      {
        error: errorMessage,
        details: {
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }
      },
      { status: 500 }
    );
  }
}

