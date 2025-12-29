'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { type ApiProvider } from '@/lib/supabase';

type ImageModel = ApiProvider;

interface ImageModelContextValue {
  model: ImageModel;
  setModel: (model: ImageModel) => void;
}

const IMAGE_MODEL_STORAGE_KEY = 'image-model';

const ImageModelContext = createContext<ImageModelContextValue | undefined>(undefined);

const getInitialModel = (): ImageModel => {
  if (typeof window === 'undefined') {
    return 'gemini';
  }
  const stored = window.localStorage.getItem(IMAGE_MODEL_STORAGE_KEY);
  if (stored === 'seedream' || stored === 'auto') {
    return stored;
  }
  return 'gemini';
};

export function ImageModelProvider({ children }: { children: React.ReactNode }) {
  const [model, setModelState] = useState<ImageModel>(() => getInitialModel());

  const setModel = useCallback((nextModel: ImageModel) => {
    setModelState(nextModel);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, nextModel);
    }
  }, []);

  const value = useMemo(() => ({ model, setModel }), [model, setModel]);

  return (
    <ImageModelContext.Provider value={value}>
      {children}
    </ImageModelContext.Provider>
  );
}

export function useImageModel() {
  const context = useContext(ImageModelContext);
  if (!context) {
    throw new Error('useImageModel는 ImageModelProvider 안에서만 사용할 수 있습니다.');
  }
  return context;
}






