# FileGrid 컴포넌트 리팩토링 가이드

## 📋 개요

FileGrid 컴포넌트는 약 1842줄의 대규모 컴포넌트였으나, 유지보수성과 재사용성을 높이기 위해 여러 작은 컴포넌트와 커스텀 훅으로 분리되었습니다.

**리팩토링 완료일**: 2025-01-08  
**리팩토링 전**: 약 1842줄  
**리팩토링 후**: 약 488줄 (약 73% 감소)

---

## 🎯 리팩토링 목표

1. **코드 가독성 향상**: 큰 컴포넌트를 작은 단위로 분리
2. **재사용성 향상**: 공통 로직을 커스텀 훅으로 추출
3. **유지보수성 향상**: 각 기능별로 독립적인 파일로 관리
4. **테스트 용이성**: 작은 단위로 분리하여 테스트 작성 용이

---

## 📁 새로운 파일 구조

### 1. 상수 분리

#### `lib/constants/imageRegeneration.ts`
- 이미지 재생성 관련 상수 및 유틸리티 함수
- **내용**:
  - `styleOptions`: 스타일 옵션 배열
  - `berserkVariationKeywords`: 베르세르크 스타일 변형 키워드
  - `generateVariedPrompt()`: 프롬프트 변형 생성 함수

```typescript
import { styleOptions, generateVariedPrompt } from '@/lib/constants/imageRegeneration';
```

---

### 2. 커스텀 훅 분리

#### `lib/hooks/useFileGrid.ts`
- 파일 그리드 관련 상태 및 로직 관리
- **기능**:
  - 파일 목록 로드
  - 썸네일 URL 관리
  - 이미지 에러 처리
  - 공정별 파일 필터링

**반환값**:
```typescript
{
  files: FileType[];
  loading: boolean;
  thumbnailUrls: Record<string, string>;
  imageErrors: Set<string>;
  pendingAnalysisFiles: Set<string>;
  setThumbnailUrl: (fileId: string, url: string) => void;
  loadFiles: () => Promise<void>;
  getFilesByProcess: (processId: string) => FileType[];
}
```

#### `lib/hooks/useImageRegeneration.ts`
- 이미지 재생성 관련 상태 및 로직 관리
- **기능**:
  - 이미지 재생성 API 호출
  - 재생성된 이미지 관리
  - 선택된 이미지 관리
  - 재생성된 이미지 저장

**반환값**:
```typescript
{
  regeneratingImage: string | null;
  regeneratedImages: RegeneratedImage[];
  selectedImageIds: Set<string>;
  handleRegenerate: (stylePrompt: string, count?: number) => Promise<void>;
  handleSaveImages: () => Promise<void>;
  handleImageSelect: (id: string, selected: boolean) => void;
}
```

#### `lib/hooks/useImageViewer.ts`
- 이미지 뷰어 관련 상태 및 로직 관리
- **기능**:
  - 이미지 줌 관리 (25% ~ 400%)
  - 이미지 위치 관리 (드래그)
  - 터치 이벤트 처리 (핀치 줌, 드래그)
  - 뷰 리셋

**반환값**:
```typescript
{
  imageZoom: number;
  imagePosition: { x: number; y: number };
  isDragging: boolean;
  isPinching: boolean;
  setImageZoom: (zoom: number | ((prev: number) => number)) => void;
  setImagePosition: (position: { x: number; y: number }) => void;
  resetView: () => void;
  imageViewerRef: RefObject<HTMLDivElement>;
}
```

---

### 3. 작은 컴포넌트 분리

#### `components/FileDeleteDialog.tsx`
- 파일 삭제 확인 다이얼로그
- **Props**:
  - `file`: 삭제할 파일
  - `open`: 다이얼로그 열림 상태
  - `onOpenChange`: 상태 변경 핸들러
  - `onConfirm`: 삭제 확인 핸들러
  - `deleting`: 삭제 중 상태

#### `components/FileEditDialog.tsx`
- 파일 정보 수정 다이얼로그
- **Props**:
  - `file`: 수정할 파일
  - `open`: 다이얼로그 열림 상태
  - `onOpenChange`: 상태 변경 핸들러
  - `onConfirm`: 수정 확인 핸들러
  - `editing`: 수정 중 상태
  - `description`: 설명 텍스트
  - `onDescriptionChange`: 설명 변경 핸들러

