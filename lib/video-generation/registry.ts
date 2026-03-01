import type { VideoProvider, ProviderCapabilities, InputMode } from './providers';

const providers = new Map<string, VideoProvider>();

export function registerProvider(provider: VideoProvider) {
  providers.set(provider.capabilities.id, provider);
}

export function getProvider(id: string): VideoProvider {
  const p = providers.get(id);
  if (!p) throw new Error(`Video provider not found: ${id}`);
  return p;
}

export function getAllProviders(): ProviderCapabilities[] {
  return Array.from(providers.values()).map((p) => p.capabilities);
}

export function getProvidersByMode(mode: InputMode): ProviderCapabilities[] {
  return getAllProviders().filter((c) => c.inputModes.includes(mode));
}

// 모든 프로바이더 자동 등록
export async function initProviders() {
  if (providers.size > 0) return;

  const { veoProvider } = await import('./providers/veo-provider');
  registerProvider(veoProvider);

  const { getFalProviders } = await import('./providers/fal-provider');
  for (const p of getFalProviders()) {
    registerProvider(p);
  }

  const { ltx2Provider } = await import('./providers/ltx2-provider');
  registerProvider(ltx2Provider);
}
