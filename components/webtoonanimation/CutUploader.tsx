'use client';

import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';

interface CutUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  uploading?: boolean;
}

export function CutUploader({ onFilesSelected, disabled, uploading }: CutUploaderProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => {
      if (!disabled) onFilesSelected(accepted);
    },
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
    disabled: disabled || uploading,
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
        ${disabled || uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input {...getInputProps()} />
      <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
      {uploading ? (
        <p className="text-sm text-muted-foreground">업로드 중...</p>
      ) : isDragActive ? (
        <p className="text-sm text-primary font-medium">이미지를 놓으세요</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-1">웹툰 컷 이미지를 드래그하여 업로드</p>
          <p className="text-xs text-muted-foreground">여러 파일을 한번에 드래그할 수 있습니다</p>
        </>
      )}
    </div>
  );
}
