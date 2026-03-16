'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Play,
  RefreshCw,
  Upload,
  Download,
  Clipboard,
  Plus,
  ChevronLeft,
  Pencil,
  Check,
  Trash2,
  X,
} from 'lucide-react';
import {
  MovingWebtoonMotionType,
  MOTION_TYPE_PRESETS,
} from '@/lib/supabase';

interface VideoVersion {
  video_url: string;
  video_path: string;
  provider: string;
  elapsed_ms: number;
  prompt?: string;
  created_at: string;
}

interface CutItem {
  id: string;
  imageUrl: string;
  fileName: string;
  prompt: string;
  motionType: MovingWebtoonMotionType;
  provider: string;
  duration: number;
  status: 'pending' | 'uploading' | 'generating' | 'completed' | 'failed';
  videoUrl: string | null;
  videoVersions: VideoVersion[];
  errorMessage: string | null;
  elapsedMs: number | null;
  dbCutId: string | null;
  dbMwCutId: string | null;
}

interface MwProject {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  cut_count: number;
}

const PROVIDERS = [
  { id: 'kling-o3-pro', name: 'Kling O3 Pro' },
  { id: 'kling-o3-standard', name: 'Kling O3 Standard' },
  { id: 'veo', name: 'Veo 3.1' },
];

const DEFAULT_PROVIDER = 'kling-o3-pro';
const DEFAULT_MOTION: MovingWebtoonMotionType = 'lip_sync';

export default function MovingWebtoonPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <MovingWebtoonContent />
    </Suspense>
  );
}

function MovingWebtoonContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialProjectId = searchParams.get('id');

  // 화면 모드: 'list' = 프로젝트 목록, 'project' = 프로젝트 내부
  const [mode, setMode] = useState<'list' | 'project'>(initialProjectId ? 'project' : 'list');
  const [cuts, setCuts] = useState<CutItem[]>([]);
  const [merging, setMerging] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mwProjectId, setMwProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('이름없음');
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [projectList, setProjectList] = useState<MwProject[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingProject, setLoadingProject] = useState(false);
  const fileCounter = useRef(0);
  const projectRef = useRef<{ projectId: string; mwProjectId: string } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ===== 프로젝트 목록 로드 =====
  const loadProjectList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/webtoonanimation/moving-webtoon?list=true');
      if (res.ok) {
        const data = await res.json();
        setProjectList(data.projects || []);
      }
    } finally {
      setLoadingList(false);
    }
  }, []);

  // ===== 기존 프로젝트 로드 (MwProject 객체 또는 mwProjectId 문자열) =====
  const loadProject = useCallback(async (projOrId: MwProject | string) => {
    setLoadingProject(true);
    try {
      let mwPId: string;
      let pId: string;
      let name: string;

      if (typeof projOrId === 'string') {
        // mwProjectId만 있는 경우 (URL에서 복원) — 목록에서 찾거나 API로 조회
        const listRes = await fetch('/api/webtoonanimation/moving-webtoon?list=true');
        const listData = await listRes.json();
        const found = (listData.projects || []).find((p: MwProject) => p.id === projOrId);
        if (!found) { setMode('list'); return; }
        mwPId = found.id;
        pId = found.project_id;
        name = found.name || '이름없음';
      } else {
        mwPId = projOrId.id;
        pId = projOrId.project_id;
        name = projOrId.name || '이름없음';
      }

      const res = await fetch(`/api/webtoonanimation/moving-webtoon?projectId=${pId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.project) return;

      const loadedCuts: CutItem[] = (data.cuts || []).map((c: Record<string, unknown>, i: number) => ({
        id: c.id as string,
        imageUrl: (c.cut as Record<string, string>)?.file_path || '',
        fileName: (c.cut as Record<string, string>)?.file_name || `컷 ${i + 1}`,
        prompt: (c.prompt as string) || '',
        motionType: (c.motion_type as MovingWebtoonMotionType) || 'lip_sync',
        provider: (c.provider as string) || DEFAULT_PROVIDER,
        duration: (c.duration_seconds as number) || 3,
        status: (c.status as CutItem['status']) || 'pending',
        videoUrl: (c.video_url as string) || null,
        videoVersions: (c.video_versions as VideoVersion[]) || [],
        errorMessage: (c.error_message as string) || null,
        elapsedMs: (c.elapsed_ms as number) || null,
        dbCutId: (c.cut_id as string) || null,
        dbMwCutId: c.id as string,
      }));

      projectRef.current = { projectId: pId, mwProjectId: mwPId };
      setProjectId(pId);
      setMwProjectId(mwPId);
      setProjectName(name);
      setCuts(loadedCuts);
      setMode('project');
      router.replace(`/moving-webtoon?id=${mwPId}`);
    } finally {
      setLoadingProject(false);
    }
  }, [router]);

  // ===== 새 프로젝트 만들기 =====
  const createNewProject = useCallback(async () => {
    setLoadingProject(true);
    try {
      const projRes = await fetch('/api/webtoonanimation/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `무빙웹툰 ${new Date().toLocaleDateString('ko-KR')}` }),
      });
      const proj = await projRes.json();

      const mwRes = await fetch('/api/webtoonanimation/moving-webtoon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          projectId: proj.id,
          name: '이름없음',
          defaultProvider: DEFAULT_PROVIDER,
          defaultMotionType: DEFAULT_MOTION,
        }),
      });
      const mwProj = await mwRes.json();

      projectRef.current = { projectId: proj.id, mwProjectId: mwProj.id };
      setProjectId(proj.id);
      setMwProjectId(mwProj.id);
      setProjectName('이름없음');
      setCuts([]);
      setMode('project');
      router.replace(`/moving-webtoon?id=${mwProj.id}`);
    } finally {
      setLoadingProject(false);
    }
  }, [router]);

  // ===== 프로젝트 목록으로 돌아가기 =====
  const goBack = useCallback(() => {
    projectRef.current = null;
    setProjectId(null);
    setMwProjectId(null);
    setCuts([]);
    setMode('list');
    router.replace('/moving-webtoon');
    loadProjectList();
  }, [loadProjectList, router]);

  // ===== 프로젝트 이름 저장 =====
  const saveName = useCallback(async () => {
    if (!mwProjectId || !tempName.trim()) {
      setEditingName(false);
      return;
    }
    const name = tempName.trim();
    setProjectName(name);
    setEditingName(false);
    await fetch('/api/webtoonanimation/moving-webtoon', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movingProjectId: mwProjectId, name }),
    });
  }, [mwProjectId, tempName]);

  // ===== 페이지 로드 시 =====
  useEffect(() => {
    if (initialProjectId) {
      loadProject(initialProjectId);
    } else {
      loadProjectList();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 이름 편집 시 포커스 =====
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  // ===== ensureProject (이미 프로젝트 안에 있으므로 ref 반환) =====
  const ensureProject = useCallback(async (): Promise<{ projectId: string; mwProjectId: string }> => {
    if (projectRef.current) return projectRef.current;
    throw new Error('프로젝트가 초기화되지 않았습니다');
  }, []);

  // ===== 파일 처리 =====
  const processFiles = useCallback(async (files: File[]) => {
    const newCuts: CutItem[] = files.map((file) => ({
      id: `temp-${++fileCounter.current}`,
      imageUrl: URL.createObjectURL(file),
      fileName: file.name,
      prompt: MOTION_TYPE_PRESETS[DEFAULT_MOTION].prompt,
      motionType: DEFAULT_MOTION,
      provider: DEFAULT_PROVIDER,
      duration: 3,
      status: 'uploading' as const,
      videoUrl: null,
      videoVersions: [],
      errorMessage: null,
      elapsedMs: null,
      dbCutId: null,
      dbMwCutId: null,
    }));

    setCuts((prev) => [...prev, ...newCuts]);

    const { projectId: pId, mwProjectId: mwId } = await ensureProject();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const tempId = newCuts[i].id;

      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });

        const uploadRes = await fetch('/api/webtoonanimation/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: pId,
            imageData: base64,
            mimeType: file.type || 'image/png',
            fileName: file.name || `paste-${Date.now()}.png`,
            orderIndex: i,
          }),
        });
        const uploadedCut = await uploadRes.json();
        if (!uploadRes.ok || !uploadedCut?.id) throw new Error('업로드 실패');

        const addRes = await fetch('/api/webtoonanimation/moving-webtoon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_cuts',
            movingProjectId: mwId,
            cuts: [{
              cutId: uploadedCut.id,
              orderIndex: i,
              motionType: DEFAULT_MOTION,
              prompt: MOTION_TYPE_PRESETS[DEFAULT_MOTION].prompt,
            }],
          }),
        });
        const addData = await addRes.json();
        const mwCut = addData[0];

        setCuts((prev) =>
          prev.map((c) =>
            c.id === tempId
              ? { ...c, status: 'pending' as const, imageUrl: uploadedCut.file_path, dbCutId: uploadedCut.id, dbMwCutId: mwCut?.id || null }
              : c
          )
        );
      } catch (e) {
        console.error('업로드 실패:', e);
        setCuts((prev) =>
          prev.map((c) =>
            c.id === tempId ? { ...c, status: 'failed' as const, errorMessage: '업로드 실패' } : c
          )
        );
      }
    }
  }, [ensureProject]);

  // ===== 클립보드 페이스트 (프로젝트 모드에서만) =====
  useEffect(() => {
    if (mode !== 'project') return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [mode, processFiles]);

  // ===== 드롭존 =====
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: processFiles,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
    multiple: true,
    noClick: cuts.length > 0,
    noKeyboard: mode !== 'project',
    noDrag: mode !== 'project',
  });

  // ===== 영상 생성 =====
  const generateCut = async (cutId: string) => {
    const cut = cuts.find((c) => c.id === cutId);
    if (!cut?.dbMwCutId) return;

    setCuts((prev) =>
      prev.map((c) => (c.id === cutId ? { ...c, status: 'generating' as const, errorMessage: null } : c))
    );

    try {
      const res = await fetch('/api/webtoonanimation/moving-webtoon/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.dbMwCutId, prompt: cut.prompt, provider: cut.provider }),
      });
      const data = await res.json();
      if (res.ok) {
        setCuts((prev) =>
          prev.map((c) =>
            c.id === cutId ? {
              ...c,
              status: 'completed' as const,
              videoUrl: data.video_url,
              videoVersions: data.video_versions || [],
              elapsedMs: data.elapsed_ms,
            } : c
          )
        );
      } else {
        throw new Error(data.error || '생성 실패');
      }
    } catch (e) {
      setCuts((prev) =>
        prev.map((c) =>
          c.id === cutId ? { ...c, status: 'failed' as const, errorMessage: (e as Error).message } : c
        )
      );
    }
  };

  const generateAll = async () => {
    const pending = cuts.filter((c) => (c.status === 'pending' || c.status === 'failed') && c.dbMwCutId);
    for (const cut of pending) {
      await generateCut(cut.id);
    }
  };

  const mergeCuts = async () => {
    if (!mwProjectId) return;
    setMerging(true);
    try {
      const res = await fetch('/api/webtoonanimation/moving-webtoon/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movingProjectId: mwProjectId }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `moving_webtoon_${Date.now()}.mp4`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const err = await res.json();
        alert(`합치기 실패: ${err.error}`);
      }
    } catch (e) {
      console.error('합치기 실패:', e);
    } finally {
      setMerging(false);
    }
  };

  const removeCut = async (cutId: string) => {
    const cut = cuts.find((c) => c.id === cutId);
    if (cut?.dbMwCutId) {
      await fetch(`/api/webtoonanimation/moving-webtoon?cutId=${cut.dbMwCutId}`, { method: 'DELETE' });
    }
    setCuts((prev) => prev.filter((c) => c.id !== cutId));
  };

  const updateCut = (cutId: string, updates: Partial<CutItem>) => {
    setCuts((prev) => prev.map((c) => (c.id === cutId ? { ...c, ...updates } : c)));
    const cut = cuts.find((c) => c.id === cutId);
    if (cut?.dbMwCutId) {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.prompt !== undefined) dbUpdates.prompt = updates.prompt;
      if (updates.motionType !== undefined) dbUpdates.motion_type = updates.motionType;
      if (updates.provider !== undefined) dbUpdates.provider = updates.provider;
      if (Object.keys(dbUpdates).length > 0) {
        fetch('/api/webtoonanimation/moving-webtoon', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cutId: cut.dbMwCutId, ...dbUpdates }),
        });
      }
    }
  };

  const deleteProject = async (proj: MwProject, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${proj.name}" 프로젝트를 삭제하시겠습니까?`)) return;
    await fetch(`/api/webtoonanimation/moving-webtoon?movingProjectId=${proj.id}`, { method: 'DELETE' });
    setProjectList((prev) => prev.filter((p) => p.id !== proj.id));
  };

  const [mediaModal, setMediaModal] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

  const completedCount = cuts.filter((c) => c.status === 'completed').length;
  const pendingCount = cuts.filter((c) => c.status === 'pending' || c.status === 'failed').length;
  const isGenerating = cuts.some((c) => c.status === 'generating');

  // ==========================================
  // 프로젝트 목록 화면
  // ==========================================
  if (mode === 'list') {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="container mx-auto max-w-5xl px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold">무빙웹툰</h1>
              <Button size="sm" onClick={createNewProject} disabled={loadingProject}>
                {loadingProject ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1" />
                )}
                새 프로젝트
              </Button>
            </div>
          </div>
        </div>

        <div className="container mx-auto max-w-5xl px-4 py-6">
          {loadingList ? (
            <div className="flex items-center justify-center h-[40vh]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : projectList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center">
              <p className="text-muted-foreground mb-4">아직 프로젝트가 없습니다</p>
              <Button onClick={createNewProject} disabled={loadingProject}>
                <Plus className="h-4 w-4 mr-1" />
                첫 프로젝트 만들기
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {projectList.map((proj) => (
                <Card
                  key={proj.id}
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors group"
                  onClick={() => loadProject(proj)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium">{proj.name || '이름없음'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(proj.created_at).toLocaleDateString('ko-KR', {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{proj.cut_count}컷</Badge>
                      <button
                        onClick={(e) => deleteProject(proj, e)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // 프로젝트 내부 화면
  // ==========================================
  return (
    <div className="min-h-screen bg-background">
      {/* 상단 바 */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={goBack}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              {/* 인라인 프로젝트 이름 편집 */}
              {editingName ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); saveName(); }}
                  className="flex items-center gap-1"
                >
                  <input
                    ref={nameInputRef}
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingName(false); }}
                    className="text-lg font-semibold bg-transparent border-b-2 border-primary outline-none w-48"
                  />
                  <button type="submit" className="text-primary">
                    <Check className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => { setTempName(projectName); setEditingName(true); }}
                  className="flex items-center gap-1.5 group"
                >
                  <h1 className="text-lg font-semibold">{projectName}</h1>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}

              {cuts.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {completedCount}/{cuts.length} 완료
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <Button size="sm" onClick={generateAll} disabled={isGenerating}>
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1" />
                  )}
                  전체 생성 ({pendingCount})
                </Button>
              )}

              {completedCount >= 2 && (
                <Button size="sm" variant="secondary" onClick={mergeCuts} disabled={merging}>
                  {merging ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 mr-1" />
                  )}
                  합치기
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div
        {...getRootProps()}
        className={`container mx-auto max-w-5xl px-4 py-6 min-h-[calc(100vh-57px)] ${
          isDragActive ? 'bg-primary/5' : ''
        }`}
      >
        <input {...getInputProps()} />

        {cuts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <div
              className={`border-2 border-dashed rounded-xl p-12 transition-colors max-w-lg w-full cursor-pointer ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-base font-medium mb-2">웹툰 컷을 드래그하여 추가</p>
              <p className="text-sm text-muted-foreground mb-3">
                여러 장을 한번에 올릴 수 있습니다. 순서대로 영상이 만들어집니다.
              </p>
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
                <Clipboard className="h-3.5 w-3.5" />
                <span>스크린샷을 Ctrl+V로 바로 붙여넣기도 가능</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {cuts.map((cut, index) => (
              <CutRow
                key={cut.id}
                cut={cut}
                index={index}
                onGenerate={() => generateCut(cut.id)}
                onRemove={() => removeCut(cut.id)}
                onUpdate={(updates) => updateCut(cut.id, updates)}
                onVideoClick={(url) => setMediaModal({ url, type: 'video' })}
                onImageClick={(url) => setMediaModal({ url, type: 'image' })}
              />
            ))}

            {/* 추가 드롭 영역 */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/40'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.multiple = true;
                input.onchange = (ev) => {
                  const files = Array.from((ev.target as HTMLInputElement).files || []);
                  if (files.length) processFiles(files);
                };
                input.click();
              }}
            >
              <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">컷 추가 (드래그, 클릭, 또는 Ctrl+V)</p>
            </div>
          </div>
        )}
      </div>

      {/* 미디어 모달 */}
      {mediaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setMediaModal(null)}
        >
          <button
            onClick={() => setMediaModal(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
          >
            <X className="h-6 w-6" />
          </button>
          {mediaModal.type === 'video' ? (
            <video
              src={mediaModal.url}
              className="max-h-[85vh] max-w-[90vw] rounded-lg"
              autoPlay
              loop
              controls
              playsInline
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={mediaModal.url}
              alt=""
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ===== 개별 컷 행 =====
function CutRow({
  cut,
  index,
  onGenerate,
  onRemove,
  onUpdate,
  onVideoClick,
  onImageClick,
}: {
  cut: CutItem;
  index: number;
  onGenerate: () => void;
  onRemove: () => void;
  onUpdate: (updates: Partial<CutItem>) => void;
  onVideoClick: (url: string) => void;
  onImageClick: (url: string) => void;
}) {
  const [localPrompt, setLocalPrompt] = useState(cut.prompt);
  const [activeVideoIdx, setActiveVideoIdx] = useState<number | null>(null);

  useEffect(() => {
    setLocalPrompt(cut.prompt);
  }, [cut.prompt]);

  // 새 버전이 추가되면 최신 버전을 active로
  useEffect(() => {
    if (cut.videoVersions.length > 0) {
      setActiveVideoIdx(cut.videoVersions.length - 1);
    }
  }, [cut.videoVersions.length]);

  const handleMotionChange = (motion: MovingWebtoonMotionType) => {
    const preset = MOTION_TYPE_PRESETS[motion];
    const newPrompt = motion !== 'custom' ? preset.prompt : cut.prompt;
    setLocalPrompt(newPrompt);
    onUpdate({ motionType: motion, prompt: newPrompt });
  };

  const isWorking = cut.status === 'uploading' || cut.status === 'generating';

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-0">
        {/* 왼쪽: 번호 + 원본 이미지 */}
        <div className="shrink-0 w-32 bg-muted/30 flex flex-col items-center p-2 gap-1">
          <span className="text-[10px] text-muted-foreground font-medium">#{index + 1}</span>
          <div
            className="w-full aspect-[3/4] rounded overflow-hidden bg-muted cursor-pointer"
            onClick={() => cut.imageUrl && onImageClick(cut.imageUrl)}
          >
            <img
              src={cut.imageUrl}
              alt={cut.fileName}
              className="w-full h-full object-cover"
            />
          </div>
          <button
            onClick={onRemove}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
          >
            삭제
          </button>
        </div>

        {/* 가운데: 설정 + 프롬프트 + 만들기 */}
        <div className="flex-1 p-3 space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={cut.motionType} onValueChange={handleMotionChange}>
              <SelectTrigger className="w-32 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MOTION_TYPE_PRESETS).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{val.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={cut.provider} onValueChange={(v) => onUpdate({ provider: v })}>
              <SelectTrigger className="w-40 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <StatusBadge status={cut.status} elapsedMs={cut.elapsedMs} />
          </div>

          <Textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onBlur={() => {
              if (localPrompt !== cut.prompt) onUpdate({ prompt: localPrompt });
            }}
            rows={3}
            className="text-xs resize-none"
            placeholder="프롬프트를 입력하세요..."
          />

          {cut.errorMessage && (
            <p className="text-xs text-red-500">{cut.errorMessage}</p>
          )}

          <Button size="sm" onClick={onGenerate} disabled={isWorking || !cut.dbMwCutId} className="h-7 text-xs">
            {cut.status === 'generating' ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : cut.status === 'completed' ? (
              <RefreshCw className="h-3 w-3 mr-1" />
            ) : (
              <Play className="h-3 w-3 mr-1" />
            )}
            {cut.status === 'completed' ? '재생성' : '만들기'}
          </Button>
        </div>

        {/* 오른쪽: 결과 영상 */}
        <div className="shrink-0 w-40 bg-muted/20 flex flex-col items-center justify-center p-2 gap-1.5">
          {(() => {
            const versions = cut.videoVersions;
            const activeUrl = activeVideoIdx !== null && versions[activeVideoIdx]
              ? versions[activeVideoIdx].video_url
              : cut.videoUrl;

            if ((cut.status === 'completed' || versions.length > 0) && activeUrl) {
              return (
                <>
                  {/* 버전 썸네일 (2개 이상일 때) */}
                  {versions.length >= 2 && (
                    <div className="flex gap-1 w-full overflow-x-auto pb-0.5">
                      {versions.map((v, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveVideoIdx(i)}
                          className={`shrink-0 w-8 h-8 rounded overflow-hidden border-2 transition-colors ${
                            i === activeVideoIdx ? 'border-primary' : 'border-transparent hover:border-muted-foreground/40'
                          }`}
                        >
                          <video
                            src={v.video_url}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 메인 영상 */}
                  <div
                    className="w-full cursor-pointer relative group"
                    onClick={() => onVideoClick(activeUrl)}
                  >
                    <video
                      key={activeUrl}
                      src={activeUrl}
                      className="w-full rounded object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors rounded">
                      <Play className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  {versions.length >= 2 && (
                    <span className="text-[9px] text-muted-foreground">
                      {(activeVideoIdx ?? 0) + 1}/{versions.length}
                    </span>
                  )}
                </>
              );
            }

            if (cut.status === 'generating') {
              return (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-[10px]">생성 중...</span>
                </div>
              );
            }

            if (cut.status === 'uploading') {
              return (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-[10px]">업로드 중...</span>
                </div>
              );
            }

            return (
              <div className="text-center text-muted-foreground">
                <span className="text-[10px]">영상 없음</span>
              </div>
            );
          })()}
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status, elapsedMs }: { status: string; elapsedMs: number | null }) {
  const config = {
    pending: { label: '대기', variant: 'outline' as const },
    uploading: { label: '업로드중', variant: 'outline' as const },
    generating: { label: '생성중', variant: 'secondary' as const },
    completed: { label: '완료', variant: 'default' as const },
    failed: { label: '실패', variant: 'destructive' as const },
  }[status] || { label: status, variant: 'outline' as const };

  return (
    <Badge variant={config.variant} className="text-[10px] h-5">
      {config.label}
      {elapsedMs && ` (${(elapsedMs / 1000).toFixed(1)}s)`}
    </Badge>
  );
}
