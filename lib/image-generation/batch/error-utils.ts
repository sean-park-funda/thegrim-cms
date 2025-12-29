import type { ImageProvider } from '../types';

/**
 * 에러 객체의 상세 정보를 추출하는 헬퍼 함수
 */
export function extractErrorDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {};

  if (error instanceof Error) {
    details.name = error.name;
    
    // message가 JSON 문자열인 경우 파싱 시도
    let parsedMessage: unknown = error.message;
    if (typeof error.message === 'string') {
      try {
        // JSON 문자열인지 확인하고 파싱 시도
        const trimmed = error.message.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          parsedMessage = JSON.parse(error.message);
        }
      } catch {
        // 파싱 실패 시 원본 메시지 사용
        parsedMessage = error.message;
      }
    }
    details.message = parsedMessage;
    details.stack = error.stack;

    // cause 속성이 있으면 재귀적으로 추출
    if (error.cause) {
      details.cause = extractErrorDetails(error.cause);
    }

    // Error 객체의 추가 속성들 추출 (타입 단언을 통해 접근)
    const errorObj = error as unknown as Record<string, unknown>;
    Object.keys(errorObj).forEach(key => {
      if (!['name', 'message', 'stack', 'cause'].includes(key)) {
        try {
          // 직렬화 가능한 값만 포함
          JSON.stringify(errorObj[key]);
          details[key] = errorObj[key];
        } catch {
          // 직렬화 불가능한 값은 문자열로 변환
          details[key] = String(errorObj[key]);
        }
      }
    });
  } else if (typeof error === 'object' && error !== null) {
    // Error 객체가 아닌 경우 모든 속성 추출
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

/**
 * 에러 타입과 사용자 메시지를 구분하는 함수
 */
export function categorizeError(error: unknown, provider: ImageProvider): { code: string; message: string } {
  if (error instanceof Error) {
    // 타임아웃 에러
    if (error.message.toLowerCase().includes('timeout')) {
      return {
        code: provider === 'gemini' ? 'GEMINI_TIMEOUT' : 'SEEDREAM_TIMEOUT',
        message: `${provider === 'gemini' ? 'Gemini' : 'Seedream'} API 요청이 시간 초과되었습니다. 잠시 후 다시 시도해주세요.`,
      };
    }

    // ApiError인 경우 status 확인
    const errorObj = error as unknown as Record<string, unknown>;
    if ('status' in errorObj && typeof errorObj.status === 'number') {
      const status = errorObj.status;
      
      // 503 Service Unavailable (오버로드)
      if (status === 503) {
        // 메시지에 "overloaded" 포함 여부 확인
        const errorMessage = String(error.message || '');
        if (errorMessage.toLowerCase().includes('overload') || errorMessage.toLowerCase().includes('overloaded')) {
          return {
            code: provider === 'gemini' ? 'GEMINI_OVERLOAD' : 'SEEDREAM_OVERLOAD',
            message: `${provider === 'gemini' ? 'Gemini' : 'Seedream'} 서비스가 현재 과부하 상태입니다. 잠시 후 다시 시도해주세요.`,
          };
        }
        return {
          code: provider === 'gemini' ? 'GEMINI_SERVICE_UNAVAILABLE' : 'SEEDREAM_SERVICE_UNAVAILABLE',
          message: `${provider === 'gemini' ? 'Gemini' : 'Seedream'} 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.`,
        };
      }

      // 429 Too Many Requests
      if (status === 429) {
        return {
          code: provider === 'gemini' ? 'GEMINI_RATE_LIMIT' : 'SEEDREAM_RATE_LIMIT',
          message: `요청이 너무 많습니다. 잠시 후 다시 시도해주세요.`,
        };
      }
    }
  }

  // 기타 에러
  return {
    code: provider === 'gemini' ? 'GEMINI_ERROR' : 'SEEDREAM_ERROR',
    message: `이미지 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`,
  };
}






