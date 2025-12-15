const BASE_URL = 'https://api.rewardpang.com/thegrim-cms';

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
  static async convertImageToGLB(imageFile: File): Promise<Blob> {
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
}

