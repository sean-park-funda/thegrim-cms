'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { getProcesses, createProcess, updateProcess, deleteProcess, reorderProcesses } from '@/lib/api/processes';
import { getFilesByProcess, getFileCountByProcess } from '@/lib/api/files';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, FileIcon, MoreVertical, Edit, Trash2, GripVertical, Download, Sparkles, Calendar, HardDrive } from 'lucide-react';
import { format } from 'date-fns';
import { analyzeImage, deleteFile, updateFile } from '@/lib/api/files';
import { canUploadFile, canDeleteFile } from '@/lib/utils/permissions';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Process, FileWithRelations } from '@/lib/supabase';
import Image from 'next/image';
import { canManageProcesses } from '@/lib/utils/permissions';

interface ProcessViewProps {
  initialProcesses?: Process[];
  processId?: string;
}

export function ProcessView({ initialProcesses, processId }: ProcessViewProps = {}) {
  const router = useRouter();
  const params = useParams();
  const { processes, setProcesses, profile } = useStore();
  const currentProcessId = processId || (params?.processId as string);
  const selectedProcess = processes.find(p => p.id === currentProcessId) || null;
  const [files, setFiles] = useState<FileWithRelations[]>([]);
  const [loading, setLoading] = useState(false);
  const [processesLoading, setProcessesLoading] = useState(true);
  const [processesError, setProcessesError] = useState<string | null>(null);
  const [processFileCounts, setProcessFileCounts] = useState<Record<string, number>>({});
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [fileToView, setFileToView] = useState<FileWithRelations | null>(null);
  const [fileEditDialogOpen, setFileEditDialogOpen] = useState(false);
  const [fileToEdit, setFileToEdit] = useState<FileWithRelations | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editing, setEditing] = useState(false);
  const [analyzingFiles, setAnalyzingFiles] = useState<Set<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<Process | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', color: '#3b82f6' });
  const [saving, setSaving] = useState(false);

  // 초기 공정 데이터 설정
  useEffect(() => {
    if (initialProcesses && initialProcesses.length > 0 && processes.length === 0) {
      setProcesses(initialProcesses);
    }
  }, [initialProcesses, setProcesses, processes.length]);

  const loadProcesses = useCallback(async () => {
    try {
      setProcessesLoading(true);
      setProcessesError(null);
      const data = await getProcesses();
      setProcesses(data);
      
      // 각 공정별 파일 개수 조회
      const counts: Record<string, number> = {};
      await Promise.all(
        data.map(async (process) => {
          try {
            const count = await getFileCountByProcess(process.id);
            counts[process.id] = count;
          } catch (error) {
            console.error(`공정 ${process.id} 파일 개수 조회 실패:`, error);
            counts[process.id] = 0;
          }
        })
      );
      setProcessFileCounts(counts);
    } catch (error) {
      console.error('공정 목록 로드 실패:', error);
      setProcessesError('공정 목록을 불러오는데 실패했습니다.');
    } finally {
      setProcessesLoading(false);
    }
  }, [setProcesses]);

  useEffect(() => {
    if (processes.length === 0 && !initialProcesses) {
      loadProcesses();
    }
  }, [loadProcesses, processes.length, initialProcesses]);

  const loadFiles = useCallback(async () => {
    if (!selectedProcess) return;

    try {
      setLoading(true);
      setImageErrors(new Set()); // 파일 로드 시 이미지 에러 상태 초기화
      const data = await getFilesByProcess(selectedProcess.id);
      setFiles(data);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
      setImageErrors(new Set());
    } finally {
      setLoading(false);
    }
  }, [selectedProcess]);

  useEffect(() => {
    if (selectedProcess) {
      loadFiles();
    } else {
      setFiles([]);
    }
  }, [selectedProcess, loadFiles]);

  const handleCreate = () => {
    setFormData({ name: '', description: '', color: '#3b82f6' });
    setEditingProcess(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (process: Process, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProcess(process);
    setFormData({
      name: process.name,
      description: process.description || '',
      color: process.color
    });
    setEditDialogOpen(true);
  };

  const handleDelete = async (process: Process, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${process.name}" 공정을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteProcess(process.id);
      await loadProcesses();
      // 현재 선택된 공정이 삭제된 경우 공정 목록 페이지로 이동
      if (selectedProcess?.id === process.id) {
        router.push('/processes');
      }
      alert('공정이 삭제되었습니다.');
    } catch (error) {
      console.error('공정 삭제 실패:', error);
      alert('공정 삭제에 실패했습니다.');
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('공정 이름을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);
      if (editingProcess) {
        await updateProcess(editingProcess.id, formData);
        alert('공정이 수정되었습니다.');
      } else {
        const maxOrderIndex = processes.length > 0 ? Math.max(...processes.map(p => p.order_index)) : 0;
        await createProcess({
          ...formData,
          order_index: maxOrderIndex + 1
        });
        alert('공정이 생성되었습니다.');
      }
      await loadProcesses();
      setCreateDialogOpen(false);
      setEditDialogOpen(false);
      setEditingProcess(null);
      setFormData({ name: '', description: '', color: '#3b82f6' });
    } catch (error) {
      console.error('공정 저장 실패:', error);
      alert(editingProcess ? '공정 수정에 실패했습니다.' : '공정 생성에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = processes.findIndex((p) => p.id === active.id);
      const newIndex = processes.findIndex((p) => p.id === over.id);

      const newProcesses = arrayMove(processes, oldIndex, newIndex);
      setProcesses(newProcesses);

      try {
        const processIds = newProcesses.map((p) => p.id);
        await reorderProcesses(processIds);
      } catch (error) {
        console.error('공정 순서 변경 실패:', error);
        alert('공정 순서 변경에 실패했습니다.');
        await loadProcesses(); // 실패 시 원래대로 복구
      }
    }
  };

  const handleDownload = async (file: FileWithRelations, e: React.MouseEvent) => {
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

  const handleAnalyzeClick = async (file: FileWithRelations, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!file || file.file_type !== 'image') return;

    try {
      setAnalyzingFiles(prev => new Set(prev).add(file.id));
      await analyzeImage(file.id);
      await loadFiles();
      setAnalyzingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
    } catch (error) {
      console.error('이미지 분석 실패:', error);
      alert('이미지 분석에 실패했습니다.');
      setAnalyzingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
    }
  };

  const handleEditClick = (file: FileWithRelations, e: React.MouseEvent) => {
    e.stopPropagation();
    // 빈 문자열일 때만 수정 가능
    if (file.description && file.description.trim() !== '') {
      alert('이미 설명이 있는 파일입니다. AI 자동 생성 후에는 수정할 수 없습니다.');
      return;
    }
    setFileToEdit(file);
    setEditDescription(file.description || '');
    setFileEditDialogOpen(true);
  };

  const handleEditConfirm = async () => {
    if (!fileToEdit) return;

    try {
      setEditing(true);
      await updateFile(fileToEdit.id, { description: editDescription.trim() });
      await loadFiles();
      setFileEditDialogOpen(false);
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

  const handleDeleteClick = async (file: FileWithRelations, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${file.file_name}" 파일을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteFile(file.id);
      await loadFiles();
      alert('파일이 삭제되었습니다.');
    } catch (error) {
      console.error('파일 삭제 실패:', error);
      alert('파일 삭제에 실패했습니다.');
    }
  };

  // SortableItem 컴포넌트
  const SortableItem = ({ process, index }: { process: Process; index: number }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: process.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div ref={setNodeRef} style={style}>
        <Card
          className={`cursor-pointer transition-all duration-200 ease-in-out hover:bg-accent/50 ${selectedProcess?.id === process.id ? 'ring-2 ring-primary bg-accent' : ''}`}
          onClick={() => router.push(`/processes/${process.id}`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {profile && canManageProcesses(profile.role) && (
                  <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing touch-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: process.color }} />
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm sm:text-base">{process.name}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {processFileCounts[process.id] ?? 0}개 파일
                    </Badge>
                  </div>
                </div>
              </div>
              {profile && canManageProcesses(profile.role) && (
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => handleEdit(process, e)}>
                        <Edit className="h-4 w-4 mr-2" />
                        수정
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => handleDelete(process, e)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </CardHeader>
          {process.description && (
            <CardContent className="pt-0">
              <p className="text-xs sm:text-sm text-muted-foreground">{process.description}</p>
            </CardContent>
          )}
        </Card>
      </div>
    );
  };

  const renderFilePreview = (file: FileWithRelations) => {
    const isImage = file.file_type === 'image';
    const hasError = imageErrors.has(file.id);

    if (isImage && !hasError) {
      // 이미지 URL이 절대 URL인지 확인하고, 상대 경로인 경우 처리
      const imageUrl = file.file_path?.startsWith('http') 
        ? file.file_path 
        : file.file_path?.startsWith('/') 
          ? file.file_path 
          : `https://${file.file_path}`;

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
              setImageErrors(prev => new Set(prev).add(file.id));
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

  const renderProcessList = () => (
    <ScrollArea className="h-full">
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg font-semibold">공정 목록</h2>
        </div>

        {processesLoading ? (
          <div className="text-center text-muted-foreground py-8 sm:py-12 text-sm">로딩 중...</div>
        ) : processesError ? (
          <div className="text-center text-muted-foreground py-8 sm:py-12">
            <p className="text-sm sm:text-base text-destructive mb-2">{processesError}</p>
            <Button variant="outline" size="sm" onClick={loadProcesses}>
              다시 시도
            </Button>
          </div>
        ) : processes.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 sm:py-12">
            <FileIcon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm sm:text-base mb-4">등록된 공정이 없습니다</p>
            {profile && canManageProcesses(profile.role) && (
              <Button variant="outline" size="sm" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                새 공정 추가
              </Button>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={processes.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {processes.map((process, index) => (
                  <SortableItem key={process.id} process={process} index={index} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {!processesLoading && !processesError && processes.length > 0 && profile && canManageProcesses(profile.role) && (
          <div className="mt-3">
            <Button variant="outline" className="w-full" size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              새 공정 추가
            </Button>
          </div>
        )}
      </div>
    </ScrollArea>
  );

  const renderFileList = () => (
    <ScrollArea className="h-full">
      <div className="p-3 sm:p-4">
        {!selectedProcess ? (
          <div className="text-center text-muted-foreground py-8 sm:py-12">
            <FileIcon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm sm:text-base">공정을 선택해주세요</p>
          </div>
        ) : loading ? (
          <div className="text-center text-muted-foreground py-8 sm:py-12 text-sm">로딩 중...</div>
        ) : (
          <>
            <div className="mb-4 sm:mb-6">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full" style={{ backgroundColor: selectedProcess.color }} />
                <h2 className="text-lg sm:text-2xl font-semibold">{selectedProcess.name}</h2>
                <Badge className="text-xs">{files.length}개 파일</Badge>
              </div>
              {selectedProcess.description && (
                <p className="text-xs sm:text-sm text-muted-foreground">{selectedProcess.description}</p>
              )}
            </div>

            {files.length === 0 ? (
              <Card>
                <CardContent className="py-8 sm:py-12 text-center text-muted-foreground">
                  <FileIcon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm sm:text-base">이 공정에 업로드된 파일이 없습니다</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {files.map((file) => {
                  const metadata = file.metadata as {
                    scene_summary?: string;
                    tags?: string[];
                    characters_count?: number;
                  } | undefined;
                  const hasMetadata = metadata && metadata.scene_summary && metadata.tags;
                  const isAnalyzing = analyzingFiles.has(file.id);

                  return (
                    <Card 
                      key={file.id} 
                      className="overflow-hidden p-0 hover:shadow-md transition-all duration-200 ease-in-out cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/files/${file.id}`);
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
                            <p className="text-xs text-muted-foreground">메타데이터 없음</p>
                          </div>
                        )}
                        {file.cut?.episode?.webtoon && (
                          <div className="text-xs text-muted-foreground space-y-1 mt-2">
                            <p className="truncate">{file.cut.episode.webtoon.title}</p>
                            <p>{file.cut.episode.episode_number}화 - {(file.cut.episode.webtoon.unit_type || 'cut') === 'cut' ? '컷' : '페이지'} {file.cut.cut_number}</p>
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
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* 모바일: 세로 스택 레이아웃 */}
      <div className="flex flex-col lg:hidden h-full overflow-hidden">
        {!selectedProcess ? (
          <div className="flex-1 overflow-hidden bg-background">
            {renderProcessList()}
          </div>
        ) : (
          <>
            <div className="flex-shrink-0 border-b border-border/40 bg-background">
              <div className="p-3 sm:p-4">
                <Button variant="ghost" size="sm" onClick={() => router.push('/processes')} className="text-xs sm:text-sm">
                  ← 공정 목록으로
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-background">
              {renderFileList()}
            </div>
          </>
        )}
      </div>

      {/* 데스크톱: 가로 레이아웃 */}
      <div className="hidden lg:grid lg:grid-cols-12 h-full">
        <div className="col-span-3 border-r border-border/40 h-full overflow-hidden bg-background">
          {renderProcessList()}
        </div>
        <div className="col-span-9 h-full overflow-hidden bg-background">
          {renderFileList()}
        </div>
      </div>

      {/* 공정 생성 Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>새 공정 추가</DialogTitle>
            <DialogDescription>새로운 공정을 추가합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">이름 *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="공정 이름을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="공정 설명을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">색상</label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-16 h-10 cursor-pointer"
                />
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#3b82f6"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '생성'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파일 정보 수정 Dialog */}
      <Dialog open={fileEditDialogOpen} onOpenChange={setFileEditDialogOpen}>
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
              setFileEditDialogOpen(false);
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

      {/* 공정 수정 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>공정 수정</DialogTitle>
            <DialogDescription>공정 정보를 수정합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">이름 *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="공정 이름을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">설명</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="공정 설명을 입력하세요"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">색상</label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-16 h-10 cursor-pointer"
                />
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#3b82f6"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '수정'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파일 상세 정보 Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
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
                  <div className="relative w-full h-[60vh] min-h-[400px] bg-muted rounded-md overflow-hidden">
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
                      onError={() => {
                        console.error('이미지 로딩 실패:', fileToView.file_path);
                        setImageErrors(prev => new Set(prev).add(fileToView.id));
                      }}
                    />
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

              {/* 액션 버튼 */}
              <div className="flex gap-2 pt-4 border-t">
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
    </>
  );
}


