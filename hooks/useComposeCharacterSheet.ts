'use client';

import { useState, useRef, useCallback } from 'react';
import { ReferenceImage } from '@/app/api/compose-character-sheet/route';

export type ComposeStatus =
  | 'idle'
  | 'submitting'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

interface ResultImage {
  base64: string;
  mimeType: string;
}

interface ComposeState {
  status: ComposeStatus;
  requestId: string | null;
  resultImage: ResultImage | null;
  error: string | null;
  queuePosition: number | null;
}

const INITIAL_STATE: ComposeState = {
  status: 'idle',
  requestId: null,
  resultImage: null,
  error: null,
  queuePosition: null,
};

const POLL_INTERVAL_MS = 10_000; // 10초
const MAX_POLL_ATTEMPTS = 36;    // 최대 6분

export function useComposeCharacterSheet() {
  const [state, setState] = useState<ComposeState>(INITIAL_STATE);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    pollAttemptsRef.current = 0;
    isMountedRef.current = true;
    setState(INITIAL_STATE);
  }, [stopPolling]);

  // 상태 폴링
  const startPolling = useCallback((requestId: string) => {
    pollAttemptsRef.current = 0;

    const poll = async () => {
      if (!isMountedRef.current) return;
      if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        setState(prev => ({ ...prev, status: 'failed', error: '생성 시간이 초과되었습니다 (최대 6분).' }));
        return;
      }
      pollAttemptsRef.current++;

      try {
        const res = await fetch(
          `/api/compose-character-sheet/status?requestId=${encodeURIComponent(requestId)}`
        );
        const data = await res.json();

        if (!isMountedRef.current) return;

        if (data.status === 'COMPLETED') {
          stopPolling();
          setState(prev => ({
            ...prev,
            status: 'completed',
            resultImage: { base64: data.imageData, mimeType: data.mimeType },
            queuePosition: null,
          }));
        } else if (data.status === 'FAILED') {
          stopPolling();
          setState(prev => ({
            ...prev,
            status: 'failed',
            error: data.error || '생성에 실패했습니다.',
          }));
        } else if (data.status === 'IN_QUEUE') {
          setState(prev => ({
            ...prev,
            status: 'queued',
            queuePosition: data.queuePosition,
          }));
          pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          // IN_PROGRESS
          setState(prev => ({ ...prev, status: 'processing', queuePosition: null }));
          pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error('[useComposeCharacterSheet] 폴링 오류:', err);
        pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
  }, [stopPolling]);

  // 최초 생성
  const compose = useCallback(async (params: {
    baseSheetUrl: string;
    outfitImages: ReferenceImage[];
    propImages: ReferenceImage[];
    globalInstruction?: string;
  }) => {
    stopPolling();
    pollAttemptsRef.current = 0;
    isMountedRef.current = true;

    setState({ status: 'submitting', requestId: null, resultImage: null, error: null, queuePosition: null });

    try {
      const res = await fetch('/api/compose-character-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();

      if (!isMountedRef.current) return;

      if (!res.ok) {
        setState(prev => ({ ...prev, status: 'failed', error: data.error || '요청 실패' }));
        return;
      }

      const { requestId } = data;
      setState(prev => ({ ...prev, status: 'queued', requestId }));
      startPolling(requestId);
    } catch (err) {
      if (!isMountedRef.current) return;
      setState(prev => ({ ...prev, status: 'failed', error: '서버에 연결할 수 없습니다.' }));
    }
  }, [stopPolling, startPolling]);

  // 부분 수정
  const refine = useCallback(async (params: {
    previousImageBase64: string;
    previousImageMimeType: string;
    refinementInstruction: string;
  }) => {
    stopPolling();
    pollAttemptsRef.current = 0;

    setState(prev => ({
      ...prev,
      status: 'submitting',
      requestId: null,
      error: null,
      queuePosition: null,
      // resultImage는 유지 (결과 패널에 이전 이미지 표시)
    }));

    try {
      const res = await fetch('/api/compose-character-sheet/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();

      if (!isMountedRef.current) return;

      if (!res.ok) {
        setState(prev => ({ ...prev, status: 'failed', error: data.error || '수정 요청 실패' }));
        return;
      }

      const { requestId } = data;
      setState(prev => ({ ...prev, status: 'queued', requestId }));
      startPolling(requestId);
    } catch (err) {
      if (!isMountedRef.current) return;
      setState(prev => ({ ...prev, status: 'failed', error: '서버에 연결할 수 없습니다.' }));
    }
  }, [stopPolling, startPolling]);

  return {
    ...state,
    isLoading: state.status === 'submitting' || state.status === 'queued' || state.status === 'processing',
    compose,
    refine,
    reset,
    _isMountedRef: isMountedRef,
  };
}
