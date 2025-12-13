# SAM3D API 사용 가이드 (프론트엔드)

TheGrim CMS API의 SAM3D 이미지→GLB 변환 서비스를 프론트엔드에서 사용하는 방법입니다.

## Base URL

```
https://api.rewardpang.com/thegrim-cms
```

---

## API 엔드포인트

### 1. 헬스 체크

서버 상태 확인용 엔드포인트입니다.

**요청:**
```http
GET /thegrim-cms/sam3d/health
```

**응답:**
```json
{
  "status": "ok",
  "proxy": "lightsail",
  "sam3d_server": {
    "status": "ok",
    "service": "sam3d-body-api"
  }
}
```

### 2. 이미지 → GLB 변환

이미지 파일을 업로드하여 GLB 파일로 변환합니다.

**요청:**
```http
POST /thegrim-cms/sam3d/image-to-glb
Content-Type: multipart/form-data

Body:
  file: [이미지 파일]
```

**응답:**
- Content-Type: `application/octet-stream`
- Content-Disposition: `attachment; filename=output.glb`
- Body: GLB 파일 바이너리 데이터

**에러 응답:**
```json
{
  "detail": "에러 메시지"
}
```

---

## JavaScript/TypeScript 예시

### TypeScript 타입 정의

```typescript
// types/sam3d.ts

export interface SAM3DHealthResponse {
  status: 'ok' | 'error' | 'timeout';
  proxy: string;
  sam3d_server: {
    status: string;
    service?: string;
    error?: string;
  };
}

export interface SAM3DErrorResponse {
  detail: string;
}
```

### 기본 클래스 구현

```typescript
// services/sam3dService.ts

const BASE_URL = 'https://api.rewardpang.com/thegrim-cms';

export class SAM3DService {
  /**
   * SAM3D 서버 상태 확인
   */
  static async checkHealth(): Promise<SAM3DHealthResponse> {
    try {
      const response = await fetch(`${BASE_URL}/sam3d/health`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: SAM3DHealthResponse = await response.json();
      return data;
    } catch (error) {
      console.error('SAM3D 헬스 체크 실패:', error);
      throw error;
    }
  }

  /**
   * 이미지를 GLB 파일로 변환
   * @param imageFile 이미지 파일 (File 객체)
   * @returns GLB 파일 Blob
   */
  static async convertImageToGLB(
    imageFile: File,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    try {
      // 파일 유효성 검사
      if (!imageFile.type.startsWith('image/')) {
        throw new Error('이미지 파일만 업로드 가능합니다.');
      }

      // FormData 생성
      const formData = new FormData();
      formData.append('file', imageFile);

      // 요청 전송
      const response = await fetch(`${BASE_URL}/sam3d/image-to-glb`, {
        method: 'POST',
        body: formData,
        // fetch는 자동으로 Content-Type을 multipart/form-data로 설정하고 boundary를 추가합니다
      });

      // 에러 처리
      if (!response.ok) {
        const errorData: SAM3DErrorResponse = await response.json().catch(() => ({
          detail: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw new Error(errorData.detail || `변환 실패: ${response.statusText}`);
      }

      // GLB 파일 Blob 반환
      const blob = await response.blob();
      return blob;
    } catch (error) {
      console.error('이미지 변환 실패:', error);
      throw error;
    }
  }

  /**
   * GLB 파일을 다운로드
   * @param blob GLB 파일 Blob
   * @param filename 다운로드할 파일명 (기본값: output.glb)
   */
  static downloadGLB(blob: Blob, filename: string = 'output.glb'): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
```

---

## React 예시

### React Hook (커스텀 훅)

```typescript
// hooks/useSAM3D.ts

import { useState, useCallback } from 'react';
import { SAM3DService } from '../services/sam3dService';

interface UseSAM3DResult {
  isConverting: boolean;
  error: string | null;
  convertImage: (file: File) => Promise<Blob | null>;
  checkHealth: () => Promise<boolean>;
}

export function useSAM3D(): UseSAM3DResult {
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convertImage = useCallback(async (file: File): Promise<Blob | null> => {
    setIsConverting(true);
    setError(null);

    try {
      const glbBlob = await SAM3DService.convertImageToGLB(file);
      return glbBlob;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setError(errorMessage);
      return null;
    } finally {
      setIsConverting(false);
    }
  }, []);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const health = await SAM3DService.checkHealth();
      return health.status === 'ok' && health.sam3d_server.status === 'ok';
    } catch (err) {
      console.error('헬스 체크 실패:', err);
      return false;
    }
  }, []);

  return {
    isConverting,
    error,
    convertImage,
    checkHealth,
  };
}
```

### React 컴포넌트 예시