#### `components/FileCard.tsx`
- 개별 파일 카드 컴포넌트
- **Props**:
  - `file`: 파일 정보
  - `thumbnailUrl`: 썸네일 URL
  - `onClick`: 클릭 핸들러
  - `onDownload`: 다운로드 핸들러
  - `onAnalyze`: 분석 핸들러 (선택)
  - `onEdit`: 수정 핸들러 (선택)
  - `onDelete`: 삭제 핸들러
  - `isAnalyzing`: 분석 중 상태
  - `isPendingAnalysis`: 분석 대기 중 상태
  - `hasMetadata`: 메타데이터 존재 여부
  - `imageErrors`: 이미지 에러 Set
  - `onImageError`: 이미지 에러 핸들러
  - `canUpload`: 업로드 권한
  - `canDelete`: 삭제 권한

#### `components/ProcessFileSection.tsx`
- 공정별 파일 섹션 컴포넌트
- **Props**:
  - `process`: 공정 정보
  - `files`: 파일 목록
  - `thumbnailUrls`: 썸네일 URL 맵
  - `uploadingFiles`: 업로드 중인 파일 목록
  - `uploadProgress`: 업로드 진행률
  - `onUpload`: 업로드 핸들러
  - `onFileClick`: 파일 클릭 핸들러
  - `onDownload`: 다운로드 핸들러
  - `onAnalyze`: 분석 핸들러 (선택)
  - `onEdit`: 수정 핸들러 (선택)
  - `onDelete`: 삭제 핸들러
  - `analyzingFiles`: 분석 중인 파일 Set
  - `pendingAnalysisFiles`: 분석 대기 중인 파일 Set
  - `imageErrors`: 이미지 에러 Set
  - `onImageError`: 이미지 에러 핸들러
  - `canUpload`: 업로드 권한
  - `canDelete`: 삭제 권한

---

### 4. 큰 컴포넌트 분리

#### `components/FileDetailDialog.tsx`
- 파일 상세 정보 다이얼로그
- **기능**:
  - 파일 미리보기
  - 기본 정보 표시
  - 메타데이터 표시
  - 재생성된 이미지 표시 및 관리
  - 액션 버튼 (다운로드, 분석, 재생성, 삭제)

#### `components/ImageViewer.tsx`
- 이미지 전체화면 뷰어
- **기능**:
  - 전체화면 이미지 표시
  - 줌 인/아웃 (25% ~ 400%)
  - 드래그로 이미지 이동
  - 모바일 핀치 줌 지원
  - 뷰 리셋

#### `components/ImageRegenerationDialog.tsx`
- 이미지 재생성 스타일 선택 다이얼로그
- **기능**:
  - 스타일 선택
  - 생성 개수 선택
  - 재생성 실행

---

## 🔄 리팩토링 전후 비교

### Before (리팩토링 전)
```typescript
// FileGrid.tsx (약 1842줄)
export function FileGrid() {
  // 모든 상태와 로직이 한 파일에 집중
  const [files, setFiles] = useState<FileType[]>([]);
  const [imageZoom, setImageZoom] = useState(100);
  const [regeneratedImages, setRegeneratedImages] = useState([]);
  // ... 수많은 상태와 함수들
  
  // 모든 UI가 한 컴포넌트에
  return (
    <div>
      {/* 파일 그리드 */}
      {/* 삭제 다이얼로그 */}
      {/* 수정 다이얼로그 */}
      {/* 상세 정보 다이얼로그 */}
      {/* 이미지 뷰어 */}
      {/* 재생성 다이얼로그 */}
    </div>
  );
}
```

### After (리팩토링 후)
```typescript
// FileGrid.tsx (약 488줄)
export function FileGrid() {
  // 커스텀 훅으로 로직 분리
  const fileGrid = useFileGrid({ selectedCutId });
  const imageRegeneration = useImageRegeneration({ ... });
  
  // 분리된 컴포넌트 사용
  return (
    <>
      <ProcessFileSection {...props} />
      <FileDeleteDialog {...props} />
      <FileEditDialog {...props} />
      <FileDetailDialog {...props} />
      <ImageViewer {...props} />
      <ImageRegenerationDialog {...props} />
    </>
  );
}
```

---

## 📊 리팩토링 효과

### 코드 라인 수 감소
- **FileGrid.tsx**: 1842줄 → 488줄 (73% 감소)
- **전체 코드**: 더 작은 단위로 분리되어 가독성 향상

### 재사용성 향상
- 커스텀 훅은 다른 컴포넌트에서도 재사용 가능
- 작은 컴포넌트는 독립적으로 테스트 및 수정 가능

