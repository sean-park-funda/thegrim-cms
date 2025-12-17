export function getRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10000);
}

export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('timeout');
  }
  return false;
}

export function isRetryableNetworkError(error: unknown): boolean {
  if (isTimeoutError(error)) return true;
  if (error instanceof Error && error.message.includes('ECONNRESET')) return true;
  if (typeof error === 'object' && error && 'status' in error && typeof (error as any).status === 'number') {
    const status = (error as any).status as number;
    return status >= 500;
  }
  return false;
}

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (isTimeoutError(error)) {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

export async function retryAsync<T>(
  task: (attempt: number) => Promise<T>,
  retries: number,
  isRetryable: (error: unknown) => boolean = isRetryableNetworkError
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < retries && isRetryable(error);
      if (!canRetry) {
        throw error;
      }
      await delay(getRetryDelay(attempt));
    }
  }
  throw lastError ?? new Error('Unknown error');
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}
