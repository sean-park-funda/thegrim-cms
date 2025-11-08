'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { getProcesses, createProcess, updateProcess, deleteProcess, reorderProcesses } from '@/lib/api/processes';
import { getFilesByProcess } from '@/lib/api/files';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, FileIcon, MoreVertical, Edit, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Process, FileWithRelations } from '@/lib/supabase';
import Image from 'next/image';
import { canManageProcesses } from '@/lib/utils/permissions';

export function ProcessView() {
  const { processes, setProcesses, selectedProcess, setSelectedProcess, profile } = useStore();
  const [files, setFiles] = useState<FileWithRelations[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<Process | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', color: '#3b82f6' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    if (selectedProcess) {
      loadFiles();
    } else {
      setFiles([]);
    }
  }, [selectedProcess]);

  const loadProcesses = async () => {
    try {
      const data = await getProcesses();
      setProcesses(data);
    } catch (error) {
      console.error('공정 목록 로드 실패:', error);
    }
  };

  const loadFiles = async () => {
    if (!selectedProcess) return;

    try {
      setLoading(true);
      const data = await getFilesByProcess(selectedProcess.id);
      setFiles(data);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

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
      if (selectedProcess?.id === process.id) {
        setSelectedProcess(null);
      }
      await loadProcesses();
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

  const handleMoveUp = async (process: Process, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = processes.findIndex(p => p.id === process.id);
    if (currentIndex <= 0) return;

    try {
      const newProcesses = [...processes];
      [newProcesses[currentIndex - 1], newProcesses[currentIndex]] = [newProcesses[currentIndex], newProcesses[currentIndex - 1]];
      const processIds = newProcesses.map(p => p.id);
      await reorderProcesses(processIds);
      await loadProcesses();
    } catch (error) {
      console.error('공정 순서 변경 실패:', error);
      alert('공정 순서 변경에 실패했습니다.');
    }
  };

  const handleMoveDown = async (process: Process, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = processes.findIndex(p => p.id === process.id);
    if (currentIndex >= processes.length - 1) return;

    try {
      const newProcesses = [...processes];
      [newProcesses[currentIndex], newProcesses[currentIndex + 1]] = [newProcesses[currentIndex + 1], newProcesses[currentIndex]];
      const processIds = newProcesses.map(p => p.id);
      await reorderProcesses(processIds);
      await loadProcesses();
    } catch (error) {
      console.error('공정 순서 변경 실패:', error);
      alert('공정 순서 변경에 실패했습니다.');
    }
  };

  const renderFilePreview = (file: FileWithRelations) => {
    const isImage = file.file_type === 'image';

    if (isImage) {
      return (
        <div className="relative w-full h-64 bg-muted rounded-md overflow-hidden">
          <Image src={file.file_path} alt={file.file_name} fill className="object-cover" />
        </div>
      );
    }

    return (
      <div className="w-full h-64 bg-muted rounded-md flex items-center justify-center">
        <FileIcon className="h-16 w-16 text-muted-foreground" />
      </div>
    );
  };

  return (
    <div className="grid grid-cols-12 h-full">
      <div className="col-span-3 border-r border-border/40 h-full overflow-hidden bg-background">
        <ScrollArea className="h-full">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">공정 목록</h2>
            </div>

            <div className="space-y-2">
              {processes.map((process, index) => (
                <Card key={process.id} className={`cursor-pointer transition-all duration-200 ease-in-out hover:bg-accent/50 ${selectedProcess?.id === process.id ? 'ring-2 ring-primary bg-accent' : ''}`} onClick={() => setSelectedProcess(process)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: process.color }} />
                        <CardTitle className="text-base">{process.name}</CardTitle>
                      </div>
                      {profile && canManageProcesses(profile.role) && (
                        <div className="flex items-center gap-1">
                          <div className="flex flex-col">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => handleMoveUp(process, e)} disabled={index === 0}>
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => handleMoveDown(process, e)} disabled={index === processes.length - 1}>
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </div>
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
                      <p className="text-sm text-muted-foreground">{process.description}</p>
                    </CardContent>
                  )}
                </Card>
              ))}

              {profile && canManageProcesses(profile.role) && (
                <Button variant="outline" className="w-full" size="sm" onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  새 공정 추가
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      <div className="col-span-9 h-full overflow-hidden bg-background">
        <ScrollArea className="h-full">
          <div className="p-4">
            {!selectedProcess ? (
              <div className="text-center text-muted-foreground py-12">
                <FileIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>공정을 선택해주세요</p>
              </div>
            ) : loading ? (
              <div className="text-center text-muted-foreground py-12 text-sm">로딩 중...</div>
            ) : (
              <>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedProcess.color }} />
                    <h2 className="text-2xl font-semibold">{selectedProcess.name}</h2>
                    <Badge>{files.length}개 파일</Badge>
                  </div>
                  {selectedProcess.description && (
                    <p className="text-muted-foreground">{selectedProcess.description}</p>
                  )}
                </div>

                {files.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <FileIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>이 공정에 업로드된 파일이 없습니다</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {files.map((file) => (
                      <Card key={file.id} className="overflow-hidden p-0 hover:shadow-md transition-all duration-200 ease-in-out">
                        {renderFilePreview(file)}
                        <div className="p-4">
                          <div className="mb-2">
                            <p className="font-medium truncate">{file.file_name}</p>
                            {file.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{file.description}</p>
                            )}
                          </div>
                          {file.cut?.episode?.webtoon && (
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p className="truncate">{file.cut.episode.webtoon.title}</p>
                              <p>{file.cut.episode.episode_number}화 - 컷 {file.cut.cut_number}</p>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
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
    </div>
  );
}


