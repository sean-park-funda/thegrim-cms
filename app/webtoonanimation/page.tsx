'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Trash2, Film, Loader2, Scissors } from 'lucide-react';
import Link from 'next/link';
import {
  WebtoonAnimationProject,
  WebtoonAnimationCut,
  WebtoonAnimationPromptGroupWithCuts,
  WebtoonAnimationPromptGroup,
} from '@/lib/supabase';
import { CutUploader } from '@/components/webtoonanimation/CutUploader';
import { SortableCutGrid } from '@/components/webtoonanimation/SortableCutGrid';
import { RangeSelector, Pace } from '@/components/webtoonanimation/RangeSelector';
import { CutPromptEditor } from '@/components/webtoonanimation/CutPromptEditor';
import { PromptGroupList } from '@/components/webtoonanimation/PromptGroupList';

export default function WebtoonAnimationPage() {
  // State: 프로젝트 목록
  const [projects, setProjects] = useState<WebtoonAnimationProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // State: 선택된 프로젝트
  const [selectedProject, setSelectedProject] = useState<WebtoonAnimationProject | null>(null);
  const [cuts, setCuts] = useState<WebtoonAnimationCut[]>([]);
  const [loadingCuts, setLoadingCuts] = useState(false);

  // State: 업로드
  const [uploading, setUploading] = useState(false);

  // State: 범위 선택 + 전개 속도
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [pace, setPace] = useState<Pace>('fast');

  // State: 프롬프트 생성
  const [generating, setGenerating] = useState(false);
  const [promptGroups, setPromptGroups] = useState<WebtoonAnimationPromptGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<WebtoonAnimationPromptGroupWithCuts | null>(null);

  // Debounce timer
  const debounceRef = useRef<Record<string, NodeJS.Timeout>>({});

  // ===== 프로젝트 목록 =====
  const loadProjects = useCallback(async () => {
    try {
      setLoadingProjects(true);
      const res = await fetch('/api/webtoonanimation/projects');
      const data = await res.json();
      if (Array.isArray(data)) setProjects(data);
    } catch (e) {
      console.error('프로젝트 목록 로드 실패:', e);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const createProject = async () => {
    try {
      const res = await fetch('/api/webtoonanimation/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.id) {
        setProjects((prev) => [data, ...prev]);
        selectProject(data);
      }
    } catch (e) {
      console.error('프로젝트 생성 실패:', e);
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('프로젝트를 삭제하시겠습니까?')) return;
    try {
      await fetch(`/api/webtoonanimation/update-prompt?projectId=${id}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (selectedProject?.id === id) {
        setSelectedProject(null);
        setCuts([]);
        setActiveGroup(null);
      }
    } catch (e) {
      console.error('프로젝트 삭제 실패:', e);
    }
  };

  // ===== 프로젝트 상세 =====
  const selectProject = async (project: WebtoonAnimationProject) => {
    setSelectedProject(project);
    setActiveGroup(null);
    await loadCuts(project.id);
    await loadPromptGroups(project.id);
  };

  const loadCuts = async (projectId: string) => {
    try {
      setLoadingCuts(true);
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase
        .from('webtoonanimation_cuts')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true });
      if (data) {
        setCuts(data);
        setRangeStart(0);
        setRangeEnd(Math.max(0, data.length - 1));
      }
    } catch (e) {
      console.error('컷 로드 실패:', e);
    } finally {
      setLoadingCuts(false);
    }
  };

  const loadPromptGroups = async (projectId: string) => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase
        .from('webtoonanimation_prompt_groups')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (data) setPromptGroups(data);
    } catch (e) {
      console.error('프롬프트 그룹 로드 실패:', e);
    }
  };

  // ===== 파일 업로드 =====
  const handleFilesSelected = async (files: File[]) => {
    if (!selectedProject) return;
    setUploading(true);

    try {
      const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const startIndex = cuts.length;

      for (let i = 0; i < sorted.length; i++) {
        const file = sorted[i];
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const res = await fetch('/api/webtoonanimation/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: selectedProject.id,
            imageData: base64,
            mimeType: file.type,
            fileName: file.name,
            orderIndex: startIndex + i,
          }),
        });

        if (!res.ok) {
          console.error('업로드 실패:', await res.text());
        }
      }

      await loadCuts(selectedProject.id);
    } catch (e) {
      console.error('업로드 실패:', e);
    } finally {
      setUploading(false);
    }
  };

  // ===== 드래그 정렬 =====
  const handleReorder = async (newCuts: WebtoonAnimationCut[]) => {
    setCuts(newCuts);
    try {
      await fetch('/api/webtoonanimation/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutIds: newCuts.map((c) => c.id) }),
      });
    } catch (e) {
      console.error('순서 변경 실패:', e);
      if (selectedProject) loadCuts(selectedProject.id);
    }
  };

  // ===== 컷 삭제 =====
  const handleRemoveCut = async (cutId: string) => {
    try {
      await fetch(`/api/webtoonanimation/update-prompt?cutId=${cutId}`, { method: 'DELETE' });
      setCuts((prev) => prev.filter((c) => c.id !== cutId));
    } catch (e) {
      console.error('컷 삭제 실패:', e);
    }
  };

  // ===== 프롬프트 생성 =====
  const handleGenerate = async () => {
    if (!selectedProject) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          rangeStart,
          rangeEnd,
          pace,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`프롬프트 생성 실패: ${err.error}`);
        return;
      }

      const data = await res.json();
      setActiveGroup(data.group);
      await loadPromptGroups(selectedProject.id);
    } catch (e) {
      console.error('프롬프트 생성 실패:', e);
      alert('프롬프트 생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  // ===== 프롬프트 그룹 선택 =====
  const selectPromptGroup = async (group: WebtoonAnimationPromptGroup) => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: cutPrompts } = await supabase
        .from('webtoonanimation_cut_prompts')
        .select('*')
        .eq('group_id', group.id)
        .order('cut_index', { ascending: true });
      setActiveGroup({ ...group, cut_prompts: cutPrompts || [] });
    } catch (e) {
      console.error('프롬프트 그룹 로드 실패:', e);
    }
  };

  const deletePromptGroup = async (id: string) => {
    try {
      await fetch(`/api/webtoonanimation/update-prompt?id=${id}`, { method: 'DELETE' });
      setPromptGroups((prev) => prev.filter((g) => g.id !== id));
      if (activeGroup?.id === id) setActiveGroup(null);
    } catch (e) {
      console.error('프롬프트 그룹 삭제 실패:', e);
    }
  };

  // ===== 프롬프트 수정 (debounced) =====
  const handleUpdatePrompt = useCallback((id: string, field: string, value: string | number) => {
    setActiveGroup((prev) => {
      if (!prev?.cut_prompts) return prev;
      return {
        ...prev,
        cut_prompts: prev.cut_prompts.map((p) =>
          p.id === id ? { ...p, [field]: value } : p
        ),
      };
    });

    if (debounceRef.current[id]) clearTimeout(debounceRef.current[id]);
    debounceRef.current[id] = setTimeout(async () => {
      try {
        await fetch('/api/webtoonanimation/update-prompt', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, [field]: value }),
        });
      } catch (e) {
        console.error('프롬프트 수정 실패:', e);
      }
    }, 500);
  }, []);

  const handleUpdateGroup = useCallback((groupId: string, field: string, value: string) => {
    setActiveGroup((prev) => prev ? { ...prev, [field]: value } : prev);
    fetch('/api/webtoonanimation/update-prompt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, [field]: value }),
    }).catch(console.error);
  }, []);

  const handleRefinePrompt = useCallback(async (
    promptId: string,
    instruction: string,
    currentValues: { prompt: string; camera: string | null; continuity: string; duration: number },
  ) => {
    try {
      const res = await fetch('/api/webtoonanimation/refine-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          currentPrompt: currentValues.prompt,
          currentCamera: currentValues.camera,
          currentContinuity: currentValues.continuity,
          currentDuration: currentValues.duration,
          storyboardImageUrl: activeGroup?.storyboard_image_path || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`AI 수정 실패: ${err.error}`);
        return;
      }

      const refined = await res.json();

      setActiveGroup((prev) => {
        if (!prev?.cut_prompts) return prev;
        return {
          ...prev,
          cut_prompts: prev.cut_prompts.map((p) =>
            p.id === promptId
              ? { ...p, prompt: refined.prompt, camera: refined.camera, continuity: refined.continuity, duration: refined.duration, is_edited: true }
              : p
          ),
        };
      });

      await fetch('/api/webtoonanimation/update-prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: promptId,
          prompt: refined.prompt,
          camera: refined.camera,
          continuity: refined.continuity,
          duration: refined.duration,
        }),
      });
    } catch (e) {
      console.error('AI 수정 실패:', e);
      alert('AI 수정 중 오류가 발생했습니다.');
    }
  }, [activeGroup?.storyboard_image_path]);

  const handleDeletePrompt = async (id: string) => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await supabase.from('webtoonanimation_cut_prompts').delete().eq('id', id);
      setActiveGroup((prev) => {
        if (!prev?.cut_prompts) return prev;
        return { ...prev, cut_prompts: prev.cut_prompts.filter((p) => p.id !== id) };
      });
    } catch (e) {
      console.error('프롬프트 삭제 실패:', e);
    }
  };

  // ===== 렌더: 프로젝트 목록 =====
  if (!selectedProject) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">웹툰 애니메이션</h1>
            <p className="text-sm text-muted-foreground mt-1">웹툰 컷을 영상 프롬프트로 변환</p>
          </div>
          <Button onClick={createProject}>
            <Plus className="h-4 w-4 mr-1.5" />
            새 프로젝트
          </Button>
        </div>

        {loadingProjects ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="py-12">
            <CardContent className="text-center">
              <Film className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">프로젝트가 없습니다</p>
              <Button onClick={createProject}>
                <Plus className="h-4 w-4 mr-1.5" />
                첫 프로젝트 만들기
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors group"
                onClick={() => selectProject(project)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="truncate">{project.title}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(project.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    {new Date(project.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 유틸리티 배너 */}
        <Link href="/webtoonanimation/merge-videos" className="block mt-8">
          <div className="rounded-lg border bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 hover:from-primary/10 hover:via-primary/15 hover:to-primary/10 transition-colors p-4 flex items-center gap-4 group">
            <div className="rounded-full bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
              <Scissors className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">영상 이어붙이기</p>
              <p className="text-xs text-muted-foreground">여러 영상 파일을 순서대로 합쳐 하나의 영상으로 만듭니다</p>
            </div>
            <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>
    );
  }

  // ===== 렌더: 프로젝트 상세 =====
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => setSelectedProject(null)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <Input
            value={selectedProject.title}
            onChange={(e) => {
              setSelectedProject({ ...selectedProject, title: e.target.value });
            }}
            className="text-lg font-bold border-none shadow-none h-auto p-0 focus-visible:ring-0"
            placeholder="프로젝트 제목"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* 좌측: 컷 그리드 + 프롬프트 에디터 */}
        <div className="space-y-6">
          {/* 업로드 */}
          <CutUploader
            onFilesSelected={handleFilesSelected}
            uploading={uploading}
          />

          {/* 컷 그리드 */}
          {loadingCuts ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cuts.length > 0 ? (
            <>
              <SortableCutGrid
                cuts={cuts}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                onReorder={handleReorder}
                onRemove={handleRemoveCut}
              />

              <RangeSelector
                totalCuts={cuts.length}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                pace={pace}
                onRangeChange={(s, e) => { setRangeStart(s); setRangeEnd(e); }}
                onPaceChange={setPace}
                onGenerate={handleGenerate}
                generating={generating}
              />
            </>
          ) : null}

          {/* 프롬프트 에디터 */}
          {activeGroup && (
            <div className="pt-4 border-t">
              <CutPromptEditor
                group={activeGroup}
                cuts={cuts}
                projectId={selectedProject.id}
                onUpdatePrompt={handleUpdatePrompt}
                onUpdateGroup={handleUpdateGroup}
                onDeletePrompt={handleDeletePrompt}
                onRefinePrompt={handleRefinePrompt}
              />
            </div>
          )}
        </div>

        {/* 우측: 생성 이력 */}
        <div className="space-y-4">
          <PromptGroupList
            groups={promptGroups}
            activeGroupId={activeGroup?.id || null}
            onSelect={selectPromptGroup}
            onDelete={deletePromptGroup}
          />

          {activeGroup?.storyboard_image_path && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">스토리보드 이미지</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <img
                  src={activeGroup.storyboard_image_path}
                  alt="Storyboard"
                  className="w-full rounded border"
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