### 유지보수성 향상
- 각 기능이 독립적인 파일로 관리되어 수정 범위가 명확
- 버그 발생 시 해당 파일만 확인하면 됨

### 테스트 용이성
- 작은 단위로 분리되어 단위 테스트 작성 용이
- 각 컴포넌트와 훅을 독립적으로 테스트 가능

---

## 🛠️ 사용 방법

### FileGrid 컴포넌트 사용
```typescript
import { FileGrid } from '@/components/FileGrid';

// 자동으로 모든 하위 컴포넌트와 훅을 사용
<FileGrid />
```

### 개별 컴포넌트 사용
```typescript
import { FileCard } from '@/components/FileCard';
import { FileDetailDialog } from '@/components/FileDetailDialog';
import { ImageViewer } from '@/components/ImageViewer';

// 필요한 컴포넌트만 개별적으로 사용 가능
<FileCard file={file} onClick={handleClick} />
```

### 커스텀 훅 사용
```typescript
import { useFileGrid } from '@/lib/hooks/useFileGrid';
import { useImageRegeneration } from '@/lib/hooks/useImageRegeneration';
import { useImageViewer } from '@/lib/hooks/useImageViewer';

// 다른 컴포넌트에서도 재사용 가능
const { files, loading, loadFiles } = useFileGrid({ selectedCutId });
```

---

## 📝 주요 변경 사항

### 1. 상태 관리
- **Before**: 모든 상태가 FileGrid 컴포넌트 내부에 정의
- **After**: 관련 상태는 각 커스텀 훅으로 분리

### 2. 이벤트 핸들러
- **Before**: 모든 핸들러가 FileGrid 컴포넌트 내부에 정의
- **After**: 각 컴포넌트와 훅에 관련 핸들러 포함

### 3. UI 렌더링
- **Before**: 모든 UI가 FileGrid 컴포넌트의 return 문에 포함
- **After**: 각 UI가 독립적인 컴포넌트로 분리

### 4. 상수 관리
- **Before**: 스타일 옵션과 키워드가 FileGrid 컴포넌트 내부에 정의
- **After**: `lib/constants/imageRegeneration.ts`로 분리

---

## 🔍 파일별 상세 설명

### 상수 파일
- **위치**: `lib/constants/imageRegeneration.ts`
- **용도**: 이미지 재생성 관련 상수 및 유틸리티 함수
- **내용**: 스타일 옵션, 베르세르크 키워드, 프롬프트 생성 함수

### 커스텀 훅
- **위치**: `lib/hooks/`
- **용도**: 공통 로직을 재사용 가능한 훅으로 추출
- **파일**:
  - `useFileGrid.ts`: 파일 그리드 로직
  - `useImageRegeneration.ts`: 이미지 재생성 로직
  - `useImageViewer.ts`: 이미지 뷰어 로직

### 작은 컴포넌트
- **위치**: `components/`
- **용도**: 재사용 가능한 작은 UI 컴포넌트
- **파일**:
  - `FileDeleteDialog.tsx`: 삭제 확인
  - `FileEditDialog.tsx`: 정보 수정
  - `FileCard.tsx`: 파일 카드
  - `ProcessFileSection.tsx`: 공정별 섹션

### 큰 컴포넌트
- **위치**: `components/`
- **용도**: 복잡한 기능을 담당하는 독립적인 컴포넌트
- **파일**:
  - `FileDetailDialog.tsx`: 파일 상세 정보
  - `ImageViewer.tsx`: 이미지 전체화면 뷰어
  - `ImageRegenerationDialog.tsx`: 재생성 스타일 선택

---

## 🚀 향후 개선 사항

1. **타입 정의 개선**
   - 공통 타입을 별도 파일로 분리 (`types/file.ts`)
   - Props 타입을 더 명확하게 정의

2. **에러 처리 개선**
   - 각 컴포넌트와 훅에 에러 바운더리 추가
   - 사용자 친화적인 에러 메시지

3. **성능 최적화**
   - React.memo를 활용한 불필요한 리렌더링 방지
   - useMemo, useCallback 최적화

4. **테스트 코드 작성**
   - 각 컴포넌트와 훅에 대한 단위 테스트
   - 통합 테스트

---

## 📚 참고 자료

- [React Hooks 문서](https://react.dev/reference/react)
- [컴포넌트 분리 가이드](https://react.dev/learn/thinking-in-react)
- [커스텀 훅 패턴](https://react.dev/learn/reusing-logic-with-custom-hooks)

