'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store/useStore';
import { uploadFile, deleteFile, updateFile, analyzeImage, getFilesByCut } from '@/lib/api/files';
import { getProcesses } from '@/lib/api/processes';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileIcon } from 'lucide-react';
import { File as FileType, FileWithRelations } from '@/lib/supabase';
import { canUploadFile, canDeleteFile } from '@/lib/utils/permissions';
import { useFileGrid } from '@/lib/hooks/useFileGrid';
import { useImageRegeneration } from '@/lib/hooks/useImageRegeneration';
import { FileDeleteDialog } from '@/components/FileDeleteDialog';
import { FileEditDialog } from '@/components/FileEditDialog';
import { FileDetailDialog } from '@/components/FileDetailDialog';
import { ImageViewer } from '@/components/ImageViewer';
import { ImageRegenerationWorkspace } from '@/components/ImageRegenerationWorkspace';
import { ProcessFileSection } from '@/components/ProcessFileSection';

export function FileGrid() {
  const { selectedWebtoon, selectedCut, processes, setProcesses, selectedProcess, setSelectedProcess, profile } = useStore();
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
  const [fileToView, setFileToView] = useState<FileWithRelations | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [generationCount, setGenerationCount] = useState<number>(2);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [viewingImageName, setViewingImageName] = useState<string>('');
  const [draggedOverProcessId, setDraggedOverProcessId] = useState<string | null>(null);

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
    savingImages,
    handleRegenerate,
    handleSaveImages,
    handleImageSelect,
    handleRegenerateSingle,
    setRegeneratedImages,
    setSelectedImageIds,
  } = useImageRegeneration({
    fileToView,
    selectedCutId: selectedCut?.id || null,
    generationCount,
    onFilesReload: loadFiles,
    currentUserId: profile?.id,
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

          const uploadedFile = await uploadFile(file, selectedCut.id, processId, '', profile?.id);

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
      alert('파일이 삭제되었습니다.');
      // 성공 시에만 다이얼로그 닫기 및 상태 초기화
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    } catch (error) {
      console.error('파일 삭제 실패:', error);
      const errorMessage = error instanceof Error ? error.message : '파일 삭제에 실패했습니다.';
      alert(errorMessage);
      // 실패 시에는 다이얼로그를 열어둠 (사용자가 다시 시도할 수 있도록)
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
    // ImageViewer가 열려있을 때는 FileDetailDialog를 닫지 않음
    if (!open && imageViewerOpen) {
      return;
    }

    setDetailDialogOpen(open);
    if (!open) {
      // Blob URL 정리
      regeneratedImages.forEach((img) => {
        if (img.url) {
          URL.revokeObjectURL(img.url);
        }
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

  const handleFileMove = useCallback(async (fileId: string, newProcessId: string) => {
    try {
      await updateFile(fileId, { process_id: newProcessId });
      await loadFiles();
      // 이동 성공 시 해당 공정으로 탭 전환
      const targetProcess = processes.find(p => p.id === newProcessId);
      if (targetProcess) {
        setSelectedProcess(targetProcess);
      }
    } catch (error) {
      console.error('파일 이동 실패:', error);
      alert('파일 이동에 실패했습니다.');
    }
  }, [loadFiles, processes, setSelectedProcess]);

  const handleDragOver = useCallback((e: React.DragEvent, processId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDraggedOverProcessId(processId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDraggedOverProcessId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, processId: string) => {
    e.preventDefault();
    setDraggedOverProcessId(null);
    const fileId = e.dataTransfer.getData('fileId');
    if (fileId) {
      handleFileMove(fileId, processId);
    }
  }, [handleFileMove]);

  // handleRegenerateSingle은 useImageRegeneration 훅에서 제공됨

  if (!selectedCut) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <FileIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>{(selectedWebtoon?.unit_type || 'cut') === 'cut' ? '컷을' : '페이지를'} 선택해주세요</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground text-sm">로딩 중...</div>;
  }

  const canUpload = profile && canUploadFile(profile.role);
  const canDelete = profile && canDeleteFile(profile.role);

  // 공정을 order_index 순으로 정렬
  const sortedProcesses = [...processes].sort((a, b) => a.order_index - b.order_index);

  // 선택된 공정이 없으면 첫 번째 공정으로 설정
  // useEffect(() => {
  //   if (!selectedProcess && sortedProcesses.length > 0) {
  //     setSelectedProcess(sortedProcesses[0]);
  //   }
  // }, [selectedProcess, sortedProcesses, setSelectedProcess]);

  const activeProcessId = selectedProcess?.id || (sortedProcesses.length > 0 ? sortedProcesses[0].id : '');

  const handleTabChange = (value: string) => {
    const process = processes.find(p => p.id === value);
    if (process) {
      setSelectedProcess(process);
    }
  };

  return (
    <>
      <div className="h-full flex flex-col">
        <Tabs value={activeProcessId} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="px-3 sm:px-4 pt-2 pb-3 flex-shrink-0">
            <TabsList className="w-full overflow-x-auto">
              {sortedProcesses.map((process) => {
                const processFiles = getFilesByProcess(process.id);
                return (
                  <TabsTrigger
                    key={process.id}
                    value={process.id}
                    className={`flex items-center gap-1.5 transition-colors ${
                      draggedOverProcessId === process.id ? 'bg-primary/20 ring-2 ring-primary' : ''
                    }`}
                    onDragOver={(e) => handleDragOver(e, process.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, process.id)}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: process.color }} />
                    <span>{process.name}</span>
                    {processFiles.length > 0 && (
                      <span className="text-xs opacity-70">({processFiles.length})</span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {sortedProcesses.map((process) => {
            const processFiles = getFilesByProcess(process.id);
            const processUploadingFiles = uploadingFiles[process.id] || [];
            const processProgress = uploadProgress[process.id] || {};

            return (
              <TabsContent
                key={process.id}
                value={process.id}
                className="flex-1 overflow-hidden mt-0 min-h-0"
              >
                <ScrollArea className="h-full">
                  <div className="p-3 sm:p-4">
                    <ProcessFileSection
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
                  </div>
                </ScrollArea>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      {/* 파일 삭제 확인 Dialog */}
      <FileDeleteDialog
        file={fileToDelete}
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            // 다이얼로그가 닫힐 때 상태 초기화
            setFileToDelete(null);
            setDeleting(false);
          }
        }}
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

      {/* AI 다시그리기 통합 작업 공간 */}
      <ImageRegenerationWorkspace
        open={workspaceOpen}
        onOpenChange={(open) => {
          setWorkspaceOpen(open);
          if (!open) {
            // Blob URL 정리
            regeneratedImages.forEach((img) => {
              if (img.url) {
                URL.revokeObjectURL(img.url);
              }
            });
            setRegeneratedImages([]);
            setSelectedImageIds(new Set());
          }
        }}
        file={fileToView}
        webtoonId={selectedWebtoon?.id}
        currentUserId={profile?.id}
        regeneratedImages={regeneratedImages}
        selectedImageIds={selectedImageIds}
        regeneratingImage={regeneratingImage}
        savingImages={savingImages}
        generationCount={generationCount}
        onGenerationCountChange={setGenerationCount}
        onRegenerate={handleRegenerate}
        onRegenerateSingle={handleRegenerateSingle}
        onImageSelect={handleImageSelect}
        onSaveImages={handleSaveImages}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onImageViewerOpen={handleImageViewerOpen}
        processes={processes}
        canUpload={!!canUpload}
        onSaveComplete={(processId) => {
          // 저장 완료 시 해당 공정으로 이동
          const targetProcess = processes.find(p => p.id === processId);
          if (targetProcess) {
            setSelectedProcess(targetProcess);
          }
          // 파일 상세 다이얼로그도 닫기
          setDetailDialogOpen(false);
        }}
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
        onRegenerateClick={() => setWorkspaceOpen(true)}
        onRegenerate={handleRegenerate}
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
        savingImages={savingImages}
        analyzingFiles={analyzingFiles}
        canUpload={!!canUpload}
        canDelete={!!canDelete}
        processes={processes}
        onSourceFileClick={(sourceFile) => {
          // 원본 파일 클릭 시 해당 파일의 상세 Dialog 열기
          setFileToView(sourceFile);
          // 이미지 크기 정보 초기화
          setImageDimensions(null);
          // 재생성 이미지 초기화
          setRegeneratedImages([]);
          setSelectedImageIds(new Set());
        }}
        onSaveComplete={(processId, skipCloseDialog) => {
          // 저장 완료 시 다이얼로그 닫고 해당 공정 선택
          // 단, skipCloseDialog가 true면 다이얼로그를 닫지 않음 (수정사항 분석 다이얼로그 내부에서 저장한 경우)
          console.log('[FileGrid] onSaveComplete 호출:', { processId, skipCloseDialog });
          if (!skipCloseDialog) {
            console.log('[FileGrid] 파일 상세 다이얼로그 닫기');
            handleDetailDialogClose(false);
          } else {
            console.log('[FileGrid] 파일 상세 다이얼로그 유지 (수정사항 분석 다이얼로그 내부)');
          }
          // 해당 공정 선택
          const targetProcess = processes.find(p => p.id === processId);
          if (targetProcess) {
            setSelectedProcess(targetProcess);
          }
        }}
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