```tsx
// components/ImageToGLBConverter.tsx

import React, { useState, useRef } from 'react';
import { useSAM3D } from '../hooks/useSAM3D';
import { SAM3DService } from '../services/sam3dService';

export function ImageToGLBConverter() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isConverting, error, convertImage, checkHealth } = useSAM3D();

  // 파일 선택 핸들러
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      
      // 미리보기 생성
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 변환 실행
  const handleConvert = async () => {
    if (!selectedFile) return;

    try {
      const glbBlob = await convertImage(selectedFile);
      
      if (glbBlob) {
        // GLB 파일 다운로드
        SAM3DService.downloadGLB(glbBlob, `converted-${Date.now()}.glb`);
        alert('GLB 파일 변환이 완료되었습니다!');
      }
    } catch (err) {
      console.error('변환 중 오류:', err);
    }
  };

  // 헬스 체크
  const handleHealthCheck = async () => {
    const isHealthy = await checkHealth();
    alert(isHealthy ? '서버 상태 정상' : '서버 상태 확인 실패');
  };

  return (
    <div className="image-to-glb-converter">
      <h2>이미지 → GLB 변환</h2>
      
      {/* 헬스 체크 버튼 */}
      <button onClick={handleHealthCheck} disabled={isConverting}>
        서버 상태 확인
      </button>

      {/* 파일 선택 */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={isConverting}
        />
      </div>

      {/* 미리보기 */}
      {previewUrl && (
        <div>
          <img src={previewUrl} alt="미리보기" style={{ maxWidth: '300px' }} />
        </div>
      )}

      {/* 선택된 파일 정보 */}
      {selectedFile && (
        <div>
          <p>파일명: {selectedFile.name}</p>
          <p>크기: {(selectedFile.size / 1024).toFixed(2)} KB</p>
          <p>타입: {selectedFile.type}</p>
        </div>
      )}

      {/* 변환 버튼 */}
      <button
        onClick={handleConvert}
        disabled={!selectedFile || isConverting}
      >
        {isConverting ? '변환 중...' : 'GLB로 변환'}
      </button>

      {/* 에러 메시지 */}
      {error && (
        <div style={{ color: 'red' }}>
          오류: {error}
        </div>
      )}
    </div>
  );
}
```

---

## Vue.js 예시

### Vue 컴포넌트

```vue
<!-- components/ImageToGLBConverter.vue -->

<template>
  <div class="image-to-glb-converter">
    <h2>이미지 → GLB 변환</h2>

    <!-- 헬스 체크 버튼 -->
    <button @click="handleHealthCheck" :disabled="isConverting">
      서버 상태 확인
    </button>

    <!-- 파일 선택 -->
    <div>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        @change="handleFileSelect"
        :disabled="isConverting"
      />
    </div>

    <!-- 미리보기 -->
    <div v-if="previewUrl">
      <img :src="previewUrl" alt="미리보기" style="max-width: 300px" />
    </div>

    <!-- 선택된 파일 정보 -->
    <div v-if="selectedFile">
      <p>파일명: {{ selectedFile.name }}</p>
      <p>크기: {{ (selectedFile.size / 1024).toFixed(2) }} KB</p>
      <p>타입: {{ selectedFile.type }}</p>
    </div>

    <!-- 변환 버튼 -->
    <button
      @click="handleConvert"
      :disabled="!selectedFile || isConverting"
    >
      {{ isConverting ? '변환 중...' : 'GLB로 변환' }}
    </button>

    <!-- 에러 메시지 -->
    <div v-if="error" style="color: red">
      오류: {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { SAM3DService } from '../services/sam3dService';

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const isConverting = ref(false);
const error = ref<string | null>(null);

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (file) {
    selectedFile.value = file;
    
    // 미리보기 생성
    const reader = new FileReader();
    reader.onloadend = () => {
      previewUrl.value = reader.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const handleConvert = async () => {
  if (!selectedFile.value) return;

  isConverting.value = true;
  error.value = null;

  try {
    const glbBlob = await SAM3DService.convertImageToGLB(selectedFile.value);
    
    if (glbBlob) {
      SAM3DService.downloadGLB(glbBlob, `converted-${Date.now()}.glb`);
      alert('GLB 파일 변환이 완료되었습니다!');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
    console.error('변환 중 오류:', err);
  } finally {
    isConverting.value = false;
  }
};

const handleHealthCheck = async () => {
  try {
    const health = await SAM3DService.checkHealth();
    const isHealthy = health.status === 'ok' && health.sam3d_server.status === 'ok';
    alert(isHealthy ? '서버 상태 정상' : '서버 상태 확인 실패');
  } catch (err) {
    console.error('헬스 체크 실패:', err);
    alert('서버 상태 확인 실패');
  }
};
</script>
```

