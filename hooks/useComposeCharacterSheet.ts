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

export function useComposeCharacterSheet() {
  const [state, setState] = useState<ComposeState>(INITIAL_STATE);
  const isMountedRef = useRef(true);

  const reset = useCallback(() => {
    isMountedRef.current = true;
    setState(INITIAL_STATE);
  }, []);

  const compose = useCallback(async (params: {
    baseSheetUrl: string;
    outfitImages: ReferenceImage[];
    propImages: ReferenceImage[];
    globalInstruction?: string;
  }) => {
    isMountedRef.current = true;
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
      setState({ status: 'completed', resultImage: { base64: data.imageData, mimeType: data.mimeType }, error: null });
    } catch {
      if (!isMountedRef.current) return;
      setState({ status: 'failed', resultImage: null, error: '서버에 연결할 수 없습니다.' });
    }
  }, []);

  const refine = useCallback(async (params: {
    previousImageBase64: string;
    previousImageMimeType: string;
    refinementInstruction: string;
  }) => {
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
      setState({ status: 'completed', resultImage: { base64: data.imageData, mimeType: data.mimeType }, error: null });
    } catch {
      if (!isMountedRef.current) return;
      setState(prev => ({ ...prev, status: 'failed', error: '서버에 연결할 수 없습니다.' }));
    }
  }, []);

  return {
    ...state,
    isLoading: state.status === 'submitting',
    queuePosition: null as null,   // 하위 호환
    compose,
    refine,
    reset,
    _isMountedRef: isMountedRef,
  };
}
