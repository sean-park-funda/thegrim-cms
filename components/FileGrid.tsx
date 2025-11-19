'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getFilesByCut, uploadFile, deleteFile, updateFile, analyzeImage, getThumbnailUrl } from '@/lib/api/files';
import { getProcesses } from '@/lib/api/processes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileIcon, Download, Trash2, Upload, Plus, Edit, Sparkles, Calendar, HardDrive, Wand2, RefreshCw, ZoomIn, ZoomOut, Search, X, CheckSquare2 } from 'lucide-react';
import { format } from 'date-fns';
import { File as FileType } from '@/lib/supabase';
import Image from 'next/image';
import { useDropzone } from 'react-dropzone';
import { canUploadFile, canDeleteFile } from '@/lib/utils/permissions';
import { cn } from '@/lib/utils';

export function FileGrid() {
  const { selectedCut, processes, setProcesses, profile } = useStore();
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<FileType[]>([]);
  const [loading, setLoading] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
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
  const [pendingAnalysisFiles, setPendingAnalysisFiles] = useState<Set<string>>(new Set());
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [fileToView, setFileToView] = useState<FileType | null>(null);
  const [styleSelectionOpen, setStyleSelectionOpen] = useState(false);
  const [regeneratingImage, setRegeneratingImage] = useState<string | null>(null);
  const [regeneratedImages, setRegeneratedImages] = useState<Array<{ id: string; url: string; prompt: string; selected: boolean; base64Data: string; mimeType: string }>>([]);
  const [generationCount, setGenerationCount] = useState<number>(2);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageZoom, setImageZoom] = useState(100);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [viewingImageName, setViewingImageName] = useState<string>('');
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStart, setPinchStart] = useState<{ distance: number; zoom: number } | null>(null);
  const [isPinching, setIsPinching] = useState(false);
  const imageViewerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const isPinchingRef = useRef(false);
  const imageZoomRef = useRef(100);
  const imagePositionRef = useRef({ x: 0, y: 0 });

  // 스타일 옵션 정의
  const styleOptions = [
    { id: 'berserk', name: '괴수디테일', prompt: 'Redraw this image in Berserk manga style with dense lines, adding detailed monster (괴수) or creature features. Even if the original is a rough sketch or simple drawing, enhance and transform it into a detailed monster with intricate details' },
    { id: 'grayscale', name: '채색 빼기(흑백으로 만들기)', prompt: 'Remove the color from this image and convert it to grayscale' },
    { id: 'remove-background', name: '배경 지우기', prompt: 'Remove the background from this image and make it transparent' },
  ];

  // 베르세르크 스타일 변형 키워드
  const berserkVariationKeywords = {
    lighting: [
      'extreme chiaroscuro',
      'dramatic lighting',
      'high contrast',
      'deep shadows',
      'intense highlights',
    ],
    detail: [
      'highly detailed',
      'intricate details',
      'fine linework',
      'meticulous rendering',
      'precise linework',
    ],
    hatching: [
      'cross-hatching',
      'dense cross-hatching',
      'fine hatching',
      'hatching techniques',
      'intricate hatching',
    ],
    linework: [
      'tight linework',
      'precise lines',
      'intricate linework',
      'fine lines',
    ],
    tone: [
      'dark tones',
      'moody atmosphere',
      'gritty texture',
      'atmospheric depth',
    ],
  };

  // 프롬프트 변형 생성 함수
  const generateVariedPrompt = (basePrompt: string, styleId: string): string => {
    // 베르세르크 스타일인 경우에만 변형 적용
    if (styleId !== 'berserk') {
      return basePrompt;
    }

    // 랜덤하게 2-3개의 키워드 선택
    const numKeywords = 2 + Math.floor(Math.random() * 2); // 2 또는 3
    const selectedKeywords: string[] = [];

    // 각 카테고리에서 최대 1개씩 선택
    const categories = Object.keys(berserkVariationKeywords) as Array<keyof typeof berserkVariationKeywords>;
    const shuffledCategories = [...categories].sort(() => Math.random() - 0.5);

    for (const category of shuffledCategories) {
      if (selectedKeywords.length >= numKeywords) break;
      
      const keywords = berserkVariationKeywords[category];
      const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
      
      if (!selectedKeywords.includes(randomKeyword)) {
        selectedKeywords.push(randomKeyword);
      }
    }

    // 선택된 키워드를 프롬프트에 추가
    if (selectedKeywords.length > 0) {
      const keywordsString = selectedKeywords.join(', ');
      return `${basePrompt}, ${keywordsString}`;
    }

    return basePrompt;
  };

  const loadProcesses = useCallback(async () => {
    try {
      const data = await getProcesses();
      setProcesses(data);
    } catch (error) {
      console.error('공정 목록 로드 실패:', error);
    }
  }, [setProcesses]);

  const loadFiles = useCallback(async () => {
    if (!selectedCut) return;

    try {
      setLoading(true);
      setImageErrors(new Set()); // 파일 로드 시 이미지 에러 상태 초기화
      const data = await getFilesByCut(selectedCut.id);
      setFiles(data);

      // 이미지 파일들의 썸네일 URL 가져오기 (비동기)
      const imageFiles = data.filter(f => f.file_type === 'image');
      const thumbnailUrlPromises = imageFiles.map(async (file) => {
        try {
          const thumbnailUrl = await getThumbnailUrl(file);
          return { fileId: file.id, thumbnailUrl };
        } catch (error) {
          console.error(`썸네일 URL 가져오기 실패 (${file.id}):`, error);
          return null;
        }
      });

      const thumbnailResults = await Promise.all(thumbnailUrlPromises);
      const thumbnailUrlMap: Record<string, string> = {};
      thumbnailResults.forEach((result) => {
        if (result) {
          thumbnailUrlMap[result.fileId] = result.thumbnailUrl;
        }
      });
      setThumbnailUrls(thumbnailUrlMap);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
      setImageErrors(new Set());
    } finally {
      setLoading(false);
    }
  }, [selectedCut]);

  useEffect(() => {
    loadProcesses();
  }, [loadProcesses]);

  useEffect(() => {
    if (selectedCut) {
      loadFiles();
    } else {
      setFiles([]);
      setThumbnailUrls({});
    }
    // 컷이 변경되면 대기 목록 초기화
    setPendingAnalysisFiles(new Set());
  }, [selectedCut, loadFiles]);

  // Dialog가 닫힐 때 Blob URL 정리
  useEffect(() => {
    return () => {
      regeneratedImages.forEach((img) => {
        URL.revokeObjectURL(img.url);
      });
    };
  }, [regeneratedImages]);

  // ref를 상태와 동기화
  useEffect(() => {
    touchStartRef.current = touchStart;
    pinchStartRef.current = pinchStart;
    isPinchingRef.current = isPinching;
    imageZoomRef.current = imageZoom;
    imagePositionRef.current = imagePosition;
  }, [touchStart, pinchStart, isPinching, imageZoom, imagePosition]);

  // 이미지 뷰어 터치 이벤트 핸들러 (non-passive)
  useEffect(() => {
    const container = imageViewerRef.current;
    if (!container || !imageViewerOpen) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touches = e.touches;
      
      if (touches.length === 1) {
        // 한 손가락: 드래그 시작
        if (imageZoomRef.current > 100) {
          const touch = touches[0];
          const newTouchStart = {
            x: touch.clientX - imagePositionRef.current.x,
            y: touch.clientY - imagePositionRef.current.y
          };
          touchStartRef.current = newTouchStart;
          setTouchStart(newTouchStart);
          setIsDragging(true);
        }
      } else if (touches.length === 2) {
        // 두 손가락: 핀치 줌 시작
        const touch1 = touches[0];
        const touch2 = touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        const newPinchStart = {
          distance,
          zoom: imageZoomRef.current
        };
        pinchStartRef.current = newPinchStart;
        setPinchStart(newPinchStart);
        setIsPinching(true);
        setIsDragging(false);
        touchStartRef.current = null;
        setTouchStart(null);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touches = e.touches;
      const currentTouchStart = touchStartRef.current;
      const currentPinchStart = pinchStartRef.current;
      const currentIsPinching = isPinchingRef.current;
      const currentZoom = imageZoomRef.current;
      
      if (touches.length === 1 && currentTouchStart && currentZoom > 100 && !currentIsPinching) {
        // 한 손가락: 드래그
        const touch = touches[0];
        const newX = touch.clientX - currentTouchStart.x;
        const newY = touch.clientY - currentTouchStart.y;
        
        // 이미지 크기와 컨테이너 크기를 고려한 제한
        const containerRect = container.getBoundingClientRect();
        const imgElement = container.querySelector('img');
        if (imgElement) {
          const imgRect = imgElement.getBoundingClientRect();
          const scaledWidth = imgRect.width;
          const scaledHeight = imgRect.height;
          
          let finalX = newX;
          let finalY = newY;
          
          // 이미지가 컨테이너보다 크면 드래그 가능
          if (scaledWidth > containerRect.width) {
            const maxX = (scaledWidth - containerRect.width) / 2;
            const minX = -maxX;
            finalX = Math.max(minX, Math.min(maxX, newX));
          } else {
            finalX = 0;
          }
          
          if (scaledHeight > containerRect.height) {
            const maxY = (scaledHeight - containerRect.height) / 2;
            const minY = -maxY;
            finalY = Math.max(minY, Math.min(maxY, newY));
          } else {
            finalY = 0;
          }
          
          const newPosition = { x: finalX, y: finalY };
          imagePositionRef.current = newPosition;
          setImagePosition(newPosition);
        }
      } else if (touches.length === 2 && currentPinchStart) {
        // 두 손가락: 핀치 줌
        const touch1 = touches[0];
        const touch2 = touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        
        const zoomChange = distance / currentPinchStart.distance;
        const newZoom = Math.max(25, Math.min(400, currentPinchStart.zoom * zoomChange));
        imageZoomRef.current = newZoom;
        setImageZoom(newZoom);
        
        // 줌이 100% 이하로 내려가면 위치 초기화
        if (newZoom <= 100) {
          const zeroPosition = { x: 0, y: 0 };
          imagePositionRef.current = zeroPosition;
          setImagePosition(zeroPosition);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const touches = e.touches;
      const currentIsPinching = isPinchingRef.current;
      const currentZoom = imageZoomRef.current;
      
      if (touches.length === 0) {
        // 모든 손가락이 떼어짐
        setIsDragging(false);
        setIsPinching(false);
        touchStartRef.current = null;
        pinchStartRef.current = null;
        setTouchStart(null);
        setPinchStart(null);
      } else if (touches.length === 1 && currentIsPinching) {
        // 핀치 줌 중 한 손가락만 남음 -> 드래그로 전환
        setIsPinching(false);
        isPinchingRef.current = false;
        pinchStartRef.current = null;
        setPinchStart(null);
        const touch = touches[0];
        const newTouchStart = {
          x: touch.clientX - imagePositionRef.current.x,
          y: touch.clientY - imagePositionRef.current.y
        };
        touchStartRef.current = newTouchStart;
        setTouchStart(newTouchStart);
        if (currentZoom > 100) {
          setIsDragging(true);
        }
      }
    };

    // non-passive 이벤트 리스너 등록
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [imageViewerOpen]);

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
  }, [selectedCut, pendingAnalysisFiles, loadFiles]);

  const getFilesByProcess = (processId: string) => {
    return files.filter(file => file.process_id === processId);
  };

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
  }, [selectedCut, loadFiles]);

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

  const handleRegenerateImage = async (stylePrompt: string, count?: number) => {
    if (!fileToView || fileToView.file_type !== 'image') return;

    try {
      setRegeneratingImage(fileToView.id);
      const regenerateCount = count ?? generationCount;
      
      // count가 지정되지 않았으면 (새로 생성하는 경우) 기존 이미지 초기화
      if (count === undefined) {
        setRegeneratedImages([]);
        setSelectedImageIds(new Set());
        setStyleSelectionOpen(false);
      }

      const imageUrl = fileToView.file_path?.startsWith('http')
        ? fileToView.file_path
        : fileToView.file_path?.startsWith('/')
          ? fileToView.file_path
          : `https://${fileToView.file_path}`;

      const newImages: Array<{ id: string; url: string; prompt: string; selected: boolean; base64Data: string; mimeType: string }> = [];

      // 생성 개수만큼 반복하여 API 호출
      for (let i = 0; i < regenerateCount; i++) {
        // 스타일 ID 찾기 (베르세르크 변형을 위해)
        const styleOption = styleOptions.find(opt => opt.prompt === stylePrompt);
        const styleId = styleOption?.id || '';
        
        // 변형된 프롬프트 생성 (여러 장 생성 시 각각 다른 변형 적용)
        const variedPrompt = regenerateCount > 1 
          ? generateVariedPrompt(stylePrompt, styleId)
          : stylePrompt;

        const response = await fetch('/api/regenerate-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrl,
            stylePrompt: variedPrompt,
            index: i, // 홀수는 Gemini, 짝수는 Seedream
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `이미지 재생성에 실패했습니다. (${i + 1}/${regenerateCount})`);
        }

        const data = await response.json();
        const { imageData, mimeType } = data;

        // base64 데이터를 Blob URL로 변환
        const byteCharacters = atob(imageData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let j = 0; j < byteCharacters.length; j++) {
          byteNumbers[j] = byteCharacters.charCodeAt(j);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType || 'image/png' });
        const imageUrl_new = URL.createObjectURL(blob);

        // 고유한 ID 생성 (타임스탬프 + 인덱스 + 랜덤)
        const imageId = `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`;
        newImages.push({
          id: imageId,
          url: imageUrl_new,
          prompt: variedPrompt, // 변형된 프롬프트 저장
          selected: false,
          base64Data: imageData,
          mimeType: mimeType || 'image/png',
        });

        // 진행 상태 업데이트를 위해 중간 결과도 반영
        if (count === undefined) {
          // 새로 생성하는 경우에만 중간 결과 반영 (함수형 업데이트로 최신 상태 보장)
          setRegeneratedImages(prev => {
            // 기존 이미지 중 현재 생성 중인 이미지들을 제외하고 새 이미지 추가
            const existingIds = new Set(newImages.map(img => img.id));
            const filtered = prev.filter(img => !existingIds.has(img.id));
            return [...filtered, ...newImages];
          });
        }
      }

      // count가 지정된 경우 (다시그리기) 기존 배열에 추가, 아니면 새로 설정
      if (count !== undefined) {
        setRegeneratedImages(prev => [...prev, ...newImages]);
      } else {
        // 모든 이미지 생성 완료 후 최종 상태 설정
        setRegeneratedImages(newImages);
      }
    } catch (error: unknown) {
      console.error('이미지 재생성 실패:', error);
      const errorMessage = error instanceof Error ? error.message : '이미지 재생성에 실패했습니다.';
      alert(errorMessage);
    } finally {
      setRegeneratingImage(null);
    }
  };


  const handleSaveRegeneratedImage = async () => {
    console.log('[이미지 등록] 함수 호출됨', {
      selectedImageIdsSize: selectedImageIds.size,
      selectedImageIds: Array.from(selectedImageIds),
      fileToView: !!fileToView,
      selectedCut: !!selectedCut,
      regeneratedImagesCount: regeneratedImages.length,
      regeneratedImageIds: regeneratedImages.map(img => img.id)
    });

    if (selectedImageIds.size === 0 || !fileToView || !selectedCut) {
      console.warn('[이미지 등록] 조건 불만족으로 중단', {
        selectedImageIdsSize: selectedImageIds.size,
        fileToView: !!fileToView,
        selectedCut: !!selectedCut
      });
      return;
    }

    try {
      const selectedImages = regeneratedImages.filter(img => selectedImageIds.has(img.id));
      
      console.log('[이미지 등록] 선택된 이미지 필터링 결과', {
        selectedImagesCount: selectedImages.length,
        selectedImageIds: Array.from(selectedImageIds),
        regeneratedImageIds: regeneratedImages.map(img => img.id),
        matchedImages: selectedImages.map(img => img.id)
      });
      
      // 디버깅: 선택된 이미지가 없는 경우 확인
      if (selectedImages.length === 0) {
        console.error('[이미지 등록] 선택된 이미지를 찾을 수 없습니다.', {
          selectedImageIds: Array.from(selectedImageIds),
          regeneratedImages: regeneratedImages.map(img => img.id),
          regeneratedImagesCount: regeneratedImages.length
        });
        alert('선택된 이미지를 찾을 수 없습니다. 다시 선택해주세요.');
        return;
      }
      
      // 선택된 이미지들을 순차적으로 업로드
      for (const img of selectedImages) {
        // base64 데이터를 Blob으로 변환
        const byteCharacters = atob(img.base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: img.mimeType });

        // 원본 파일명에서 확장자 추출
        const originalFileName = fileToView.file_name;
        const fileExtension = originalFileName.substring(originalFileName.lastIndexOf('.'));
        const baseFileName = originalFileName.replace(fileExtension, '');
        const timestamp = Date.now();
        const newFileName = `regenerated-${baseFileName}-${timestamp}${fileExtension}`;

        // Blob을 File 객체로 변환
        const file = new File([blob], newFileName, { type: img.mimeType });

        // 원본 파일과 같은 공정에 업로드
        await uploadFile(file, selectedCut.id, fileToView.process_id, `AI 재생성: ${fileToView.file_name}`);
      }

      // 파일 목록 새로고침
      await loadFiles();

      // 선택된 이미지 ID 초기화
      setSelectedImageIds(new Set());

      alert(`${selectedImages.length}개의 재생성된 이미지가 파일로 등록되었습니다.`);
    } catch (error) {
      console.error('재생성된 이미지 저장 실패:', error);
      alert('이미지 저장에 실패했습니다.');
    }
  };

  const renderFilePreview = (file: FileType) => {
    const isImage = file.file_type === 'image';
    const hasError = imageErrors.has(file.id);

    if (isImage && !hasError) {
      // 썸네일 URL 우선 사용, 없으면 원본 URL 사용
      const thumbnailUrl = thumbnailUrls[file.id];
      const fallbackUrl = file.file_path?.startsWith('http') 
        ? file.file_path 
        : file.file_path?.startsWith('/') 
          ? file.file_path 
          : `https://${file.file_path}`;
      const imageUrl = thumbnailUrl || fallbackUrl;

      return (
        <div className="relative w-full h-40 sm:h-48 bg-muted rounded-md overflow-hidden">
          <Image 
            src={imageUrl} 
            alt={file.file_name} 
            fill 
            className="object-cover" 
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized={true}
            onError={() => {
              console.error('이미지 로딩 실패:', imageUrl, file.id);
              // 썸네일 로딩 실패 시 원본으로 fallback
              if (thumbnailUrl && imageUrl === thumbnailUrl) {
                const originalUrl = file.file_path?.startsWith('http') 
                  ? file.file_path 
                  : file.file_path?.startsWith('/') 
                    ? file.file_path 
                    : `https://${file.file_path}`;
                setThumbnailUrls(prev => ({ ...prev, [file.id]: originalUrl }));
              } else {
                setImageErrors(prev => new Set(prev).add(file.id));
              }
            }}
          />
        </div>
      );
    }

    return (
      <div className="w-full h-40 sm:h-48 bg-muted rounded-md flex items-center justify-center">
        <FileIcon className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground" />
      </div>
    );
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

  return (
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

            const ProcessDropzone = ({ children }: { children: (open: () => void) => React.ReactNode }) => {
              const canUpload = profile && canUploadFile(profile.role);
              
              const onDrop = (acceptedFiles: globalThis.File[]) => {
                if (!canUpload) return;
                handleFileUpload(acceptedFiles, process.id);
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
              <Card key={process.id}>
                <CardHeader className="p-3 sm:p-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: process.color }} />
                    <CardTitle className="text-sm sm:text-base">{process.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">{processFiles.length}개</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-3 sm:p-6">
                  <ProcessDropzone>
                    {(open) => (
                      <>
                        {processUploadingFiles.length > 0 && (
                          <div className="mb-3 sm:mb-4 space-y-2 p-3 sm:p-4 bg-muted rounded-lg">
                            <p className="text-xs sm:text-sm font-medium mb-2">업로드 중...</p>
                            {processUploadingFiles.map((file: globalThis.File) => (
                              <div key={file.name} className="space-y-1">
                                <div className="flex items-center justify-between text-xs sm:text-sm">
                                  <span className="truncate flex-1">{file.name}</span>
                                  <span className="text-muted-foreground ml-2">
                                    {processProgress[file.name] || 0}%
                                  </span>
                                </div>
                                <div className="w-full bg-background rounded-full h-2">
                                  <div
                                    className="bg-primary h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${processProgress[file.name] || 0}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {processFiles.length === 0 ? (
                          <div className="py-8 sm:py-12 text-center border-2 border-dashed border-muted-foreground/25 rounded-lg">
                            {profile && canUploadFile(profile.role) ? (
                              <>
                                <Upload className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 text-muted-foreground opacity-50" />
                                <p className="text-xs sm:text-sm text-muted-foreground mb-1">파일을 드래그하여 업로드</p>
                                <p className="text-xs text-muted-foreground">또는 클릭하여 파일 선택</p>
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
                            {profile && canUploadFile(profile.role) && (
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
                                  <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">파일 추가</p>
                                </div>
                              </Card>
                            )}
                            {processFiles.map((file: FileType) => {
                              const metadata = file.metadata as {
                                scene_summary?: string;
                                tags?: string[];
                                characters_count?: number;
                              } | undefined;
                              const hasMetadata = metadata && metadata.scene_summary && metadata.tags;
                              const isAnalyzing = analyzingFiles.has(file.id);
                              const isPendingAnalysis = pendingAnalysisFiles.has(file.id);

                              return (
                                <Card 
                                  key={file.id} 
                                  className="overflow-hidden p-0 hover:shadow-md transition-all duration-200 ease-in-out cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFileToView(file);
                                    setImageDimensions(null); // 파일 변경 시 이미지 크기 초기화
                                    setDetailDialogOpen(true);
                                  }}
                                >
                                  {renderFilePreview(file)}
                                  <div className="p-2 sm:p-3">
                                    <p className="text-xs sm:text-sm font-medium truncate">{file.file_name}</p>
                                    {file.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{file.description}</p>
                                    )}
                                    {hasMetadata && (
                                      <div className="mt-2 space-y-2">
                                        {metadata.scene_summary && (
                                          <p className="text-xs text-muted-foreground line-clamp-2">{metadata.scene_summary}</p>
                                        )}
                                        {metadata.tags && metadata.tags.length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            {metadata.tags.slice(0, 5).map((tag, idx) => (
                                              <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                                                {tag}
                                              </Badge>
                                            ))}
                                            {metadata.tags.length > 5 && (
                                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                                +{metadata.tags.length - 5}
                                              </Badge>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {!hasMetadata && file.file_type === 'image' && (
                                      <div className="mt-1 flex items-center gap-1">
                                        {isPendingAnalysis ? (
                                          <>
                                            <Sparkles className="h-3 w-3 animate-pulse text-primary" />
                                            <p className="text-xs text-muted-foreground">메타데이터 생성 중...</p>
                                          </>
                                        ) : (
                                          <p className="text-xs text-muted-foreground">메타데이터 없음</p>
                                        )}
                                      </div>
                                    )}
                                    <div className="flex gap-1.5 sm:gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                                      <Button size="sm" variant="ghost" className="h-8 sm:h-7 px-2 flex-1 touch-manipulation" onClick={(e) => handleDownload(file, e)}>
                                        <Download className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                                      </Button>
                                      {file.file_type === 'image' && profile && canUploadFile(profile.role) && (
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="h-8 sm:h-7 px-2 flex-1 touch-manipulation" 
                                          onClick={(e) => handleAnalyzeClick(file, e)}
                                          disabled={isAnalyzing}
                                        >
                                          <Sparkles className={`h-3.5 w-3.5 sm:h-3 sm:w-3 ${isAnalyzing ? 'animate-pulse' : ''}`} />
                                        </Button>
                                      )}
                                      {profile && canUploadFile(profile.role) && (!file.description || file.description.trim() === '') && (
                                        <Button size="sm" variant="ghost" className="h-8 sm:h-7 px-2 flex-1 touch-manipulation" onClick={(e) => handleEditClick(file, e)}>
                                          <Edit className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                                        </Button>
                                      )}
                                      {profile && canDeleteFile(profile.role) && (
                                        <Button size="sm" variant="ghost" className="h-8 sm:h-7 px-2 flex-1 text-destructive hover:text-destructive touch-manipulation" onClick={(e) => handleDeleteClick(file, e)}>
                                          <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </Card>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </ProcessDropzone>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 파일 삭제 확인 Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>파일 삭제</DialogTitle>
            <DialogDescription>정말로 이 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</DialogDescription>
          </DialogHeader>
          {fileToDelete && (
            <div className="py-4">
              <p className="text-sm font-medium">{fileToDelete.file_name}</p>
              {fileToDelete.description && (
                <p className="text-sm text-muted-foreground mt-1">{fileToDelete.description}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? '삭제 중...' : '삭제'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파일 정보 수정 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>파일 정보 수정</DialogTitle>
            <DialogDescription>파일 설명을 입력하세요. (AI 자동 생성 전까지 수정 가능)</DialogDescription>
          </DialogHeader>
          {fileToEdit && (
            <div className="py-4 space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">파일명</p>
                <p className="text-sm text-muted-foreground">{fileToEdit.file_name}</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">
                  설명
                </label>
                <textarea
                  id="description"
                  className={cn(
                    "w-full min-h-[100px] px-3 py-2 text-sm border rounded-md resize-none",
                    "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
                    "bg-transparent shadow-xs transition-[color,box-shadow] outline-none",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="파일에 대한 설명을 입력하세요..."
                  disabled={editing}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditDialogOpen(false);
              setFileToEdit(null);
              setEditDescription('');
            }} disabled={editing}>
              취소
            </Button>
            <Button onClick={handleEditConfirm} disabled={editing}>
              {editing ? '수정 중...' : '수정'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 스타일 선택 Dialog */}
      <Dialog open={styleSelectionOpen} onOpenChange={setStyleSelectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스타일 선택</DialogTitle>
            <DialogDescription>이미지를 재생성할 스타일을 선택하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">한번에 몇 장을 그릴지</label>
              <Select value={generationCount.toString()} onValueChange={(value) => setGenerationCount(parseInt(value))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => (i + 1) * 2).map((count) => (
                    <SelectItem key={count} value={count.toString()}>
                      {count}장
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {styleOptions.map((style) => (
                <Button
                  key={style.id}
                  variant="outline"
                  className="h-auto py-3 flex flex-col items-center gap-2"
                  onClick={() => handleRegenerateImage(style.prompt)}
                  disabled={regeneratingImage !== null}
                >
                  <span className="text-sm font-medium">{style.name}</span>
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStyleSelectionOpen(false)} disabled={regeneratingImage !== null}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파일 상세 정보 Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => {
        setDetailDialogOpen(open);
        if (!open) {
          // Blob URL 정리
          regeneratedImages.forEach((img) => {
            URL.revokeObjectURL(img.url);
          });
          setRegeneratedImages([]);
          setSelectedImageIds(new Set());
          setImageDimensions(null);
          setImageViewerOpen(false); // 파일 상세 닫을 때 이미지 뷰어도 닫기
          setImageZoom(100); // 줌 초기화
          setViewingImageUrl(null);
          setViewingImageName('');
        }
      }}>
        <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[95vh] !max-h-[95vh] !top-[2.5vh] !left-[2.5vw] !translate-x-0 !translate-y-0 !sm:max-w-[95vw] overflow-y-auto p-6">
          {fileToView && (
            <>
              <DialogTitle asChild>
                <h2 className="text-xl font-semibold break-words mb-0">{fileToView.file_name}</h2>
              </DialogTitle>
              <div className="space-y-6">
              {/* 파일 미리보기 */}
              <div className="w-full">
                {fileToView.file_type === 'image' && !imageErrors.has(fileToView.id) ? (
                  <div className="relative w-full h-[60vh] min-h-[400px] bg-muted rounded-md overflow-hidden group cursor-pointer" onClick={() => {
                    const imageUrl = fileToView.file_path?.startsWith('http')
                      ? fileToView.file_path
                      : fileToView.file_path?.startsWith('/')
                        ? fileToView.file_path
                        : `https://${fileToView.file_path}`;
                    setViewingImageUrl(imageUrl);
                    setViewingImageName(fileToView.file_name);
                    setImageViewerOpen(true);
                  }}>
                    <Image 
                      src={fileToView.file_path?.startsWith('http') 
                        ? fileToView.file_path 
                        : fileToView.file_path?.startsWith('/') 
                          ? fileToView.file_path 
                          : `https://${fileToView.file_path}`} 
                      alt={fileToView.file_name} 
                      fill 
                      className="object-contain" 
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                      unoptimized={true}
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth && img.naturalHeight) {
                          setImageDimensions({
                            width: img.naturalWidth,
                            height: img.naturalHeight
                          });
                        }
                      }}
                      onError={() => {
                        console.error('이미지 로딩 실패:', fileToView.file_path);
                        setImageErrors(prev => new Set(prev).add(fileToView.id));
                        setImageDimensions(null);
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-3">
                        <Search className="h-6 w-6 text-white" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-[60vh] min-h-[400px] bg-muted rounded-md flex items-center justify-center">
                    <div className="text-center">
                      <FileIcon className="h-16 w-16 text-muted-foreground mx-auto mb-2" />
                      {fileToView.file_type === 'image' && (
                        <p className="text-sm text-muted-foreground">이미지를 불러올 수 없습니다</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 기본 정보 및 메타데이터 */}
              <div className="flex flex-col md:flex-row gap-4">
                {/* 기본 정보 카드 */}
                <Card className="flex-1">
                  <CardHeader>
                    <CardTitle className="text-base">기본 정보</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">파일명</span>
                      <span className="text-sm font-medium text-right flex-1 ml-4 break-words">{fileToView.file_name}</span>
                    </div>
                    {fileToView.file_size && (
                      <div className="flex items-start justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          파일 크기
                        </span>
                        <span className="text-sm font-medium text-right flex-1 ml-4">
                          {(fileToView.file_size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    )}
                    {fileToView.mime_type && (
                      <div className="flex items-start justify-between">
                        <span className="text-sm text-muted-foreground">MIME 타입</span>
                        <span className="text-sm font-medium text-right flex-1 ml-4 break-words">{fileToView.mime_type}</span>
                      </div>
                    )}
                    {fileToView.file_type === 'image' && imageDimensions && (
                      <div className="flex items-start justify-between">
                        <span className="text-sm text-muted-foreground">이미지 사이즈</span>
                        <span className="text-sm font-medium text-right flex-1 ml-4">
                          {imageDimensions.width} × {imageDimensions.height} px
                        </span>
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        생성일
                      </span>
                      <span className="text-sm font-medium text-right flex-1 ml-4">
                        {format(new Date(fileToView.created_at), 'yyyy년 MM월 dd일 HH:mm')}
                      </span>
                    </div>
                    {fileToView.description && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-1">설명</p>
                        <p className="text-sm">{fileToView.description}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 메타데이터 카드 */}
                {fileToView.file_type === 'image' && (
                  <Card className="flex-1">
                    <CardHeader>
                      <CardTitle className="text-base">메타데이터</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const metadata = fileToView.metadata as {
                          scene_summary?: string;
                          tags?: string[];
                          characters_count?: number;
                          analyzed_at?: string;
                        } | undefined;
                        
                        if (metadata && metadata.scene_summary && metadata.tags) {
                          return (
                            <div className="space-y-3">
                              {metadata.scene_summary && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">장면 요약</p>
                                  <p className="text-sm">{metadata.scene_summary}</p>
                                </div>
                              )}
                              {metadata.tags && metadata.tags.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-2">태그</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {metadata.tags.map((tag, idx) => (
                                      <Badge key={idx} variant="secondary" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {typeof metadata.characters_count === 'number' && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">등장 인물 수</p>
                                  <p className="text-sm">{metadata.characters_count}명</p>
                                </div>
                              )}
                              {metadata.analyzed_at && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">분석 일시</p>
                                  <p className="text-sm">
                                    {format(new Date(metadata.analyzed_at), 'yyyy년 MM월 dd일 HH:mm')}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        } else {
                          return (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Sparkles className="h-4 w-4" />
                              <span>메타데이터가 없습니다. 분석 버튼을 눌러 생성하세요.</span>
                            </div>
                          );
                        }
                      })()}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* 재생성된 이미지 표시 */}
              {regeneratedImages.length > 0 && (
                <div className="w-full space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">재생성된 이미지 ({regeneratedImages.length}장)</h3>
                    <div className="flex gap-2">
                      {profile && canUploadFile(profile.role) && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedImageIds.size === regeneratedImages.length) {
                                // 모두 선택되어 있으면 모두 해제
                                setSelectedImageIds(new Set());
                              } else {
                                // 모두 선택
                                setSelectedImageIds(new Set(regeneratedImages.map(img => img.id)));
                              }
                            }}
                            title={selectedImageIds.size === regeneratedImages.length ? '전체 선택 해제' : '전체 선택'}
                          >
                            <CheckSquare2 className="h-3 w-3 mr-1" />
                            {selectedImageIds.size === regeneratedImages.length ? '전체 해제' : '전체 선택'}
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={(e) => {
                              console.log('[버튼] 클릭 이벤트 발생', {
                                selectedImageIdsSize: selectedImageIds.size,
                                selectedImageIds: Array.from(selectedImageIds),
                                disabled: selectedImageIds.size === 0
                              });
                              e.stopPropagation();
                              handleSaveRegeneratedImage();
                            }}
                            disabled={selectedImageIds.size === 0}
                          >
                            <Upload className="h-3 w-3 mr-1" />
                            선택한 이미지 등록 ({selectedImageIds.size})
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {regeneratedImages.map((img) => (
                      <div key={img.id} className="relative space-y-2">
                        <div 
                          className="relative w-full aspect-square bg-muted rounded-md overflow-hidden group cursor-pointer"
                          onClick={() => {
                            setViewingImageUrl(img.url);
                            setViewingImageName(`재생성된 이미지 - ${fileToView?.file_name || '이미지'}`);
                            setImageViewerOpen(true);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedImageIds.has(img.id)}
                            onChange={(e) => {
                              console.log('[체크박스] 변경 이벤트', {
                                imageId: img.id,
                                checked: e.target.checked,
                                currentSelected: Array.from(selectedImageIds)
                              });
                              const newSelected = new Set(selectedImageIds);
                              if (e.target.checked) {
                                newSelected.add(img.id);
                              } else {
                                newSelected.delete(img.id);
                              }
                              console.log('[체크박스] 업데이트된 선택', {
                                newSelected: Array.from(newSelected),
                                size: newSelected.size
                              });
                              setSelectedImageIds(newSelected);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-2 left-2 z-10 w-5 h-5 cursor-pointer"
                          />
                          <Button
                            size="icon"
                            variant="secondary"
                            className={cn(
                              "absolute top-2 right-2 z-10 h-8 w-8",
                              regeneratingImage === fileToView?.id && 'overflow-hidden bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 bg-[length:200%_100%] animate-shimmer'
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRegenerateImage(img.prompt, 1);
                            }}
                            disabled={regeneratingImage === fileToView?.id}
                          >
                            <RefreshCw className={cn(
                              "h-4 w-4",
                              regeneratingImage === fileToView?.id && 'animate-spin'
                            )} />
                          </Button>
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                              <Search className="h-5 w-5 text-white" />
                            </div>
                          </div>
                          <Image
                            src={img.url}
                            alt="재생성된 이미지"
                            fill
                            className="object-contain"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            unoptimized={true}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              try {
                                const a = document.createElement('a');
                                a.href = img.url;
                                a.download = `regenerated-${fileToView?.file_name || 'image'}`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                              } catch (error) {
                                console.error('재생성된 이미지 다운로드 실패:', error);
                                alert('이미지 다운로드에 실패했습니다.');
                              }
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            다운로드
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="flex gap-2 pt-4 border-t flex-wrap">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(fileToView, e);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  다운로드
                </Button>
                {fileToView.file_type === 'image' && profile && canUploadFile(profile.role) && (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailDialogOpen(false);
                        handleAnalyzeClick(fileToView, e);
                      }}
                      disabled={analyzingFiles.has(fileToView.id)}
                    >
                      <Sparkles className={`h-4 w-4 mr-2 ${analyzingFiles.has(fileToView.id) ? 'animate-pulse' : ''}`} />
                      {analyzingFiles.has(fileToView.id) ? '분석 중...' : '분석'}
                    </Button>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1",
                        regeneratingImage === fileToView.id && 'relative overflow-hidden bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 bg-[length:200%_100%] animate-shimmer'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStyleSelectionOpen(true);
                      }}
                      disabled={regeneratingImage === fileToView.id}
                    >
                      <Wand2 className={`h-4 w-4 mr-2 ${regeneratingImage === fileToView.id ? 'animate-pulse' : ''}`} />
                      {regeneratingImage === fileToView.id ? '재생성 중...' : 'AI 다시그리기'}
                    </Button>
                  </>
                )}
                {profile && canDeleteFile(profile.role) && (
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailDialogOpen(false);
                      handleDeleteClick(fileToView, e);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    삭제
                  </Button>
                )}
              </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 이미지 전체화면 뷰어 */}
      {viewingImageUrl && (
        <Dialog open={imageViewerOpen} onOpenChange={(open) => {
          setImageViewerOpen(open);
          if (!open) {
            setImageZoom(100); // 닫을 때 줌 초기화
            setImagePosition({ x: 0, y: 0 }); // 위치 초기화
            setIsDragging(false);
            setIsPinching(false);
            setTouchStart(null);
            setPinchStart(null);
            setViewingImageUrl(null);
            setViewingImageName('');
          }
        }}>
          <DialogContent className="!max-w-[100vw] !w-[100vw] !h-[100vh] !max-h-[100vh] !top-0 !left-0 !translate-x-0 !translate-y-0 !p-0 !border-0 !bg-black/95" showCloseButton={false}>
            <DialogTitle className="sr-only">이미지 전체화면 보기: {viewingImageName || '이미지'}</DialogTitle>
            <div className="relative w-full h-full flex items-center justify-center overflow-auto">
              {/* 닫기 버튼 */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-50 bg-black/50 hover:bg-black/70 text-white"
                onClick={() => {
                  setImageViewerOpen(false);
                  setImageZoom(100);
                  setImagePosition({ x: 0, y: 0 });
                  setIsDragging(false);
                  setIsPinching(false);
                  setTouchStart(null);
                  setPinchStart(null);
                  setViewingImageUrl(null);
                  setViewingImageName('');
                }}
              >
                <X className="h-5 w-5" />
              </Button>

              {/* 확대/축소 컨트롤 */}
              <div className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-black/50 rounded-lg p-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => {
                    const zoomSteps = [25, 50, 75, 100, 125, 150, 200, 300, 400];
                    const currentIndex = zoomSteps.findIndex(step => step >= imageZoom);
                    const newIndex = Math.max(0, currentIndex - 1);
                    const newZoom = zoomSteps[newIndex] || 100;
                    setImageZoom(newZoom);
                    if (newZoom <= 100) {
                      setImagePosition({ x: 0, y: 0 });
                    }
                  }}
                  disabled={imageZoom <= 25}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-white text-sm min-w-[60px] text-center">{Math.round(imageZoom)}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => {
                    const zoomSteps = [25, 50, 75, 100, 125, 150, 200, 300, 400];
                    const currentIndex = zoomSteps.findIndex(step => step >= imageZoom);
                    const newIndex = Math.min(zoomSteps.length - 1, currentIndex + 1);
                    setImageZoom(zoomSteps[newIndex] || 100);
                  }}
                  disabled={imageZoom >= 400}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/20 ml-2"
                  onClick={() => {
                    setImageZoom(100);
                    setImagePosition({ x: 0, y: 0 });
                    setIsPinching(false);
                    setPinchStart(null);
                  }}
                >
                  리셋
                </Button>
              </div>

              {/* 이미지 */}
              <div 
                ref={imageViewerRef}
                className="flex items-center justify-center w-full h-full p-4 overflow-hidden touch-none"
                onMouseDown={(e) => {
                  if (imageZoom > 100 && !isPinching) {
                    e.preventDefault();
                    setIsDragging(true);
                    setDragStart({
                      x: e.clientX - imagePosition.x,
                      y: e.clientY - imagePosition.y
                    });
                  }
                }}
                onMouseMove={(e) => {
                  if (isDragging && imageZoom > 100 && !isPinching) {
                    e.preventDefault();
                    const newX = e.clientX - dragStart.x;
                    const newY = e.clientY - dragStart.y;
                    
                    // 이미지 크기와 컨테이너 크기를 고려한 제한
                    const container = e.currentTarget;
                    const containerRect = container.getBoundingClientRect();
                    const imgElement = container.querySelector('img');
                    if (imgElement) {
                      const imgRect = imgElement.getBoundingClientRect();
                      const scaledWidth = imgRect.width;
                      const scaledHeight = imgRect.height;
                      
                      let finalX = newX;
                      let finalY = newY;
                      
                      // 이미지가 컨테이너보다 크면 드래그 가능
                      if (scaledWidth > containerRect.width) {
                        const maxX = (scaledWidth - containerRect.width) / 2;
                        const minX = -maxX;
                        finalX = Math.max(minX, Math.min(maxX, newX));
                      } else {
                        finalX = 0;
                      }
                      
                      if (scaledHeight > containerRect.height) {
                        const maxY = (scaledHeight - containerRect.height) / 2;
                        const minY = -maxY;
                        finalY = Math.max(minY, Math.min(maxY, newY));
                      } else {
                        finalY = 0;
                      }
                      
                      setImagePosition({ x: finalX, y: finalY });
                    }
                  }
                }}
                onMouseUp={() => {
                  setIsDragging(false);
                }}
                onMouseLeave={() => {
                  setIsDragging(false);
                }}
                style={{
                  cursor: imageZoom > 100 && !isPinching ? (isDragging ? 'grabbing' : 'grab') : 'default'
                }}
              >
                <div
                  className="relative"
                  style={{
                    transform: `scale(${imageZoom / 100}) translate(${imagePosition.x / (imageZoom / 100)}px, ${imagePosition.y / (imageZoom / 100)}px)`,
                    transformOrigin: 'center center',
                    transition: (isDragging || isPinching) ? 'none' : 'transform 0.2s ease-out',
                  }}
                >
                  <img
                    src={viewingImageUrl || ''}
                    alt={viewingImageName || '이미지'}
                    className="max-w-[90vw] max-h-[90vh] object-contain select-none pointer-events-none"
                    draggable={false}
                    style={{
                      maxWidth: '90vw',
                      maxHeight: '90vh',
                    }}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setImageDimensions({
                          width: img.naturalWidth,
                          height: img.naturalHeight
                        });
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ScrollArea>
  );
}


