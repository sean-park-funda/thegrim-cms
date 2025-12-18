'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  FileText,
  Users,
  Image as ImageIcon,
  Video,
  Plus,
  Trash2,
  Upload,
  Sparkles,
  Download,
  RefreshCcw,
  Check,
  AlertCircle,
  Play,
  ArrowLeft,
  FolderOpen,
} from 'lucide-react';

type GridSize = '2x2' | '3x3';

interface GridConfig {
  rows: number;
  cols: number;
  panelCount: number;
  sceneCount: number;
}

const GRID_CONFIGS: Record<GridSize, GridConfig> = {
  '2x2': { rows: 2, cols: 2, panelCount: 4, sceneCount: 3 },
  '3x3': { rows: 3, cols: 3, panelCount: 9, sceneCount: 8 },
};

interface ShortsProjectListItem {
  id: string;
  title: string | null;
  script: string;
  status: string;
  grid_image_path: string | null;
  created_at: string;
  updated_at: string;
}

interface ShortsCharacter {
  id?: string;
  name: string;
  description: string;
  imageBase64?: string;
  imageMimeType?: string;
  image_path?: string;
}

interface ShortsScene {
  id: string;
  scene_index: number;
  start_panel_path: string | null;
  end_panel_path: string | null;
  video_prompt: string | null;
  video_path: string | null;
  status: string;
  error_message: string | null;
}

interface PanelDescription {
  panelIndex: number;
  description: string;
  characters: string[];
  action: string;
  environment: string;
}

interface VideoScript {
  panels: PanelDescription[];  // 패널 설명 (2x2: 4개, 3x3: 9개)
  scenes: Array<{
    sceneIndex: number;
    startPanelIndex: number;
    endPanelIndex: number;
    motionDescription: string;
    dialogue: string; // 해당 씬의 대사
    veoPrompt: string;
  }>;
  totalDuration: number;
  style: string;
}

interface ShortsProject {
  id: string;
  title: string | null;
  script: string;
  status: string;
  grid_image_path: string | null;
  video_script: VideoScript | null;
  shorts_characters?: ShortsCharacter[];
  shorts_scenes?: ShortsScene[];
}

