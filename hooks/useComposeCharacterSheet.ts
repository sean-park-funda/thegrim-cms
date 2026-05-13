'use client';

import { useState, useRef, useCallback } from 'react';
import type { ReferenceImage } from '@/lib/types/compose';

export type ComposeStatus = 'idle' | 'submitting' | 'completed' | 'failed';

interface ResultImage { base64: string; mimeType: string; }

interface ComposeState {
  status: ComposeStatus;
  resultImage: ResultImage | null;
  error: string | null;
}

const INITIAL_STATE: ComposeState = { status: 'idle', resultImage: null, error: null };

const POLL_INTERVAL = 3000;

export function useComposeCharacterSheet() {
  const [state, setState] = useState<ComposeState>(INITIAL_STATE);
  const isMountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    isMountedRef.current = true;
    stopPolling();
    setState(INITIAL_STATE);
  }, [stopPolling]);

  const pollStatus = useCallback((requestId: string) => {
    const tick = async () => {
      if (!isMountedRef.current) return;
      try {
        const res = await fetch(`/api/compose-character-sheet/status?requestId=${requestId}`);
        const data = await res.json();
        if (!isMountedRef.current) return;

        if (!res.ok || data.status === 'FAILED') {
          setState({ status: 'failed', resultImage: null, error: data.error || '생성 실패' });
          return;
        }
        if (data.status === 'COMPLETED') {
          setState({ status: 'completed', resultImage: { base64: data.imageData, mimeType: data.mimeType }, error: null });
          return;
        }
        // IN_QUEUE or IN_PROGRESS — 계속 폴링
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL);
      } catch {
        if (!isMountedRef.current) return;
        setState({ status: 'failed', resultImage: null, error: '서버에 연결할 수 없습니다.' });
      }
    };
    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL);
  }, []);

  const compose = useCallback(async (params: {
    baseSheetUrl: string;
    outfitImages: ReferenceImage[];
    propImages: ReferenceImage[];
    globalInstruction?: string;
  }) => {
    isMountedRef.current = true;
    stopPolling();
    setState({ status: 'submitting', resultImage: null, error: null });

    try {
      const res = await fetch('/api/compose-character-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!isMountedRef.current) return;

      if (!res.ok) {
        setState({ status: 'failed', resultImage: null, error: data.error || '요청 실패' });
        return;
      }
      // requestId 수신 → 폴링 시작
      pollStatus(data.requestId);
    } catch {
      if (!isMountedRef.current) return;
      setState({ status: 'failed', resultImage: null, error: '서버에 연결할 수 없습니다.' });
    }
  }, [stopPolling, pollStatus]);

  const refine = useCallback(async (params: {
    previousImageBase64: string;
    previousImageMimeType: string;
    refinementInstruction: string;
  }) => {
    stopPolling();
    setState(prev => ({ ...prev, status: 'submitting', error: null }));

    try {
      const res = await fetch('/api/compose-character-sheet/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!isMountedRef.current) return;

      if (!res.ok) {
        setState(prev => ({ ...prev, status: 'failed', error: data.error || '수정 실패' }));
        return;
      }
      pollStatus(data.requestId);
    } catch {
      if (!isMountedRef.current) return;
      setState(prev => ({ ...prev, status: 'failed', error: '서버에 연결할 수 없습니다.' }));
    }
  }, [stopPolling, pollStatus]);

  return {
    ...state,
    isLoading: state.status === 'submitting',
    queuePosition: null as null,
    compose,
    refine,
    reset,
    _isMountedRef: isMountedRef,
  };
}