---

## 순수 JavaScript 예시

```javascript
// sam3d.js

const BASE_URL = 'https://api.rewardpang.com/thegrim-cms';

/**
 * SAM3D 서버 상태 확인
 */
async function checkSAM3DHealth() {
  try {
    const response = await fetch(`${BASE_URL}/sam3d/health`);
    const data = await response.json();
    
    console.log('서버 상태:', data);
    return data.status === 'ok' && data.sam3d_server.status === 'ok';
  } catch (error) {
    console.error('헬스 체크 실패:', error);
    return false;
  }
}

/**
 * 이미지를 GLB로 변환
 */
async function convertImageToGLB(imageFile) {
  try {
    // 파일 유효성 검사
    if (!imageFile.type.startsWith('image/')) {
      throw new Error('이미지 파일만 업로드 가능합니다.');
    }

    // FormData 생성
    const formData = new FormData();
    formData.append('file', imageFile);

    // 요청 전송
    const response = await fetch(`${BASE_URL}/sam3d/image-to-glb`, {
      method: 'POST',
      body: formData,
    });

    // 에러 처리
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        detail: `HTTP ${response.status}: ${response.statusText}`,
      }));
      throw new Error(errorData.detail || '변환 실패');
    }

    // GLB 파일 Blob 반환
    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error('이미지 변환 실패:', error);
    throw error;
  }
}

/**
 * GLB 파일 다운로드
 */
function downloadGLB(blob, filename = 'output.glb') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 사용 예시
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('imageInput');
  const convertButton = document.getElementById('convertButton');
  const healthButton = document.getElementById('healthButton');

  // 헬스 체크
  healthButton?.addEventListener('click', async () => {
    const isHealthy = await checkSAM3DHealth();
    alert(isHealthy ? '서버 상태 정상' : '서버 상태 확인 실패');
  });

  // 변환 실행
  convertButton?.addEventListener('click', async () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      alert('파일을 선택해주세요.');
      return;
    }

    try {
      convertButton.disabled = true;
      convertButton.textContent = '변환 중...';

      const glbBlob = await convertImageToGLB(file);
      downloadGLB(glbBlob, `converted-${Date.now()}.glb`);
      alert('GLB 파일 변환이 완료되었습니다!');
    } catch (error) {
      alert(`오류: ${error.message}`);
    } finally {
      convertButton.disabled = false;
      convertButton.textContent = 'GLB로 변환';
    }
  });
});
```

---

## 에러 처리

### 주요 에러 케이스

1. **400 Bad Request**
   - 이미지 파일이 아닌 경우
   - 빈 파일인 경우

2. **504 Gateway Timeout**
   - 이미지 처리 시간이 120초를 초과한 경우

3. **500 Internal Server Error**
   - 서버 내부 오류
   - SAM3D 서버 연결 실패

### 에러 처리 예시

```typescript
try {
  const glbBlob = await SAM3DService.convertImageToGLB(imageFile);
  // 성공 처리
} catch (error) {
  if (error.message.includes('타임아웃')) {
    alert('처리 시간이 너무 오래 걸렸습니다. 이미지 크기를 줄여서 다시 시도해주세요.');
  } else if (error.message.includes('이미지 파일이 아닙니다')) {
    alert('이미지 파일만 업로드 가능합니다.');
  } else {
    alert(`오류가 발생했습니다: ${error.message}`);
  }
}
```

---

## 주의사항

1. **파일 크기 제한**
   - 큰 이미지는 처리 시간이 오래 걸릴 수 있습니다.
   - 타임아웃은 120초입니다.

2. **CORS 설정**
   - Nginx에서 CORS 헤더가 설정되어 있지만, 브라우저에서 직접 요청할 때는 확인이 필요합니다.

3. **파일 형식**
   - 지원 이미지 형식: JPEG, PNG 등 일반적인 이미지 형식
   - 변환 결과는 항상 GLB 파일입니다.

4. **다운로드**
   - GLB 파일은 자동으로 다운로드됩니다.
   - 파일명을 지정하여 다운로드할 수 있습니다.

---

## 테스트

### cURL 예시

```bash
# 헬스 체크
curl https://api.rewardpang.com/thegrim-cms/sam3d/health

# 이미지 변환
curl -X POST \
  https://api.rewardpang.com/thegrim-cms/sam3d/image-to-glb \
  -F "file=@test_image.jpg" \
  --output output.glb
```

### Swagger UI

API 문서는 다음 URL에서 확인할 수 있습니다:
```
https://api.rewardpang.com/thegrim-cms/docs
```

