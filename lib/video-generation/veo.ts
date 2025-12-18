import { GoogleGenAI } from '@google/genai';
import type { VeoRequest, VeoResult } from './types';
import { delay, isRetryableNetworkError, retryAsync } from '../image-generation/utils';

const DEFAULT_VEO_MODEL = 'veo-3.1-fast-generate-preview';
const DEFAULT_VEO_TIMEOUT = 600000; // 10 minutes
const DEFAULT_POLL_INTERVAL = 10000; // 10 seconds

// 영상 생성용 별도 API Key (하드코딩 또는 환경변수)
// TODO: 실제 API key로 교체하세요
const VEO_API_KEY = process.env.GEMINI_API_KEY;

function isRetryableVeoError(error: unknown): boolean {
  if (isRetryableNetworkError(error)) return true;
  if (error instanceof Error) {
    if (error.message.includes('INTERNAL')) return true;
    if (error.message.includes('Request timeout')) return true;
    if (error.message.includes('RESOURCE_EXHAUSTED')) return true;
  }
  return false;
}

export async function generateVeoVideo(request: VeoRequest): Promise<VeoResult> {
  const {
    apiKey = VEO_API_KEY, // 영상 생성용 별도 API Key 사용
    model = DEFAULT_VEO_MODEL,
    prompt,
    startImageBase64,
    startImageMimeType = 'image/png',
    endImageBase64,
    endImageMimeType = 'image/png',
    config,
    timeoutMs = DEFAULT_VEO_TIMEOUT,
    pollIntervalMs = DEFAULT_POLL_INTERVAL,
  } = request;

  if (!apiKey || apiKey === 'YOUR_VEO_API_KEY_HERE') {
    throw new Error('VEO_API_KEY가 설정되지 않았습니다. lib/video-generation/veo.ts에서 API key를 설정하세요.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const startedAt = Date.now();

  console.log('[video-generation][veo] start', {
    model,
    timeoutMs,
    pollIntervalMs,
    hasStartImage: !!startImageBase64,
    hasEndImage: !!endImageBase64,
    promptLength: prompt.length,
    aspectRatio: config?.aspectRatio || '9:16',
  });

  // Veo API 요청 파라미터 구성
  // lastFrame은 config 안에 포함되어야 함 (JS SDK 문서 참조)
  // Veo 3.x는 durationSeconds: 4, 6, 8만 지원
  const videoConfig: Record<string, unknown> = {
    numberOfVideos: config?.numberOfVideos ?? 1,
    resolution: '720p', // Veo 3 필수
    aspectRatio: config?.aspectRatio ?? '9:16',
  };

  // 끝 이미지가 있으면 config.lastFrame에 추가
  if (endImageBase64) {
    videoConfig.lastFrame = {
      imageBytes: endImageBase64,
      mimeType: endImageMimeType,
    };
    console.log('[video-generation][veo] config.lastFrame 설정됨, 크기:', endImageBase64.length);
  }

  const generateParams: Record<string, unknown> = {
    model,
    prompt,
    config: videoConfig,
  };

  // 시작 이미지가 있으면 추가 (첫 프레임)
  if (startImageBase64) {
    generateParams.image = {
      imageBytes: startImageBase64,
      mimeType: startImageMimeType,
    };
  }

  // 전체 파라미터 로깅 (이미지 데이터 제외)
  console.log('[video-generation][veo] generateParams:', JSON.stringify({
    model: generateParams.model,
    promptLength: (generateParams.prompt as string).length,
    config: {
      ...videoConfig,
      hasLastFrame: !!videoConfig.lastFrame,
    },
    hasImage: !!generateParams.image,
  }, null, 2));

  const videoBase64 = await retryAsync(
    async (attempt) => {
      if (attempt > 0) {
        console.log(`[video-generation][veo] retry ${attempt}/2`);
      }

      // 영상 생성 작업 시작
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let operation = await (ai.models as any).generateVideos(generateParams);

      // 폴링으로 완료 대기
      const maxPollTime = startedAt + timeoutMs;
      while (!operation.done) {
        if (Date.now() > maxPollTime) {
          throw new Error(`Veo API timeout after ${timeoutMs}ms`);
        }

        console.log('[video-generation][veo] polling...', {
          elapsedMs: Date.now() - startedAt,
        });

        await delay(pollIntervalMs);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        operation = await (ai.operations as any).getVideosOperation({ operation });
      }

      // 에러 확인
      if (operation.error) {
        console.error('[video-generation][veo] operation error:', JSON.stringify(operation.error, null, 2));
        throw new Error(operation.error.message || 'Veo video generation failed');
      }

      // 응답 구조 로깅
      console.log('[video-generation][veo] operation done, extracting video...');

      // 결과 추출 - URI 또는 videoBytes
      const video = operation.response?.generatedVideos?.[0]?.video;
      
      if (!video) {
        console.error('[video-generation][veo] 전체 응답 구조:', JSON.stringify(operation, null, 2).slice(0, 2000));
        throw new Error('Veo 응답에서 비디오를 찾지 못했습니다.');
      }

      // videoBytes가 있으면 직접 사용
      if (video.videoBytes) {
        console.log('[video-generation][veo] videoBytes 직접 반환');
        return video.videoBytes as string;
      }

      // URI가 있으면 다운로드
      if (video.uri) {
        console.log('[video-generation][veo] URI에서 비디오 다운로드:', video.uri.slice(0, 100));
        
        // URI에 API key 추가
        const downloadUrl = video.uri.includes('?') 
          ? `${video.uri}&key=${apiKey}`
          : `${video.uri}?key=${apiKey}`;
        
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`비디오 다운로드 실패: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        console.log('[video-generation][veo] 비디오 다운로드 완료, 크기:', arrayBuffer.byteLength);
        
        return base64;
      }

      throw new Error('Veo 응답에서 videoBytes 또는 uri를 찾지 못했습니다.');
    },
    2,
    isRetryableVeoError
  );

  const elapsedMs = Date.now() - startedAt;

  console.log('[video-generation][veo] success', {
    model,
    elapsedMs,
    videoBase64Length: videoBase64.length,
  });

  return {
    videoBase64,
    mimeType: 'video/mp4',
    model,
    elapsedMs,
  };
}
