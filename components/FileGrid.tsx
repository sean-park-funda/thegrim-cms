'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store/useStore';
import { uploadFile, deleteFile, updateFile, analyzeImage, getFilesByCut } from '@/lib/api/files';
import { getProcesses } from '@/lib/api/processes';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileIcon } from 'lucide-react';
import { File as FileType } from '@/lib/supabase';
import { canUploadFile, canDeleteFile } from '@/lib/utils/permissions';
import { useFileGrid } from '@/lib/hooks/useFileGrid';
import { useImageRegeneration } from '@/lib/hooks/useImageRegeneration';
import { FileDeleteDialog } from '@/components/FileDeleteDialog';
import { FileEditDialog } from '@/components/FileEditDialog';
import { FileDetailDialog } from '@/components/FileDetailDialog';
import { ImageViewer } from '@/components/ImageViewer';
import { ImageRegenerationDialog } from '@/components/ImageRegenerationDialog';
import { ProcessFileSection } from '@/components/ProcessFileSection';

export function FileGrid() {
  const { selectedCut, processes, setProcesses, profile } = useStore();
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, globalThis.File[]>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, Record<string, number>>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [fileToEdit, setFileToEdit] = useState<FileType | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editing, setEditing] = useState(false);
  const [analyzingFiles, setAnalyzingFiles] = useState<Set<string>>(new Set());
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [fileToView, setFileToView] = useState<FileType | null>(null);
  const [styleSelectionOpen, setStyleSelectionOpen] = useState(false);
  const [generationCount, setGenerationCount] = useState<number>(2);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [viewingImageName, setViewingImageName] = useState<string>('');

  // 커스텀 훅 사용
  const {
    loading,
    thumbnailUrls,
    imageErrors,
    pendingAnalysisFiles,
    setPendingAnalysisFiles,
    setThumbnailUrl,
    loadFiles,
    getFilesByProcess,
  } = useFileGrid({ selectedCutId: selectedCut?.id || null });

  const {
    regeneratingImage,
    regeneratedImages,
    selectedImageIds,
    handleRegenerate,
    handleSaveImages,
    handleImageSelect,
    setRegeneratedImages,
    setSelectedImageIds,
  } = useImageRegeneration({
    fileToView,
    selectedCutId: selectedCut?.id || null,
    generationCount,
    onFilesReload: loadFiles,
  });

  const loadProcesses = useCallback(async () => {
    try {
      const data = await getProcesses();
      setProcesses(data);
    } catch (error) {
      console.error('공정 목록 로드 실패:', error);
    }
  }, [setProcesses]);

  useEffect(() => {
    loadProcesses();
  }, [loadProcesses]);

  // 메타데이터가 없는 이미지 파일들에 대해 주기적으로 폴링
  useEffect(() => {
    if (!selectedCut || pendingAnalysisFiles.size === 0) return;

    const pollInterval = setInterval(async () => {
      try {
        const currentFiles = await getFilesByCut(selectedCut.id);
        
        // 메타데이터가 생성된 파일들 확인
        const updatedFiles: string[] = [];
        const stillPending: string[] = [];

        pendingAnalysisFiles.forEach((fileId) => {
          const file = currentFiles.find(f => f.id === fileId);
          if (file) {
            const metadata = file.metadata as {
              scene_summary?: string;
              tags?: string[];
            } | undefined;
            
            if (metadata && metadata.scene_summary && metadata.tags) {
              // 메타데이터가 생성됨
              updatedFiles.push(fileId);
            } else {
              // 아직 메타데이터 없음
              stillPending.push(fileId);
            }
          }
        });

        // 메타데이터가 생성된 파일이 있으면 파일 목록 업데이트
        if (updatedFiles.length > 0) {
          console.log('[FileGrid] 메타데이터 생성 완료된 파일:', updatedFiles);
          setPendingAnalysisFiles(prev => {
            const newSet = new Set(prev);
            updatedFiles.forEach(id => newSet.delete(id));
            return newSet;
          });
          // 파일 목록 다시 로드
          await loadFiles();
        }

        // 모든 파일의 메타데이터가 생성되었으면 폴링 중지
        if (stillPending.length === 0) {
          setPendingAnalysisFiles(new Set());
        }
      } catch (error) {
        console.error('[FileGrid] 폴링 중 오류:', error);
      }
    }, 3000); // 3초마다 확인

    return () => clearInterval(pollInterval);
  }, [selectedCut, pendingAnalysisFiles, loadFiles, setPendingAnalysisFiles]);

  const handleFileUpload = useCallback(async (acceptedFiles: globalThis.File[], processId: string) => {
    if (!selectedCut) return;

    setUploadingFiles(prev => ({ ...prev, [processId]: acceptedFiles }));

    try {
      const uploadedImageIds: string[] = [];

      for (const file of acceptedFiles) {
        try {
          setUploadProgress(prev => ({
            ...prev,
            [processId]: { ...prev[processId], [file.name]: 0 }
          }));

          const uploadedFile = await uploadFile(file, selectedCut.id, processId, '');

          setUploadProgress(prev => ({
            ...prev,
            [processId]: { ...prev[processId], [file.name]: 100 }
          }));

          // 이미지 파일인 경우 메타데이터 생성 대기 목록에 추가
          if (uploadedFile.file_type === 'image') {
            uploadedImageIds.push(uploadedFile.id);
          }
        } catch (error) {
          console.error(`파일 업로드 실패 (${file.name}):`, error);
          alert(`${file.name} 업로드에 실패했습니다.`);
        }
      }

      await loadFiles();

      // 업로드된 이미지 파일들을 메타데이터 생성 대기 목록에 추가
      if (uploadedImageIds.length > 0) {
        setPendingAnalysisFiles(prev => {
          const newSet = new Set(prev);
          uploadedImageIds.forEach(id => newSet.add(id));
          return newSet;
        });
      }

      setUploadingFiles(prev => {
        const newState = { ...prev };
        delete newState[processId];
        return newState;
      });
      setUploadProgress(prev => {
        const newState = { ...prev };
        delete newState[processId];
        return newState;
      });
    } catch (error) {
      console.error('파일 업로드 실패:', error);
      alert('파일 업로드에 실패했습니다.');
    }
  }, [selectedCut, loadFiles, setPendingAnalysisFiles]);

  const handleDownload = async (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(file.file_path);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('파일 다운로드 실패:', error);
      alert('파일 다운로드에 실패했습니다.');
    }
  };

  const handleDeleteClick = (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const handleEditClick = (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    // 빈 문자열일 때만 수정 가능
    if (file.description && file.description.trim() !== '') {
      alert('이미 설명이 있는 파일입니다. AI 자동 생성 후에는 수정할 수 없습니다.');
      return;
    }
    setFileToEdit(file);
    setEditDescription(file.description || '');
    setEditDialogOpen(true);
  };

  const handleAnalyzeClick = async (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!file || file.file_type !== 'image') return;

    try {
      setAnalyzingFiles(prev => new Set(prev).add(file.id));
      // 메타데이터 생성 대기 목록에 추가
      setPendingAnalysisFiles(prev => new Set(prev).add(file.id));
      
      await analyzeImage(file.id);
      await loadFiles();
      
      // 분석 완료 후 대기 목록에서 제거
      setPendingAnalysisFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
      
      alert('이미지 분석이 완료되었습니다.');
    } catch (error: unknown) {
      console.error('이미지 분석 실패:', error);
      // 실패 시에도 대기 목록에서 제거
      setPendingAnalysisFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
      const errorMessage = error instanceof Error ? error.message : '이미지 분석에 실패했습니다.';
      alert(errorMessage);
    } finally {
      setAnalyzingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
    }
  };

  const handleEditConfirm = async () => {
    if (!fileToEdit) return;

    try {
      setEditing(true);
      await updateFile(fileToEdit.id, { description: editDescription.trim() });
      await loadFiles();
      setEditDialogOpen(false);
      setFileToEdit(null);
      setEditDescription('');
      alert('파일 정보가 수정되었습니다.');
    } catch (error) {
      console.error('파일 정보 수정 실패:', error);
      alert('파일 정보 수정에 실패했습니다.');
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;

    try {
      setDeleting(true);
      await deleteFile(fileToDelete.id);
      await loadFiles();
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      alert('파일이 삭제되었습니다.');
    } catch (error) {
      console.error('파일 삭제 실패:', error);
      alert('파일 삭제에 실패했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const handleFileClick = (file: FileType) => {
    setFileToView(file);
    setImageDimensions(null); // 파일 변경 시 이미지 크기 초기화
    setDetailDialogOpen(true);
  };

  const handleImageViewerOpen = (imageUrl: string, imageName: string) => {
    setViewingImageUrl(imageUrl);
    setViewingImageName(imageName);
    setImageViewerOpen(true);
  };

  const handleDetailDialogClose = (open: boolean) => {
    setDetailDialogOpen(open);
    if (!open) {
      // Blob URL 정리
      regeneratedImages.forEach((img) => {
        URL.revokeObjectURL(img.url);
      });
      setRegeneratedImages([]);
      setSelectedImageIds(new Set());
      setImageDimensions(null);
      setImageViewerOpen(false);
      setViewingImageUrl(null);
      setViewingImageName('');
    }
  };

  const handleImageError = (fileId: string, originalUrl: string) => {
    setThumbnailUrl(fileId, originalUrl);
  };

  const handleSelectAll = () => {
    setSelectedImageIds(new Set(regeneratedImages.map(img => img.id)));
  };

  const handleDeselectAll = () => {
    setSelectedImageIds(new Set());
  };

  const handleRegenerateSingle = (prompt: string) => {
    handleRegenerate(prompt, 1);
  };

  if (!selectedCut) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <FileIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>컷을 선택해주세요</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground text-sm">로딩 중...</div>;
  }

  const canUpload = profile && canUploadFile(profile.role);
  const canDelete = profile && canDeleteFile(profile.role);

  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-3 sm:p-4">
          <div className="mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold">공정별 파일</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">컷 {selectedCut.cut_number}의 제작 파일들</p>
          </div>

          <div className="space-y-4 sm:space-y-6">
            {processes.map((process) => {
              const processFiles = getFilesByProcess(process.id);
              const processUploadingFiles = uploadingFiles[process.id] || [];
              const processProgress = uploadProgress[process.id] || {};

              return (
                <ProcessFileSection
                  key={process.id}
                  process={process}
                  files={processFiles}
                  thumbnailUrls={thumbnailUrls}
                  uploadingFiles={processUploadingFiles}
                  uploadProgress={processProgress}
                  onUpload={(files) => handleFileUpload(files, process.id)}
                  onFileClick={handleFileClick}
                  onDownload={handleDownload}
                  onAnalyze={canUpload ? handleAnalyzeClick : undefined}
                  onEdit={canUpload ? handleEditClick : undefined}
                  onDelete={handleDeleteClick}
                  analyzingFiles={analyzingFiles}
                  pendingAnalysisFiles={pendingAnalysisFiles}
                  imageErrors={imageErrors}
                  onImageError={handleImageError}
                  canUpload={!!canUpload}
                  canDelete={!!canDelete}
                />
              );
            })}
          </div>
        </div>
      </ScrollArea>

      {/* 파일 삭제 확인 Dialog */}
      <FileDeleteDialog
        file={fileToDelete}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        deleting={deleting}
      />

      {/* 파일 정보 수정 Dialog */}
      <FileEditDialog
        file={fileToEdit}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onConfirm={handleEditConfirm}
        editing={editing}
        description={editDescription}
        onDescriptionChange={setEditDescription}
      />

      {/* 스타일 선택 Dialog */}
      <ImageRegenerationDialog
        styleSelectionOpen={styleSelectionOpen}
        onStyleSelectionChange={setStyleSelectionOpen}
        onRegenerate={handleRegenerate}
        regeneratedImages={regeneratedImages}
        selectedImageIds={selectedImageIds}
        onImageSelect={handleImageSelect}
        onSaveImages={handleSaveImages}
        regeneratingImage={regeneratingImage}
        generationCount={generationCount}
        onGenerationCountChange={setGenerationCount}
        fileToViewId={fileToView?.id || null}
      />

      {/* 파일 상세 정보 Dialog */}
      <FileDetailDialog
        file={fileToView}
        open={detailDialogOpen}
        onOpenChange={handleDetailDialogClose}
        onImageViewerOpen={handleImageViewerOpen}
        onDownload={handleDownload}
        onAnalyze={canUpload ? handleAnalyzeClick : undefined}
        onDelete={handleDeleteClick}
        onRegenerateClick={() => setStyleSelectionOpen(true)}
        onRegenerateSingle={handleRegenerateSingle}
        onImageSelect={handleImageSelect}
        onSaveImages={handleSaveImages}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        imageErrors={imageErrors}
        imageDimensions={imageDimensions}
        regeneratedImages={regeneratedImages}
        selectedImageIds={selectedImageIds}
        regeneratingImage={regeneratingImage}
        analyzingFiles={analyzingFiles}
        canUpload={!!canUpload}
        canDelete={!!canDelete}
      />

      {/* 이미지 전체화면 뷰어 */}
      {viewingImageUrl && (
        <ImageViewer
          imageUrl={viewingImageUrl}
          imageName={viewingImageName}
          open={imageViewerOpen}
          onOpenChange={(open) => {
            setImageViewerOpen(open);
            if (!open) {
              setViewingImageUrl(null);
              setViewingImageName('');
            }
          }}
        />
      )}
    </>
  );
}
