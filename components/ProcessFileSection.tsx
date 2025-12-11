'use client';

import { Process } from '@/lib/supabase';
import { File as FileType } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Plus, FileIcon } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { FileCard } from '@/components/FileCard';
import { canUploadFile } from '@/lib/utils/permissions';

interface ProcessFileSectionProps {
  process: Process;
  files: FileType[];
  thumbnailUrls: Record<string, string>;
  uploadingFiles: globalThis.File[];
  uploadProgress: Record<string, number>;
  onUpload: (files: globalThis.File[]) => void;
  onFileClick: (file: FileType) => void;
  onDownload: (file: FileType, e: React.MouseEvent) => void;
  onAnalyze?: (file: FileType, e: React.MouseEvent) => void;
  onEdit?: (file: FileType, e: React.MouseEvent) => void;
  onDelete: (file: FileType, e: React.MouseEvent) => void;
  analyzingFiles: Set<string>;
  pendingAnalysisFiles: Set<string>;
  imageErrors: Set<string>;
  onImageError: (fileId: string, originalUrl: string) => void;
  canUpload: boolean;
  canDelete: boolean;
  loading?: boolean;
}

export function ProcessFileSection({
  process,
  files,
  thumbnailUrls,
  uploadingFiles,
  uploadProgress,
  onUpload,
  onFileClick,
  onDownload,
  onAnalyze,
  onEdit,
  onDelete,
  analyzingFiles,
  pendingAnalysisFiles,
  imageErrors,
  onImageError,
  canUpload,
  canDelete,
  loading = false,
}: ProcessFileSectionProps) {
  const ProcessDropzone = ({ children }: { children: (open: () => void) => React.ReactNode }) => {
    const onDrop = (acceptedFiles: globalThis.File[]) => {
      if (!canUpload) return;
      onUpload(acceptedFiles);
    };

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
      onDrop,
      accept: {
        'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
        'application/pdf': ['.pdf'],
        'application/postscript': ['.ps', '.ai'],
        'application/vnd.adobe.photoshop': ['.psd']
      },
      maxSize: 100 * 1024 * 1024,
      noClick: true,
      disabled: !canUpload
    });

    return (
      <div
        {...getRootProps()}
        className={`relative ${isDragActive ? 'ring-2 ring-primary ring-offset-2' : ''}`}
      >
        <input {...getInputProps()} />
        {children(open)}
        {isDragActive && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10">
            <div className="text-center">
              <Upload className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 text-primary" />
              <p className="text-sm sm:text-base text-primary font-medium">파일을 여기에 놓으세요</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 sm:p-6 flex-1 min-h-0">
        <ProcessDropzone>
          {(open) => (
            <>
              {uploadingFiles.length > 0 && (
                <div className="mb-3 sm:mb-4 space-y-2 p-3 sm:p-4 bg-muted rounded-lg">
                  <p className="text-xs sm:text-sm font-medium mb-2">업로드 중...</p>
                  {uploadingFiles.map((file: globalThis.File) => (
                    <div key={file.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="truncate flex-1">{file.name}</span>
                        <span className="text-muted-foreground ml-2">
                          {uploadProgress[file.name] || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-background rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress[file.name] || 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {files.length === 0 && uploadingFiles.length === 0 && !loading ? (
                <div className="py-8 sm:py-12 text-center border-2 border-dashed border-muted-foreground/25 rounded-lg">
                  {canUpload ? (
                    <>
                      <Upload className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 text-muted-foreground opacity-50" />
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">파일을 드래그하여 업로드</p>
                      <p className="text-xs text-muted-foreground mb-1">또는 클릭하여 파일 선택</p>
                      <p className="text-xs text-muted-foreground">또는 Ctrl+V로 클립보드 붙여넣기</p>
                    </>
                  ) : (
                    <>
                      <FileIcon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 text-muted-foreground opacity-50" />
                      <p className="text-xs sm:text-sm text-muted-foreground">파일이 없습니다</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {/* 업로드 버튼 카드 */}
                  {canUpload && (
                    <Card 
                      className="overflow-hidden border-dashed opacity-40 hover:opacity-100 active:opacity-100 transition-opacity cursor-pointer group touch-manipulation p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        open();
                      }}
                    >
                      <div className="w-full h-40 sm:h-48 bg-muted/50 rounded-md flex items-center justify-center border-2 border-dashed border-muted-foreground/30 group-hover:border-primary/50">
                        <Plus className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="p-2 sm:p-3 text-center">
                        <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors mb-0.5">파일 추가</p>
                        <p className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground/90 transition-colors">Ctrl+V 붙여넣기</p>
                      </div>
                    </Card>
                  )}
                  {files.map((file: FileType) => {
                    const metadata = file.metadata as {
                      scene_summary?: string;
                      tags?: string[];
                      characters_count?: number;
                    } | undefined;
                    const hasMetadata = metadata && metadata.scene_summary && metadata.tags;
                    const isAnalyzing = analyzingFiles.has(file.id);
                    const isPendingAnalysis = pendingAnalysisFiles.has(file.id);

                    return (
                      <FileCard
                        key={file.id}
                        file={file}
                        thumbnailUrl={thumbnailUrls[file.id]}
                        onClick={() => onFileClick(file)}
                        onDownload={(e) => onDownload(file, e)}
                        onAnalyze={onAnalyze ? (e) => onAnalyze(file, e) : undefined}
                        onEdit={onEdit ? (e) => onEdit(file, e) : undefined}
                        onDelete={(e) => onDelete(file, e)}
                        isAnalyzing={isAnalyzing}
                        isPendingAnalysis={isPendingAnalysis}
                        hasMetadata={!!hasMetadata}
                        imageErrors={imageErrors}
                        onImageError={onImageError}
                        canUpload={canUpload}
                        canDelete={canDelete}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </ProcessDropzone>
      </div>
    </div>
  );
}

