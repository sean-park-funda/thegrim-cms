'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { uploadFile, deleteFile, updateFile, analyzeImage, getFilesByCut } from '@/lib/api/files';
import { getProcesses } from '@/lib/api/processes';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { FileIcon } from 'lucide-react';
import { File as FileType, FileWithRelations, Process } from '@/lib/supabase';
import { canUploadFile, canDeleteFile } from '@/lib/utils/permissions';
import { useFileGrid } from '@/lib/hooks/useFileGrid';
import { useImageRegeneration } from '@/lib/hooks/useImageRegeneration';
import { FileDeleteDialog } from '@/components/FileDeleteDialog';
import { FileEditDialog } from '@/components/FileEditDialog';
import { FileDetailDialog } from '@/components/FileDetailDialog';
import { ImageViewer } from '@/components/ImageViewer';
import { ProcessFileSection } from '@/components/ProcessFileSection';
import { DerivedImagesDialog } from '@/components/DerivedImagesDialog';

interface FileGridProps {
  cutId: string;
}

export function FileGrid({ cutId }: FileGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { processes, setProcesses, profile, selectedWebtoon, selectedEpisode } = useStore();
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
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
  const [generationCount, setGenerationCount] = useState<number>(2);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [viewingImageName, setViewingImageName] = useState<string>('');
  const [draggedOverProcessId, setDraggedOverProcessId] = useState<string | null>(null);
  const isProcessingPaste = useRef(false);
  const pasteListenerRef = useRef<((e: ClipboardEvent) => void) | null>(null);
  
  // 파생 이미지 관련 상태
  const [derivedCounts, setDerivedCounts] = useState<Record<string, number>>({});
  const [derivedDialogOpen, setDerivedDialogOpen] = useState(false);
  const [derivedSourceFile, setDerivedSourceFile] = useState<FileType | null>(null);

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20; // 한 페이지에 표시할 파일 수

  // 커스텀 훅 사용
  const {
    files: allFiles,
    loading,
    thumbnailUrls,
    imageErrors,
    pendingAnalysisFiles,
    setPendingAnalysisFiles,
    setThumbnailUrl,
    loadFiles,
    getFilesByProcess,
  } = useFileGrid({ selectedCutId: cutId });

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
    selectedCutId: cutId,
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

  // 파생 이미지 개수 조회
  const loadDerivedCounts = useCallback(async (fileIds: string[]) => {
    if (fileIds.length === 0) return;
    
    try {
      const response = await fetch('/api/files/derived-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds,
          currentUserId: profile?.id,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setDerivedCounts(data.counts || {});
      }
    } catch (error) {
      console.error('파생 이미지 개수 조회 실패:', error);
    }
  }, [profile?.id]);

  // 파일 목록이 변경될 때 파생 이미지 개수 조회
  useEffect(() => {
    // 로딩 중이거나 파일이 없으면 스킵
    if (loading || allFiles.length === 0) return;
    
    const allFileIds = allFiles.map(file => file.id);
    
    if (allFileIds.length > 0) {
      loadDerivedCounts(allFileIds);
    }
  }, [loading, allFiles, loadDerivedCounts]);

  // 파생 이미지 클릭 핸들러
  const handleDerivedClick = useCallback((file: FileType) => {
    setDerivedSourceFile(file);
    setDerivedDialogOpen(true);
  }, []);

  // 메타데이터가 없는 이미지 파일들에 대해 주기적으로 폴링
  useEffect(() => {
    if (!cutId || pendingAnalysisFiles.size === 0) return;

    const pollInterval = setInterval(async () => {
      try {
        const currentFiles = await getFilesByCut(cutId);

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
  }, [cutId, pendingAnalysisFiles, loadFiles, setPendingAnalysisFiles]);

  const handleFileUpload = useCallback(async (acceptedFiles: globalThis.File[], processId: string) => {
    if (!cutId) return;

    // 상태 업데이트를 즉시 반영하기 위해 flushSync 사용
    flushSync(() => {
      setUploadingFiles(prev => {
        const newState = { ...prev, [processId]: acceptedFiles };
        return newState;
      });
      
      // 진행률 초기화도 즉시 반영
      setUploadProgress(prev => {
        const newState = { ...prev };
        if (!newState[processId]) {
          newState[processId] = {};
        }
        acceptedFiles.forEach(file => {
          newState[processId][file.name] = 0;
        });
        return newState;
      });
    });

    try {
      const uploadedImageIds: string[] = [];
      const uploadStartTime = Date.now();
      const minDisplayTime = 500; // 최소 표시 시간 (500ms)

      for (const file of acceptedFiles) {
        try {
          // 업로드 진행률 업데이트 (50%로 설정 - API 업로드 중)
          setUploadProgress(prev => ({
            ...prev,
            [processId]: { ...prev[processId], [file.name]: 50 }
          }));

          // File -> base64 데이터 URL 변환
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
          });

          const [header, base64] = dataUrl.split(',');
          const mimeMatch = header.match(/^data:(.*);base64$/);
          const mimeType = mimeMatch?.[1] || file.type || 'application/octet-stream';

          console.log('[FileGrid][handleFileUpload] 파일 업로드 시작 - API로 업로드', {
            cutId,
            processId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          });

          // API를 통해 업로드 (Supabase Storage 네트워크 이슈 회피)
          const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              imageData: base64,
              mimeType,
              fileName: file.name,
              cutId,
              processId,
              description: '',
              createdBy: profile?.id,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error('[FileGrid][handleFileUpload] 파일 업로드 API 실패', {
              status: response.status,
              error: errorData,
              fileName: file.name,
            });
            throw new Error(errorData?.error || `${file.name} 업로드에 실패했습니다.`);
          }

          const result = await response.json();
          console.log('[FileGrid][handleFileUpload] 파일 업로드 API 성공', {
            fileId: result.file?.id,
            fileName: file.name,
          });

          // 업로드 완료 (100%)
          setUploadProgress(prev => ({
            ...prev,
            [processId]: { ...prev[processId], [file.name]: 100 }
          }));

          // 이미지 파일인 경우 메타데이터 생성 대기 목록에 추가
          if (result.file?.file_type === 'image') {
            uploadedImageIds.push(result.file.id);
          }
        } catch (error) {
          console.error(`파일 업로드 실패 (${file.name}):`, error);
          alert(error instanceof Error ? error.message : `${file.name} 업로드에 실패했습니다.`);
        }
      }

      // POST 요청(DB 저장)이 완료된 후 리프레시
      await loadFiles();

      // 업로드된 이미지 파일들을 메타데이터 생성 대기 목록에 추가
      if (uploadedImageIds.length > 0) {
        setPendingAnalysisFiles(prev => {
          const newSet = new Set(prev);
          uploadedImageIds.forEach(id => newSet.add(id));
          return newSet;
        });
      }

      // 최소 표시 시간이 지나지 않았다면 대기
      const elapsedTime = Date.now() - uploadStartTime;
      if (elapsedTime < minDisplayTime) {
        await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsedTime));
      }

      // 상태 초기화
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

      // 업로드 완료 후 스크롤을 맨 위로 이동 (새로 업로드된 파일이 보이도록)
      // 다음 프레임에서 실행하여 DOM 업데이트가 완료된 후 스크롤 이동
      requestAnimationFrame(() => {
        // 업로드가 완료된 프로세스의 ScrollArea viewport 찾기
        const processTabContent = document.querySelector(`[data-process-id="${processId}"]`);
        if (processTabContent) {
          const scrollAreaViewport = processTabContent.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
          if (scrollAreaViewport) {
            scrollAreaViewport.scrollTop = 0;
          }
        }
      });
    } catch (error) {
      console.error('파일 업로드 실패:', error);
      alert('파일 업로드에 실패했습니다.');
    }
  }, [cutId, loadFiles, setPendingAnalysisFiles, profile?.id]);

  // 클립보드에서 이미지 붙여넣기 처리
  const handlePasteFromClipboard = useCallback(async (e: ClipboardEvent) => {
    // 다이얼로그가 열려있으면 즉시 무시 (다이얼로그의 핸들러가 처리하도록)
    if (detailDialogOpen || editDialogOpen || deleteDialogOpen) {
      // ImageRegenerationWorkspace 핸들러가 실행되도록 이벤트 전파는 막지 않음
      return;
    }

    // 이미 처리 중이면 무시 (중복 방지)
    if (isProcessingPaste.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 입력 필드에 포커스가 있으면 기본 동작 허용
    const activeElement = document.activeElement;
    if (
      activeElement &&
      (activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true')
    ) {
      return;
    }

    // 업로드 권한 확인
    if (!profile || !canUploadFile(profile.role)) {
      return;
    }

    // 공정이 없으면 무시
    if (!selectedProcess) {
      return;
    }

    const clipboardData = e.clipboardData;
    if (!clipboardData) {
      return;
    }

    // 클립보드에서 이미지 찾기
    const items = Array.from(clipboardData.items);
    const imageItem = items.find((item) => item.type.indexOf('image') !== -1);

    if (!imageItem) {
      // 이미지가 아니면 무시
      return;
    }

    // 기본 동작 방지
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // 처리 중 플래그 설정
    isProcessingPaste.current = true;

    try {
      // Blob으로 변환
      const blob = imageItem.getAsFile();
      if (!blob) {
        return;
      }

      // File 객체로 변환 (파일명은 타임스탬프 기반)
      const timestamp = Date.now();
      const fileExtension = blob.type.split('/')[1] || 'png';
      const fileName = `clipboard-${timestamp}.${fileExtension}`;
      const file = new File([blob], fileName, { type: blob.type });

      // File -> base64 데이터 URL 변환
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });

      const [header, base64] = dataUrl.split(',');
      const mimeMatch = header.match(/^data:(.*);base64$/);
      const mimeType = mimeMatch?.[1] || file.type || 'image/png';

      console.log('[FileGrid][handlePasteFromClipboard] 클립보드 이미지 처리 시작 - API로 업로드', {
        cutId,
        processId: selectedProcess.id,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });

      // 업로드 진행률 업데이트 (50%로 설정 - API 업로드 중)
      setUploadProgress(prev => ({
        ...prev,
        [selectedProcess.id]: { ...prev[selectedProcess.id], [file.name]: 50 }
      }));

      // API를 통해 업로드 (Supabase Storage 네트워크 이슈 회피)
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: base64,
          mimeType,
          fileName: file.name,
          cutId,
          processId: selectedProcess.id,
          description: '',
          createdBy: profile?.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('[FileGrid][handlePasteFromClipboard] 파일 업로드 API 실패', {
          status: response.status,
          error: errorData,
        });
        alert('클립보드 이미지 업로드에 실패했습니다.');
        return;
      }

      const result = await response.json();
      console.log('[FileGrid][handlePasteFromClipboard] 파일 업로드 API 성공', {
        fileId: result.file?.id,
      });

      // 업로드 완료 (100%)
      setUploadProgress(prev => ({
        ...prev,
        [selectedProcess.id]: { ...prev[selectedProcess.id], [file.name]: 100 }
      }));

      // 이미지 파일인 경우 메타데이터 생성 대기 목록에 추가
      if (result.file?.file_type === 'image') {
        setPendingAnalysisFiles(prev => new Set(prev).add(result.file.id));
      }

      // 파일 목록 다시 로드
      await loadFiles();

      // 업로드 완료 후 상태 정리
      setTimeout(() => {
        setUploadingFiles(prev => {
          const newState = { ...prev };
          if (newState[selectedProcess.id]) {
            const filtered = newState[selectedProcess.id].filter(f => f.name !== file.name);
            if (filtered.length === 0) {
              delete newState[selectedProcess.id];
            } else {
              newState[selectedProcess.id] = filtered;
            }
          }
          return newState;
        });
        setUploadProgress(prev => {
          const newState = { ...prev };
          if (newState[selectedProcess.id]) {
            delete newState[selectedProcess.id][file.name];
            if (Object.keys(newState[selectedProcess.id]).length === 0) {
              delete newState[selectedProcess.id];
            }
          }
          return newState;
        });
      }, 500);
    } catch (error) {
      console.error('클립보드 이미지 붙여넣기 실패:', error);
      alert('클립보드 이미지 붙여넣기에 실패했습니다.');
    } finally {
      // 처리 완료 후 플래그 해제 (짧은 딜레이를 두어 중복 방지)
      setTimeout(() => {
        isProcessingPaste.current = false;
      }, 500);
    }
  }, [profile, cutId, selectedProcess, loadFiles, setPendingAnalysisFiles, detailDialogOpen, editDialogOpen, deleteDialogOpen]);

  // 클립보드 붙여넣기 이벤트 리스너 등록 (한 번만)
  useEffect(() => {
    // 업로드 권한이 없으면 리스너 등록하지 않음
    if (!profile || !canUploadFile(profile.role)) {
      // 권한이 없으면 기존 리스너 제거
      if (pasteListenerRef.current) {
        window.removeEventListener('paste', pasteListenerRef.current, true);
        pasteListenerRef.current = null;
      }
      return;
    }

    // 리스너 함수 생성 (최신 handlePasteFromClipboard를 참조)
    const pasteHandler = (e: ClipboardEvent) => {
      handlePasteFromClipboard(e);
    };

    // 이미 리스너가 등록되어 있으면 제거
    if (pasteListenerRef.current) {
      window.removeEventListener('paste', pasteListenerRef.current, true);
    }

    // 새 리스너 등록 (즉시 등록하여 ImageRegenerationWorkspace보다 먼저 등록되도록 함)
    pasteListenerRef.current = pasteHandler;
    window.addEventListener('paste', pasteHandler, true); // capture phase에서 처리

    return () => {
      if (pasteListenerRef.current) {
        window.removeEventListener('paste', pasteListenerRef.current, true);
        pasteListenerRef.current = null;
      }
    };
  }, [handlePasteFromClipboard, profile]);

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

      // 파일 상세 다이얼로그가 열려있으면 fileToView 업데이트
      if (fileToView && fileToView.id === file.id) {
        // 파일 정보 다시 로드
        const { getFileById } = await import('@/lib/api/files');
        const updatedFile = await getFileById(file.id);
        if (updatedFile) {
          setFileToView(updatedFile);
        }
      }
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
    router.push(`/files/${file.id}`);
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

  const updateProcessInUrl = useCallback((processId: string) => {
    const currentPath = window.location.pathname;
    router.replace(`${currentPath}?process=${processId}`, { scroll: false });
  }, [router]);

  const handleFileMove = useCallback(async (fileId: string, newProcessId: string) => {
    try {
      await updateFile(fileId, { process_id: newProcessId });
      await loadFiles();
      // 이동 성공 시 해당 공정으로 탭 전환
      const targetProcess = processes.find(p => p.id === newProcessId);
      if (targetProcess) {
        setSelectedProcess(targetProcess);
        updateProcessInUrl(newProcessId);
      }
    } catch (error) {
      console.error('파일 이동 실패:', error);
      alert('파일 이동에 실패했습니다.');
    }
  }, [loadFiles, processes, updateProcessInUrl]);

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

  // early return 제거 - hooks 호출 후 early return은 hooks 호출 순서를 깨뜨림
  // 대신 조건부 렌더링 사용

  const canUpload = profile && canUploadFile(profile.role);
  const canDelete = profile && canDeleteFile(profile.role);

  // 공정을 order_index 순으로 정렬
  const sortedProcesses = [...processes].sort((a, b) => a.order_index - b.order_index);

  // URL에서 공정 ID 읽기
  const processIdFromUrl = searchParams.get('process');

  // URL에서 공정 ID를 읽어서 초기 설정
  useEffect(() => {
    if (processes.length === 0) return;

    if (processIdFromUrl) {
      const process = processes.find(p => p.id === processIdFromUrl);
      if (process && selectedProcess?.id !== process.id) {
        setSelectedProcess(process);
        return;
      }
    }
    // URL에 공정이 없거나 유효하지 않으면 첫 번째 공정으로 설정하고 URL 업데이트
    if (!processIdFromUrl && sortedProcesses.length > 0) {
      const firstProcess = sortedProcesses[0];
      if (selectedProcess?.id !== firstProcess.id) {
        setSelectedProcess(firstProcess);
        // URL 업데이트 (현재 경로 유지하면서 쿼리 파라미터만 추가)
        const currentPath = window.location.pathname;
        router.replace(`${currentPath}?process=${firstProcess.id}`, { scroll: false });
      }
    }
  }, [processes, processIdFromUrl, sortedProcesses, selectedProcess, router]);

  const activeProcessId = selectedProcess?.id || (sortedProcesses.length > 0 ? sortedProcesses[0].id : '');

  const handleTabChange = (value: string) => {
    const process = processes.find(p => p.id === value);
    if (process) {
      setSelectedProcess(process);
      updateProcessInUrl(process.id);
      setCurrentPage(1); // 공정 변경 시 페이지 리셋
    }
  };

  return (
    <>
      {/* 해결 방법 적용: flex: 1 1 0 사용, overflow-hidden 제거 */}
      <div className="flex flex-col h-full" style={{ flex: '1 1 0', minHeight: 0, height: '100%' }}>
        <Tabs value={activeProcessId} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0 h-full">
          <div className="px-3 sm:px-4 pt-2 pb-3 flex-shrink-0" style={{ flexShrink: 0 }}>
            <TabsList className="w-full h-auto flex-wrap gap-1">
              {sortedProcesses.map((process) => {
                const processFiles = getFilesByProcess(process.id);
                return (
                  <TabsTrigger
                    key={process.id}
                    value={process.id}
                    className={`flex items-center gap-1.5 transition-colors flex-none ${
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

          {/* TabsContent 대신 직접 렌더링하여 높이 제약 문제 해결 */}
          {/* 활성 탭만 렌더링하되 높이 제약을 명확히 전달 */}
          {sortedProcesses.map((process) => {
            const processFiles = getFilesByProcess(process.id);
            const processUploadingFiles = uploadingFiles[process.id] || [];
            const processProgress = uploadProgress[process.id] || {};
            const isActive = selectedProcess?.id === process.id;

            if (!isActive) return null;

            // 페이지네이션 적용
            const totalFiles = processFiles.length;
            const totalPages = Math.ceil(totalFiles / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedFiles = processFiles.slice(startIndex, endIndex);

            return (
              <div
                key={process.id}
                data-process-id={process.id}
                className="flex-1 flex flex-col min-h-0"
                style={{ flex: '1 1 0', minHeight: 0 }}
              >
                {/* 페이지네이션 컨트롤 (상단) */}
                {totalPages > 1 && (
                  <div className="px-3 sm:px-6 py-2 flex items-center justify-between border-b bg-muted/30 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">
                      총 {totalFiles}개 중 {startIndex + 1}-{Math.min(endIndex, totalFiles)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        처음
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        이전
                      </Button>
                      <span className="px-2 text-sm">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        다음
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        마지막
                      </Button>
                    </div>
                  </div>
                )}
                
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                  <ProcessFileSection
                    process={process}
                    files={paginatedFiles}
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
                    loading={loading}
                    derivedCounts={derivedCounts}
                    onDerivedClick={handleDerivedClick}
                  />
                </div>
              </div>
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

      {/* 파일 상세 정보 Dialog */}
      <FileDetailDialog
        file={fileToView}
        open={detailDialogOpen}
        onOpenChange={handleDetailDialogClose}
        onImageViewerOpen={handleImageViewerOpen}
        onDownload={handleDownload}
        onAnalyze={canUpload ? handleAnalyzeClick : undefined}
        onDelete={handleDeleteClick}
        onRegenerateClick={() => {
          if (fileToView) {
            router.push(`/files/${fileToView.id}/regenerate`);
          }
        }}
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
            updateProcessInUrl(processId);
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

      {/* 파생 이미지 다이얼로그 */}
      <DerivedImagesDialog
        open={derivedDialogOpen}
        onOpenChange={(open) => {
          setDerivedDialogOpen(open);
          if (!open) {
            setDerivedSourceFile(null);
          }
        }}
        sourceFileId={derivedSourceFile?.id || null}
        sourceFileName={derivedSourceFile?.file_name}
        sourceFileUrl={derivedSourceFile?.file_path?.startsWith('http') 
          ? derivedSourceFile.file_path 
          : derivedSourceFile?.file_path?.startsWith('/') 
            ? derivedSourceFile.file_path 
            : derivedSourceFile?.file_path 
              ? `https://${derivedSourceFile.file_path}`
              : undefined}
      />
    </>
  );
}