export default function ScriptToShortsPage() {
  // 뷰 상태: 'list' (목록) 또는 'edit' (편집)
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [activeTab, setActiveTab] = useState('script');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 프로젝트 목록 상태
  const [projectList, setProjectList] = useState<ShortsProjectListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // 프로젝트 상태
  const [projectId, setProjectId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [script, setScript] = useState('');

  // 캐릭터 상태
  const [characters, setCharacters] = useState<ShortsCharacter[]>([
    { name: '', description: '' },
  ]);
  const [charactersSkipped, setCharactersSkipped] = useState(false);

  // 그리드 이미지 상태
  const [gridImagePath, setGridImagePath] = useState<string | null>(null);
  const [scenes, setScenes] = useState<ShortsScene[]>([]);
  const [imageStyle, setImageStyle] = useState<'realistic' | 'cartoon'>('realistic');
  const [gridSize, setGridSize] = useState<GridSize>('3x3');

  // 영상 스크립트 상태
  const [videoScript, setVideoScript] = useState<VideoScript | null>(null);

  // 개별 상태
  const [savingProject, setSavingProject] = useState(false);
  const [generatingGrid, setGeneratingGrid] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState<number | null>(null);
  const [generatingAllVideos, setGeneratingAllVideos] = useState(false);

  // Veo API Key 상태
  const [veoApiKey, setVeoApiKey] = useState('');
  const [showVeoApiKeyDialog, setShowVeoApiKeyDialog] = useState(false);

  // Gemini 모델 선택 상태
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');

  // 프로젝트 목록 로드
  const loadProjectList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/shorts');
      if (res.ok) {
        const data = await res.json();
        // API는 배열을 직접 반환함
        setProjectList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('프로젝트 목록 로드 실패:', err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    loadProjectList();
  }, [loadProjectList]);

  // 프로젝트 선택
  const handleSelectProject = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/shorts/${id}`);
      if (!res.ok) {
        throw new Error('프로젝트를 불러올 수 없습니다.');
      }

      const data: ShortsProject = await res.json();
      setProjectId(data.id);
      setTitle(data.title || '');
      setScript(data.script);
      setGridImagePath(data.grid_image_path);
      setVideoScript(data.video_script);
      setScenes(data.shorts_scenes || []);

      if (data.shorts_characters && data.shorts_characters.length > 0) {
        setCharacters(
          data.shorts_characters.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description || '',
            image_path: c.image_path,
          }))
        );
        setCharactersSkipped(false);
      } else if (data.grid_image_path) {
        setCharactersSkipped(true);
      }

      setView('edit');
      setActiveTab('script');
    } catch (err) {
      setError(err instanceof Error ? err.message : '프로젝트 로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  // 새 프로젝트 만들기
  const handleNewProject = useCallback(() => {
    setProjectId(null);
    setTitle('');
    setScript('');
    setCharacters([{ name: '', description: '' }]);
    setCharactersSkipped(false);
    setGridImagePath(null);
    setScenes([]);
    setVideoScript(null);
    setError(null);
    setView('edit');
    setActiveTab('script');
  }, []);

  // 목록으로 돌아가기
  const handleBackToList = useCallback(() => {
    setView('list');
    loadProjectList();
  }, [loadProjectList]);

  // 프로젝트 삭제
  const handleDeleteProject = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 프로젝트를 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/shorts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadProjectList();
      }
    } catch (err) {
      console.error('프로젝트 삭제 실패:', err);
    }
  }, [loadProjectList]);

  // 프로젝트 저장/생성
  const handleSaveProject = useCallback(async () => {
    if (!script.trim()) {
      setError('대본을 입력해주세요.');
      return;
    }

    setSavingProject(true);
    setError(null);

    try {
      if (projectId) {
        // 기존 프로젝트 수정
        const res = await fetch(`/api/shorts/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim() || null, script }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '프로젝트 수정에 실패했습니다.');
        }
      } else {
        // 새 프로젝트 생성
        const res = await fetch('/api/shorts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim() || null, script }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '프로젝트 생성에 실패했습니다.');
        }

        const data = await res.json();
        setProjectId(data.id);
      }

      // 다음 탭으로 이동
      setActiveTab('characters');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSavingProject(false);
    }
  }, [projectId, title, script]);

  // 캐릭터 추가
  const handleAddCharacter = () => {
    setCharacters([...characters, { name: '', description: '' }]);
  };

  // 캐릭터 삭제
  const handleRemoveCharacter = (index: number) => {
    setCharacters(characters.filter((_, i) => i !== index));
  };

  // 캐릭터 수정
  const handleUpdateCharacter = (index: number, field: keyof ShortsCharacter, value: string) => {
    const updated = [...characters];
    updated[index] = { ...updated[index], [field]: value };
    setCharacters(updated);
  };

  // 캐릭터 이미지 업로드
  const handleCharacterImageUpload = (index: number, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const base64 = result.split(',')[1];
      const mimeType = file.type;

      const updated = [...characters];
      updated[index] = {
        ...updated[index],
        imageBase64: base64,
        imageMimeType: mimeType,
      };
      setCharacters(updated);
    };
    reader.readAsDataURL(file);
  };

  // 캐릭터 저장
  const handleSaveCharacters = useCallback(async () => {
    if (!projectId) {
      setError('먼저 대본을 저장해주세요.');
      return;
    }

    const validCharacters = characters.filter((c) => c.name.trim());
    if (validCharacters.length === 0) {
      setError('최소 한 명의 등장인물을 입력해주세요.');
      return;
    }

    setSavingProject(true);
    setError(null);

    try {
      const res = await fetch(`/api/shorts/${projectId}/characters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characters: validCharacters }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '캐릭터 저장에 실패했습니다.');
      }

      // 다음 탭으로 이동
      setActiveTab('images');
    } catch (err) {
      setError(err instanceof Error ? err.message : '캐릭터 저장에 실패했습니다.');
    } finally {
      setSavingProject(false);
    }
  }, [projectId, characters]);

  // 그리드 이미지 생성
  const handleGenerateGrid = useCallback(async () => {
    if (!projectId) {
      setError('먼저 대본을 저장해주세요.');
      return;
    }

    setGeneratingGrid(true);
    setError(null);

    try {
      const res = await fetch(`/api/shorts/${projectId}/generate-grid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: imageStyle, gridSize }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '이미지 생성에 실패했습니다.');
      }

      const data = await res.json();
      setGridImagePath(data.gridImagePath);

      // 프로젝트 새로고침하여 씬 정보 가져오기
      await refreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 생성에 실패했습니다.');
    } finally {
      setGeneratingGrid(false);
    }
  }, [projectId, imageStyle, gridSize]);

  // 영상 스크립트 생성
  const handleGenerateScript = useCallback(async () => {
    if (!projectId) {
      setError('먼저 대본을 저장해주세요.');
      return;
    }

    setGeneratingScript(true);
    setError(null);

    try {
      const res = await fetch(`/api/shorts/${projectId}/generate-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: geminiModel, gridSize }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '스크립트 생성에 실패했습니다.');
      }

      const data = await res.json();
      setVideoScript(data);

      // 프로젝트 새로고침
      await refreshProject();

      // 다음 탭으로 이동
      setActiveTab('video');
    } catch (err) {
      setError(err instanceof Error ? err.message : '스크립트 생성에 실패했습니다.');
    } finally {
      setGeneratingScript(false);
    }
  }, [projectId, geminiModel, gridSize]);

  // 단일 영상 생성
  const handleGenerateVideo = useCallback(
    async (sceneIndex: number) => {
      if (!projectId) {
        setError('먼저 대본을 저장해주세요.');
        return;
      }

      setGeneratingVideo(sceneIndex);
      setError(null);

      try {
        const res = await fetch(`/api/shorts/${projectId}/generate-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneIndex, veoApiKey: veoApiKey || undefined }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '영상 생성에 실패했습니다.');
        }

        // 프로젝트 새로고침
        await refreshProject();
      } catch (err) {
        setError(err instanceof Error ? err.message : '영상 생성에 실패했습니다.');
      } finally {
        setGeneratingVideo(null);
      }
    },
    [projectId, veoApiKey]
  );

  // 모든 영상 생성
  const handleGenerateAllVideos = useCallback(async () => {
    if (!projectId) {
      setError('먼저 대본을 저장해주세요.');
      return;
    }

    setGeneratingAllVideos(true);
    setError(null);

    try {
      const res = await fetch(`/api/shorts/${projectId}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ veoApiKey: veoApiKey || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '영상 생성에 실패했습니다.');
      }

      // 프로젝트 새로고침
      await refreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : '영상 생성에 실패했습니다.');
    } finally {
      setGeneratingAllVideos(false);
    }
  }, [projectId, veoApiKey]);

  // 프로젝트 새로고침
  const refreshProject = useCallback(async () => {
    if (!projectId) return;

    try {
      const res = await fetch(`/api/shorts/${projectId}`);
      if (res.ok) {
        const data: ShortsProject = await res.json();
        setTitle(data.title || '');
        setScript(data.script);
        setGridImagePath(data.grid_image_path);
        setVideoScript(data.video_script);
        setScenes(data.shorts_scenes || []);

        if (data.shorts_characters && data.shorts_characters.length > 0) {
          setCharacters(
            data.shorts_characters.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description || '',
              image_path: c.image_path,
            }))
          );
          setCharactersSkipped(false);
        } else if (data.grid_image_path) {
          // 캐릭터 없이 그리드 이미지가 있으면 건너뛴 것으로 간주
          setCharactersSkipped(true);
        }
      }
    } catch (err) {
      console.error('프로젝트 새로고침 실패:', err);
    }
  }, [projectId]);

  // 탭 변경 시 프로젝트 새로고침
  useEffect(() => {
    if (projectId && (activeTab === 'images' || activeTab === 'video')) {
      refreshProject();
    }
  }, [activeTab, projectId, refreshProject]);

  // 등장인물 건너뛰기
  const handleSkipCharacters = useCallback(() => {
    setCharactersSkipped(true);
    setActiveTab('images');
  }, []);

  // 탭 활성화 조건
  const canAccessCharacters = !!projectId;
  const canAccessImages = !!projectId && (characters.some((c) => c.name.trim()) || charactersSkipped);
  const canAccessVideo = !!projectId && !!gridImagePath;

  // 프로젝트 목록 화면
  if (view === 'list') {
    return (
      <div className="h-full flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <Video className="h-6 w-6" />
            <h1 className="text-2xl font-bold">대본 → 쇼츠 영상</h1>
          </div>
          <Button onClick={handleNewProject}>
            <Plus className="h-4 w-4 mr-2" />
            새 프로젝트
          </Button>
        </div>

        {/* 프로젝트 목록 */}
        <div className="flex-1 overflow-auto p-4">
          {loadingList ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : projectList.length === 0 ? (
            <Card className="h-64 flex items-center justify-center">
              <CardContent className="text-center">
                <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">아직 프로젝트가 없습니다</p>
                <Button onClick={handleNewProject}>
                  <Plus className="h-4 w-4 mr-2" />
                  첫 프로젝트 만들기
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projectList.map((project) => (
                <Card
                  key={project.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleSelectProject(project.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg truncate">
                        {project.title || '제목 없음'}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDeleteProject(project.id, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardDescription className="text-xs">
                      {new Date(project.updated_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {project.script}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      {project.grid_image_path && (
                        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-2 py-1 rounded">
                          이미지 생성됨
                        </span>
                      )}
                      <span className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 px-2 py-1 rounded">
                        {project.status === 'draft' && '초안'}
                        {project.status === 'grid_generated' && '이미지 완료'}
                        {project.status === 'script_generated' && '스크립트 완료'}
                        {project.status === 'video_generating' && '영상 생성중'}
                        {project.status === 'completed' && '완료'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 프로젝트 편집 화면
  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleBackToList}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Video className="h-6 w-6" />
          <h1 className="text-2xl font-bold">
            {title || (projectId ? '프로젝트 편집' : '새 프로젝트')}
          </h1>
        </div>
        {projectId && (
          <Button variant="outline" size="sm" onClick={refreshProject} disabled={loading}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            새로고침
          </Button>
        )}
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="p-4">
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p className="text-sm">{error}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-hidden p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="script" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              1. 대본
            </TabsTrigger>
            <TabsTrigger
              value="characters"
              disabled={!canAccessCharacters}
              className="flex items-center gap-2"
            >
              <Users className="h-4 w-4" />
              2. 등장인물
            </TabsTrigger>
            <TabsTrigger
              value="images"
              disabled={!canAccessImages}
              className="flex items-center gap-2"
            >
              <ImageIcon className="h-4 w-4" />
              3. 이미지
            </TabsTrigger>
            <TabsTrigger
              value="video"
              disabled={!canAccessVideo}
              className="flex items-center gap-2"
            >
              <Video className="h-4 w-4" />
              4. 영상
            </TabsTrigger>
          </TabsList>

          {/* 1. 대본 입력 */}
          <TabsContent value="script" className="flex-1 overflow-auto mt-4">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>대본 입력</CardTitle>
                <CardDescription>
                  쇼츠 영상으로 만들 대본을 입력하세요. 장면 전환과 대사를 포함해주세요.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <label className="text-sm font-medium">제목 (선택)</label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="프로젝트 제목"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">그리드 크기</label>
                    <div className="flex gap-1 p-1 bg-muted rounded-lg">
                      <Button
                        variant={gridSize === '2x2' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setGridSize('2x2')}
                        className="px-3"
                      >
                        2×2 (4컷)
                      </Button>
                      <Button
                        variant={gridSize === '3x3' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setGridSize('3x3')}
                        className="px-3"
                      >
                        3×3 (9컷)
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">대본 *</label>
                  <Textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="대본을 입력하세요...

예시:
[장면 1: 도시의 밤거리]
주인공이 비오는 거리를 걷고 있다.

[장면 2: 카페 내부]
주인공: '오랜만이야.'
상대방: '그러게, 정말 오랜만이다.'"
                    className="min-h-[400px] resize-none"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveProject} disabled={savingProject || !script.trim()}>
                    {savingProject ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        저장 및 다음
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. 등장인물 설정 */}
          <TabsContent value="characters" className="flex-1 overflow-auto mt-4">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>등장인물 설정</CardTitle>
                    <CardDescription>
                      등장인물의 이름과 외모 설명, 참조 이미지를 입력하세요.
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={handleSkipCharacters}
                    disabled={savingProject}
                    className="text-muted-foreground"
                  >
                    건너뛰기 →
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {characters.map((char, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex gap-4">
                      {/* 이미지 업로드 영역 */}
                      <div className="flex-shrink-0">
                        <label className="cursor-pointer">
                          <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden hover:border-primary transition-colors">
                            {char.imageBase64 ? (
                              <img
                                src={`data:${char.imageMimeType};base64,${char.imageBase64}`}
                                alt={char.name}
                                className="w-full h-full object-cover"
                              />
                            ) : char.image_path ? (
                              <img
                                src={char.image_path}
                                alt={char.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-center p-2">
                                <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">이미지</span>
                              </div>
                            )}
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleCharacterImageUpload(index, file);
                            }}
                          />
                        </label>
                      </div>

                      {/* 정보 입력 영역 */}
                      <div className="flex-1 space-y-3">
                        <Input
                          value={char.name}
                          onChange={(e) => handleUpdateCharacter(index, 'name', e.target.value)}
                          placeholder="캐릭터 이름 *"
                        />
                        <Textarea
                          value={char.description}
                          onChange={(e) => handleUpdateCharacter(index, 'description', e.target.value)}
                          placeholder="외모 설명 (예: 검은 단발머리, 청재킷을 입은 20대 여성)"
                          className="min-h-[60px]"
                        />
                      </div>

                      {/* 삭제 버튼 */}
                      {characters.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleRemoveCharacter(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}

                <Button variant="outline" onClick={handleAddCharacter} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  등장인물 추가
                </Button>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveCharacters}
                    disabled={savingProject || !characters.some((c) => c.name.trim())}
                  >
                    {savingProject ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        저장 및 다음
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3. 이미지 생성 */}
          <TabsContent value="images" className="flex-1 overflow-auto mt-4">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>이미지 생성</CardTitle>
                    <CardDescription>
                      대본을 기반으로 4x2 그리드 이미지를 생성하고, 영상용 스크립트를 작성합니다.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 1단계: 컷 설명 생성 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium">1단계: 컷 설명 생성</h3>
                      <p className="text-xs text-muted-foreground">
                        대본을 분석하여 {GRID_CONFIGS[gridSize].panelCount}개 패널의 상세 설명과 영상 프롬프트를 생성합니다.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={geminiModel}
                        onValueChange={setGeminiModel}
                        disabled={generatingScript}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="모델 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (권장)</SelectItem>
                          <SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (빠름)</SelectItem>
                          <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro (고성능)</SelectItem>
                          <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash (최신)</SelectItem>
                          <SelectItem value="gemini-3-pro-preview">Gemini 3 Pro (최신)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={handleGenerateScript}
                        disabled={generatingScript}
                        variant={videoScript?.panels?.length === 9 ? 'outline' : 'default'}
                      >
                        {generatingScript ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            생성 중...
                          </>
                        ) : videoScript?.panels?.length === 9 ? (
                          <>
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            재생성
                          </>
                        ) : (
                          <>
                            <FileText className="h-4 w-4 mr-2" />
                            컷 설명 생성
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* 패널 설명 미리보기 */}
                  {videoScript?.panels && videoScript.panels.length > 0 && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-green-600 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        {videoScript.panels.length}개 패널 설명 생성됨
                      </p>
                      <div className={`grid gap-2 text-xs ${gridSize === '2x2' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {videoScript.panels.slice(0, GRID_CONFIGS[gridSize].panelCount).map((panel) => (
                          <div key={panel.panelIndex} className="bg-background p-2 rounded border">
                            <div className="font-medium mb-1">패널 {panel.panelIndex + 1}</div>
                            <p className="text-muted-foreground line-clamp-2">{panel.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2단계: 이미지 생성 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium">2단계: 이미지 생성</h3>
                      <p className="text-xs text-muted-foreground">
                        {videoScript?.panels?.length === GRID_CONFIGS[gridSize].panelCount
                          ? `컷 설명을 기반으로 ${gridSize} 그리드 이미지를 생성합니다.`
                          : '먼저 컷 설명을 생성해주세요.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select
                        value={imageStyle}
                        onValueChange={(value: 'realistic' | 'cartoon') => setImageStyle(value)}
                        disabled={generatingGrid || !videoScript?.panels?.length}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="realistic">실사풍</SelectItem>
                          <SelectItem value="cartoon">만화풍</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={handleGenerateGrid}
                        disabled={generatingGrid || (videoScript?.panels?.length !== GRID_CONFIGS[gridSize].panelCount && !gridImagePath)}
                      >
                        {generatingGrid ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            생성 중...
                          </>
                        ) : gridImagePath ? (
                          <>
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            재생성
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            이미지 생성
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 캐릭터 건너뛰기 안내 */}
                {charactersSkipped && !gridImagePath && !videoScript?.panels?.length && (
                  <Card className="p-4 bg-muted/50 border-dashed">
                    <p className="text-sm text-muted-foreground">
                      등장인물 설정을 건너뛰었습니다. 캐릭터 참조 이미지 없이 대본만으로 이미지를 생성합니다.
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto mt-1"
                      onClick={() => {
                        setCharactersSkipped(false);
                        setActiveTab('characters');
                      }}
                    >
                      ← 등장인물 설정으로 돌아가기
                    </Button>
                  </Card>
                )}

                {gridImagePath ? (
                  <>
                    {/* 분할된 패널 */}
                    {scenes.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium">생성된 패널 (9개)</h3>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const response = await fetch(gridImagePath);
                                const blob = await response.blob();
                                const blobUrl = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = blobUrl;
                                link.download = `grid-${Date.now()}.png`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                URL.revokeObjectURL(blobUrl);
                              } catch (err) {
                                console.error('다운로드 실패:', err);
                                window.open(gridImagePath, '_blank');
                              }
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            전체 그리드 다운로드
                          </Button>
                        </div>
                        <div className={`grid gap-3 ${gridSize === '2x2' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                          {/* 패널을 순서대로 표시 (scenes에서 추출) */}
                          {(() => {
                            // scenes를 scene_index 순으로 정렬
                            const sortedScenes = [...scenes].sort((a, b) => a.scene_index - b.scene_index);
                            
                            // 정렬된 scenes에서 패널 경로 추출
                            const allPanels: string[] = [];
                            sortedScenes.forEach((scene, idx) => {
                              if (scene.start_panel_path && !allPanels.includes(scene.start_panel_path)) {
                                allPanels.push(scene.start_panel_path);
                              }
                              // 마지막 씬의 end_panel만 추가 (중복 방지)
                              if (idx === sortedScenes.length - 1 && scene.end_panel_path) {
                                allPanels.push(scene.end_panel_path);
                              }
                            });
                            
                            // 다운로드 함수 (외부 URL을 blob으로 변환하여 다운로드)
                            const handleDownload = async (url: string, filename: string) => {
                              try {
                                const response = await fetch(url);
                                const blob = await response.blob();
                                const blobUrl = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = blobUrl;
                                link.download = filename;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                URL.revokeObjectURL(blobUrl);
                              } catch (err) {
                                console.error('다운로드 실패:', err);
                                // 폴백: 새 탭에서 열기
                                window.open(url, '_blank');
                              }
                            };
                            
                            return allPanels.map((panelPath, idx) => (
                              <Card key={idx} className="overflow-hidden group relative">
                                <img
                                  src={panelPath}
                                  alt={`패널 ${idx + 1}`}
                                  className="w-full aspect-[9/16] object-cover"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleDownload(panelPath, `panel-${idx + 1}.png`)}
                                  >
                                    <Download className="h-4 w-4 mr-1" />
                                    다운로드
                                  </Button>
                                </div>
                                <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                                  {idx + 1}
                                </div>
                              </Card>
                            ));
                          })()}
                        </div>
                      </div>
                    )}

                    {/* 씬 전환 정보 */}
                    {scenes.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium">씬 전환 ({GRID_CONFIGS[gridSize].sceneCount}개 영상)</h3>
                        <div className={`grid gap-2 ${gridSize === '2x2' ? 'grid-cols-3' : 'grid-cols-4'}`}>
                          {[...scenes].sort((a, b) => a.scene_index - b.scene_index).map((scene) => (
                            <Card key={scene.id} className="p-2 text-center">
                              <div className="text-xs font-medium mb-1">씬 {scene.scene_index + 1}</div>
                              <div className="text-xs text-muted-foreground">
                                패널 {scene.scene_index + 1} → {scene.scene_index + 2}
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 영상 탭으로 이동 버튼 */}
                    {videoScript?.scenes && videoScript.scenes.length > 0 && (
                      <div className="flex justify-end">
                        <Button onClick={() => setActiveTab('video')}>
                          <Video className="h-4 w-4 mr-2" />
                          영상 생성으로 이동 →
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ImageIcon className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">
                      {generatingGrid
                        ? '이미지를 생성하고 있습니다. 잠시만 기다려주세요...'
                        : '이미지 생성 버튼을 클릭하여 스토리 패널을 생성하세요.'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 4. 영상 생성 */}
          <TabsContent value="video" className="flex-1 overflow-auto mt-4">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>영상 생성</CardTitle>
                    <CardDescription>
                      각 씬을 Veo로 영상화합니다. 영상 생성에는 몇 분이 소요될 수 있습니다.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowVeoApiKeyDialog(true)}
                    >
                      {veoApiKey ? '🔑 커스텀 API Key' : 'Veo API Key'}
                    </Button>
                    <Button
                      onClick={handleGenerateAllVideos}
                      disabled={generatingAllVideos || generatingVideo !== null || !videoScript}
                    >
                      {generatingAllVideos ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          생성 중...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          모든 영상 생성
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {videoScript ? (
                  <>
                    {/* 영상 스타일 */}
                    <Card className="p-4 bg-muted/50">
                      <p className="text-sm">
                        <span className="font-medium">스타일:</span> {videoScript.style}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">예상 길이:</span> {videoScript.totalDuration}초
                      </p>
                    </Card>

                    {/* 씬별 영상 */}
                    <div className="space-y-4">
                      {[...scenes].sort((a, b) => a.scene_index - b.scene_index).map((scene) => {
                        const sceneScript = videoScript.scenes.find(
                          (s) => s.sceneIndex === scene.scene_index
                        );
                        const isGenerating = generatingVideo === scene.scene_index;

                        return (
                          <Card key={scene.id} className="p-4">
                            <div className="flex items-start gap-4">
                              {/* 패널 이미지 */}
                              <div className="flex gap-2 flex-shrink-0">
                                {scene.start_panel_path && (
                                  <img
                                    src={scene.start_panel_path}
                                    alt="Start"
                                    className="w-16 h-16 object-cover rounded"
                                  />
                                )}
                                {scene.end_panel_path && (
                                  <img
                                    src={scene.end_panel_path}
                                    alt="End"
                                    className="w-16 h-16 object-cover rounded"
                                  />
                                )}
                              </div>

                              {/* 스크립트 정보 */}
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium">씬 {scene.scene_index + 1}</h4>
                                  <div className="flex items-center gap-2">
                                    {scene.status === 'completed' && (
                                      <span className="text-xs text-green-600 flex items-center gap-1">
                                        <Check className="h-3 w-3" />
                                        완료
                                      </span>
                                    )}
                                    {scene.status === 'error' && (
                                      <span className="text-xs text-destructive flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />
                                        오류
                                      </span>
                                    )}
                                    {scene.status === 'generating' && (
                                      <span className="text-xs text-primary flex items-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        생성 중
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {sceneScript && (
                                  <div className="text-sm text-muted-foreground space-y-1">
                                    {sceneScript.dialogue && (
                                      <p className="text-foreground bg-primary/10 p-2 rounded border-l-4 border-primary">
                                        <span className="font-medium">대사:</span>{' '}
                                        &quot;{sceneScript.dialogue}&quot;
                                      </p>
                                    )}
                                    <p>
                                      <span className="font-medium">모션:</span>{' '}
                                      {sceneScript.motionDescription}
                                    </p>
                                    <p className="text-xs bg-muted p-2 rounded">
                                      <span className="font-medium">프롬프트:</span>{' '}
                                      {sceneScript.veoPrompt}
                                    </p>
                                  </div>
                                )}

                                {scene.error_message && (
                                  <p className="text-xs text-destructive">{scene.error_message}</p>
                                )}
                              </div>

                              {/* 액션 버튼 */}
                              <div className="flex flex-col gap-2 flex-shrink-0">
                                {scene.video_path ? (
                                  <>
                                    <a
                                      href={scene.video_path}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <Button variant="outline" size="sm">
                                        <Play className="h-4 w-4 mr-1" />
                                        재생
                                      </Button>
                                    </a>
                                    <a href={scene.video_path} download>
                                      <Button variant="outline" size="sm">
                                        <Download className="h-4 w-4 mr-1" />
                                        다운로드
                                      </Button>
                                    </a>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleGenerateVideo(scene.scene_index)}
                                    disabled={isGenerating || generatingAllVideos || (generatingVideo !== null && generatingVideo !== scene.scene_index)}
                                  >
                                    {isGenerating ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                        생성 중
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles className="h-4 w-4 mr-1" />
                                        생성
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Video className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">
                      먼저 이미지 탭에서 그리드 이미지와 영상 스크립트를 생성해주세요.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Veo API Key 다이얼로그 */}
      <Dialog open={showVeoApiKeyDialog} onOpenChange={setShowVeoApiKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Veo API Key 설정</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">현재 상태:</span>
              {veoApiKey ? (
                <span className="text-orange-600 font-medium">🔑 커스텀 API Key 사용 중</span>
              ) : (
                <span className="text-green-600 font-medium">✓ 서버 기본 키 사용 중</span>
              )}
            </div>
            <Input
              type="text"
              placeholder="커스텀 API Key를 입력하세요 (선택)"
              value={veoApiKey}
              onChange={(e) => setVeoApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              별도의 API Key를 입력하면 해당 키로 영상이 생성됩니다.
              비워두면 서버에 설정된 기본 키가 사용됩니다.
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            {veoApiKey && (
              <Button 
                variant="destructive" 
                onClick={() => setVeoApiKey('')}
                className="mr-auto"
              >
                초기화 (기본 키 사용)
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowVeoApiKeyDialog(false)}>
              취소
            </Button>
            <Button onClick={() => setShowVeoApiKeyDialog(false)}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
