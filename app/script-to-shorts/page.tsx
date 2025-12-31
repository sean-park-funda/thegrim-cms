'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Video,
  Plus,
  Trash2,
  RefreshCcw,
  ArrowLeft,
  FolderOpen,
  AlertCircle,
  Check,
  Search,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useStore } from '@/lib/store/useStore';

import { PanelCardsGrid } from '@/components/shorts/PanelCardsGrid';
import { VideoGenerationSection } from '@/components/shorts/VideoGenerationSection';
import {
  GridSize,
  VideoMode,
  VideoScript,
  ShortsScene,
  GRID_CONFIGS,
} from '@/components/shorts/types';
import { useImageModel } from '@/lib/contexts/ImageModelContext';
import { Upload } from 'lucide-react';

interface ShortsProjectListItem {
  id: string;
  title: string | null;
  script: string;
  status: string;
  grid_image_path: string | null;
  is_public: boolean;
  created_by: string | null;
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

interface ShortsProject {
  id: string;
  title: string | null;
  script: string;
  status: string;
  video_mode?: VideoMode;
  grid_size?: GridSize;
  grid_image_path: string | null;
  video_script: VideoScript | null;
  is_public: boolean;
  created_by: string | null;
  shorts_characters?: ShortsCharacter[];
  shorts_scenes?: ShortsScene[];
}

export default function ScriptToShortsPage() {
  // 사용자 프로필
  const { profile } = useStore();

  // 뷰 상태: 'list' (목록) 또는 'edit' (편집)
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 프로젝트 목록 상태
  const [projectList, setProjectList] = useState<ShortsProjectListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [visibilityFilter, setVisibilityFilter] = useState<'public' | 'private'>('public');

  // 새 프로젝트 공개/비공개 상태
  const [newProjectIsPublic, setNewProjectIsPublic] = useState(true);

  // 현재 프로젝트 공개/비공개 상태 (편집 시)
  const [projectIsPublic, setProjectIsPublic] = useState(true);
  const [projectCreatedBy, setProjectCreatedBy] = useState<string | null>(null);

  // 프로젝트 상태
  const [projectId, setProjectId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [script, setScript] = useState('');

  // 캐릭터 상태
  const [characters, setCharacters] = useState<ShortsCharacter[]>([
    { name: '', description: '' },
  ]);

  // 그리드 이미지 상태
  const [gridImagePath, setGridImagePath] = useState<string | null>(null);
  const [scenes, setScenes] = useState<ShortsScene[]>([]);
  const [imageStyle, setImageStyle] = useState<'realistic' | 'cartoon'>('cartoon');
  const [gridSize, setGridSize] = useState<GridSize>('2x2');
  const [videoMode, setVideoMode] = useState<VideoMode>('per-cut');

  // 영상 스크립트 상태
  const [videoScript, setVideoScript] = useState<VideoScript | null>(null);

  // 개별 상태
  const [savingProject, setSavingProject] = useState(false);
  const [generatingGrid, setGeneratingGrid] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState<number | null>(null);
  const [generatingAllVideos, setGeneratingAllVideos] = useState(false);
  const [generatingPanels, setGeneratingPanels] = useState<Set<number>>(new Set()); // 개별 패널 생성 상태

  // Veo API Key 상태
  const [veoApiKey, setVeoApiKey] = useState('');
  const [showVeoApiKeyDialog, setShowVeoApiKeyDialog] = useState(false);

  // Gemini 모델 선택 상태
  const [geminiModel, setGeminiModel] = useState('gemini-3-pro-preview');

  // 캐릭터 시트 선택 다이얼로그 상태
  const [showCharacterSheetDialog, setShowCharacterSheetDialog] = useState(false);
  const [characterSheetTargetIndex, setCharacterSheetTargetIndex] = useState<number | null>(null);
  const [characterSheets, setCharacterSheets] = useState<Array<{
    id: string;
    file_path: string;
    file_name: string;
    character_name: string;
    webtoon_title: string;
  }>>([]);
  const [loadingCharacterSheets, setLoadingCharacterSheets] = useState(false);

  // 전역 이미지 모델 (Gemini / Seedream)
  const { model: imageModel } = useImageModel();

  // 이미지 생성 프롬프트 상태
  const [imagePrompt, setImagePrompt] = useState<string | null>(null);
  const [showImagePromptDialog, setShowImagePromptDialog] = useState(false);
  const [loadingImagePrompt, setLoadingImagePrompt] = useState(false);

  // 프로젝트 목록 로드
  const loadProjectList = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      params.set('visibility', visibilityFilter);
      if (profile?.id) {
        params.set('currentUserId', profile.id);
      }

      const res = await fetch(`/api/shorts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProjectList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('프로젝트 목록 로드 실패:', err);
    } finally {
      setLoadingList(false);
    }
  }, [visibilityFilter, profile?.id]);

  // 초기 로드
  useEffect(() => {
    loadProjectList();
  }, [loadProjectList]);

  // 프로젝트 선택
  const handleSelectProject = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (profile?.id) {
        params.set('currentUserId', profile.id);
      }
      const res = await fetch(`/api/shorts/${id}?${params.toString()}`);
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
      if (data.video_mode) {
        setVideoMode(data.video_mode);
      }
      if (data.grid_size) {
        setGridSize(data.grid_size);
      }

      // 등장인물 설정 (없으면 빈 상태로 초기화)
      if (data.shorts_characters && data.shorts_characters.length > 0) {
        setCharacters(
          data.shorts_characters.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description || '',
            image_path: c.image_path,
          }))
        );
      } else {
        setCharacters([{ name: '', description: '' }]);
      }

      // 공개/비공개 상태 및 소유자 설정
      setProjectIsPublic(data.is_public ?? true);
      setProjectCreatedBy(data.created_by ?? null);

      setView('edit');
    } catch (err) {
      setError(err instanceof Error ? err.message : '프로젝트 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  // 새 프로젝트 만들기
  const handleNewProject = useCallback(() => {
    setProjectId(null);
    setTitle('');
    setScript('');
    setCharacters([{ name: '', description: '' }]);
    setGridImagePath(null);
    setScenes([]);
    setVideoScript(null);
    setError(null);
    setNewProjectIsPublic(true); // 기본값은 공개
    setProjectCreatedBy(null);
    setView('edit');
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

  // 프로젝트 공개/비공개 토글 (즉시 저장)
  const handleToggleProjectVisibility = useCallback(async () => {
    if (!projectId) return;

    const newIsPublic = !projectIsPublic;
    setProjectIsPublic(newIsPublic);

    try {
      const res = await fetch(`/api/shorts/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: newIsPublic }),
      });

      if (!res.ok) {
        // 실패 시 롤백
        setProjectIsPublic(!newIsPublic);
        console.error('공개/비공개 설정 저장 실패');
      }
    } catch (err) {
      // 실패 시 롤백
      setProjectIsPublic(!newIsPublic);
      console.error('공개/비공개 설정 저장 실패:', err);
    }
  }, [projectId, projectIsPublic]);

  // 프로젝트 설정 즉시 업데이트 (그리드 크기, 영상 모드)
  const updateProjectSettings = useCallback(async (settings: { video_mode?: VideoMode; grid_size?: GridSize; title?: string }) => {
    if (!projectId) return;

    try {
      const res = await fetch(`/api/shorts/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        console.error('설정 업데이트 실패');
      }
    } catch (err) {
      console.error('설정 업데이트 실패:', err);
    }
  }, [projectId]);

  // 그리드 크기 변경 핸들러
  const handleGridSizeChange = useCallback((value: string) => {
    const size = value as GridSize;
    setGridSize(size);
    setVideoScript(null);
    setGridImagePath(null);
    setScenes([]);
    setImagePrompt(null);
    updateProjectSettings({ grid_size: size });
  }, [updateProjectSettings]);

  // 영상 모드 변경 핸들러
  const handleVideoModeChange = useCallback((value: string) => {
    const mode = value as VideoMode;
    setVideoMode(mode);
    setVideoScript(null);
    setGridImagePath(null);
    setScenes([]);
    setImagePrompt(null);
    updateProjectSettings({ video_mode: mode });
  }, [updateProjectSettings]);

  // 대본 + 등장인물 동시 저장
  const handleSaveScriptAndCharacters = useCallback(async () => {
    if (!script.trim()) {
      setError('대본을 입력해주세요.');
      return;
    }

    setSavingProject(true);
    setError(null);

    try {
      // 1) 프로젝트 저장/업데이트
      let currentProjectId = projectId;
      if (currentProjectId) {
        const res = await fetch(`/api/shorts/${currentProjectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim() || null,
            script,
            video_mode: videoMode,
            grid_size: gridSize,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '프로젝트 수정에 실패했습니다.');
        }
      } else {
        const res = await fetch('/api/shorts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim() || null,
            script,
            video_mode: videoMode,
            grid_size: gridSize,
            is_public: newProjectIsPublic,
            created_by: profile?.id || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '프로젝트 생성에 실패했습니다.');
        }

        const data = await res.json();
        currentProjectId = data.id;
        setProjectId(data.id);
      }

      // 2) 등장인물 저장 (없으면 빈 배열로 저장하여 비우기)
      if (currentProjectId) {
        const validCharacters = characters.filter((c) => c.name.trim());

        console.log('[handleSaveScriptAndCharacters] 저장할 캐릭터:', validCharacters.map(c => ({
          name: c.name,
          hasImageBase64: !!c.imageBase64,
          imageBase64Length: c.imageBase64?.length,
          image_path: c.image_path,
        })));

        const res = await fetch(`/api/shorts/${currentProjectId}/characters`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characters: validCharacters }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '캐릭터 저장에 실패했습니다.');
        }

        const savedCharacters = await res.json();
        if (Array.isArray(savedCharacters) && savedCharacters.length > 0) {
          setCharacters(
            savedCharacters.map((c: { id: string; name: string; description: string | null; image_path: string | null }) => ({
              id: c.id,
              name: c.name,
              description: c.description || '',
              image_path: c.image_path || undefined,
            }))
          );
        } else {
          // 저장된 캐릭터가 없으면 빈 상태로 유지
          setCharacters([{ name: '', description: '' }]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSavingProject(false);
    }
  }, [projectId, title, script, videoMode, gridSize, characters]);

  // 캐릭터 추가
  const handleAddCharacter = () => {
    setCharacters([...characters, { name: '', description: '' }]);
  };

  // 캐릭터 삭제
  const handleRemoveCharacter = (index: number) => {
    setCharacters(characters.filter((_, i) => i !== index));
  };

  // 캐릭터 수정
  const handleUpdateCharacter = (index: number, field: 'name' | 'description', value: string) => {
    const updated = [...characters];
    updated[index] = { ...updated[index], [field]: value };
    setCharacters(updated);
  };

  // 캐릭터 이미지 업로드
  const handleCharacterImageUpload = (index: number, file: File) => {
    console.log('[handleCharacterImageUpload] 이미지 업로드 시작:', { index, fileName: file.name, fileType: file.type, fileSize: file.size });
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const base64 = result.split(',')[1];
      const mimeType = file.type;

      console.log('[handleCharacterImageUpload] Base64 변환 완료:', { index, base64Length: base64?.length, mimeType });

      const updated = [...characters];
      updated[index] = {
        ...updated[index],
        imageBase64: base64,
        imageMimeType: mimeType,
      };
      console.log('[handleCharacterImageUpload] 캐릭터 상태 업데이트:', updated[index]);
      setCharacters(updated);
    };
    reader.onerror = (error) => {
      console.error('[handleCharacterImageUpload] FileReader 에러:', error);
    };
    reader.readAsDataURL(file);
  };

  // 이미지 생성 프롬프트 미리보기
  const handlePreviewImagePrompt = useCallback(async () => {
    if (!projectId) {
      setError('먼저 대본을 저장해주세요.');
      return;
    }

    setLoadingImagePrompt(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        style: imageStyle,
        gridSize,
      });
      const res = await fetch(`/api/shorts/${projectId}/preview-image-prompt?${params.toString()}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '프롬프트를 불러올 수 없습니다.');
      }

      const data = await res.json();
      setImagePrompt(data.prompt);
      setShowImagePromptDialog(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '프롬프트 미리보기에 실패했습니다.');
    } finally {
      setLoadingImagePrompt(false);
    }
  }, [projectId, imageStyle, gridSize, videoMode, imageModel]);

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
        body: JSON.stringify({ style: imageStyle, gridSize, videoMode, apiProvider: imageModel }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '이미지 생성에 실패했습니다.');
      }

      const data = await res.json();
      setGridImagePath(data.gridImagePath);
      setImagePrompt(data.prompt || null);

      await refreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 생성에 실패했습니다.');
    } finally {
      setGeneratingGrid(false);
    }
  }, [projectId, imageStyle, gridSize, videoMode]);

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
        body: JSON.stringify({ model: geminiModel, gridSize, videoMode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '스크립트 생성에 실패했습니다.');
      }

      const data = await res.json();
      setVideoScript(data);

      await refreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : '스크립트 생성에 실패했습니다.');
    } finally {
      setGeneratingScript(false);
    }
  }, [projectId, geminiModel, gridSize, videoMode]);

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
        if (data.video_mode) {
          setVideoMode(data.video_mode);
        }
        if (data.grid_size) {
          setGridSize(data.grid_size);
        }

        if (data.shorts_characters && data.shorts_characters.length > 0) {
          setCharacters(
            data.shorts_characters.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description || '',
              image_path: c.image_path,
            }))
          );
        }
      }
    } catch (err) {
      console.error('프로젝트 새로고침 실패:', err);
    }
  }, [projectId]);

  // 패널 설명 수정 (즉시 DB에 저장)
  const handleUpdatePanelDescription = useCallback(async (panelIndex: number, description: string) => {
    if (!videoScript || !projectId) return;

    const updatedPanels = videoScript.panels.map(panel =>
      panel.panelIndex === panelIndex
        ? { ...panel, description }
        : panel
    );

    const updatedVideoScript = {
      ...videoScript,
      panels: updatedPanels,
    };

    // 로컬 상태 즉시 업데이트
    setVideoScript(updatedVideoScript);

    // DB에 저장
    try {
      const res = await fetch(`/api/shorts/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_script: updatedVideoScript }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '패널 설명 저장에 실패했습니다.');
      }

      console.log('[handleUpdatePanelDescription] 패널 설명 저장 완료:', panelIndex);
    } catch (err) {
      setError(err instanceof Error ? err.message : '패널 설명 저장에 실패했습니다.');
    }
  }, [projectId, videoScript]);

  // 개별 패널 이미지 생성
  const handleGeneratePanel = useCallback(async (panelIndex: number) => {
    if (!projectId) {
      setError('먼저 대본을 저장해주세요.');
      return;
    }

    // 생성 중인 패널 추가
    setGeneratingPanels(prev => new Set([...prev, panelIndex]));
    setError(null);

    try {
      const res = await fetch(`/api/shorts/${projectId}/generate-panel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          panelIndex,
          style: imageStyle,
          apiProvider: imageModel,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '패널 이미지 생성에 실패했습니다.');
      }

      // 프로젝트 새로고침하여 씬 정보 업데이트
      await refreshProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : '패널 이미지 생성에 실패했습니다.');
    } finally {
      // 생성 완료된 패널 제거
      setGeneratingPanels(prev => {
        const next = new Set(prev);
        next.delete(panelIndex);
        return next;
      });
    }
  }, [projectId, imageStyle, imageModel, refreshProject]);

  // 씬 duration 업데이트
  const updateSceneDuration = useCallback(async (sceneId: string, duration: number) => {
    if (!projectId) return;

    try {
      const res = await fetch(`/api/shorts/${projectId}/scenes/${sceneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration }),
      });

      if (res.ok) {
        setScenes(prev => prev.map(s =>
          s.id === sceneId ? { ...s, duration } : s
        ));
      } else {
        console.error('씬 업데이트 실패');
      }
    } catch (err) {
      console.error('씬 업데이트 오류:', err);
    }
  }, [projectId]);

  // 캐릭터 시트 목록 불러오기
  const loadCharacterSheets = useCallback(async () => {
    setLoadingCharacterSheets(true);
    try {
      const res = await fetch('/api/characters/sheets');
      if (res.ok) {
        const data = await res.json();
        setCharacterSheets(data);
      }
    } catch (err) {
      console.error('캐릭터 시트 불러오기 실패:', err);
    } finally {
      setLoadingCharacterSheets(false);
    }
  }, []);

  // 캐릭터 시트 선택 다이얼로그 열기
  const openCharacterSheetDialog = useCallback((charIndex: number) => {
    setCharacterSheetTargetIndex(charIndex);
    setShowCharacterSheetDialog(true);
    loadCharacterSheets();
  }, [loadCharacterSheets]);

  // 캐릭터 시트 선택
  const handleSelectCharacterSheet = useCallback(async (sheet: {
    id: string;
    file_path: string;
    file_name: string;
    character_name: string;
  }) => {
    if (characterSheetTargetIndex === null) return;

    // 일단 image_path를 먼저 설정 (CORS 오류 시에도 저장 가능하도록)
    setCharacters(prev => {
      const updated = [...prev];
      updated[characterSheetTargetIndex] = {
        ...updated[characterSheetTargetIndex],
        name: updated[characterSheetTargetIndex].name || sheet.character_name,
        image_path: sheet.file_path,
      };
      return updated;
    });

    // 이미지를 base64로 변환 시도 (선택적)
    try {
      const response = await fetch(sheet.file_path);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        const mimeType = blob.type || 'image/png';

        setCharacters(prev => {
          const updated = [...prev];
          if (updated[characterSheetTargetIndex]) {
            updated[characterSheetTargetIndex] = {
              ...updated[characterSheetTargetIndex],
              imageBase64: base64,
              imageMimeType: mimeType,
            };
          }
          return updated;
        });
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn('캐릭터 시트 이미지 base64 변환 실패 (image_path는 사용됨):', err);
    }

    setShowCharacterSheetDialog(false);
    setCharacterSheetTargetIndex(null);
  }, [characterSheetTargetIndex]);

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
          <div className="flex items-center gap-4">
            {/* 공개/비공개 필터 */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={visibilityFilter === 'public' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setVisibilityFilter('public')}
                className={`h-7 ${visibilityFilter === 'public' ? 'bg-primary text-primary-foreground' : ''}`}
              >
                퍼블릭
              </Button>
              <Button
                variant={visibilityFilter === 'private' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setVisibilityFilter('private')}
                disabled={!profile}
                className={`h-7 ${visibilityFilter === 'private' ? 'bg-primary text-primary-foreground' : ''}`}
              >
                프라이빗
              </Button>
            </div>
            <Button onClick={handleNewProject}>
              <Plus className="h-4 w-4 mr-2" />
              새 프로젝트
            </Button>
          </div>
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

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleBackToList}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Video className="h-6 w-6" />
          {editingTitle ? (
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                // 프로젝트가 있으면 제목 저장
                if (projectId) {
                  updateProjectSettings({ title: title || '제목 없음' });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setEditingTitle(false);
                  if (projectId) {
                    updateProjectSettings({ title: title || '제목 없음' });
                  }
                } else if (e.key === 'Escape') {
                  setEditingTitle(false);
                }
              }}
              className="text-xl font-bold h-8 w-[200px]"
              placeholder="제목 없음"
            />
          ) : (
            <h1
              className="text-xl font-bold cursor-pointer hover:text-primary transition-colors"
              onClick={() => setEditingTitle(true)}
              title="클릭하여 제목 수정"
            >
              {title || '제목 없음'}
            </h1>
          )}

          {/* 공개/비공개 토글 (소유자만 표시) */}
          {projectId && projectCreatedBy === profile?.id && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 ml-4">
              <Button
                variant={projectIsPublic ? 'default' : 'ghost'}
                size="sm"
                onClick={() => !projectIsPublic && handleToggleProjectVisibility()}
                className={`h-6 text-xs ${projectIsPublic ? 'bg-primary text-primary-foreground' : ''}`}
              >
                퍼블릭
              </Button>
              <Button
                variant={!projectIsPublic ? 'default' : 'ghost'}
                size="sm"
                onClick={() => projectIsPublic && handleToggleProjectVisibility()}
                className={`h-6 text-xs ${!projectIsPublic ? 'bg-primary text-primary-foreground' : ''}`}
              >
                프라이빗
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* 프로젝트 설정 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">그리드:</span>
            <Select
              value={gridSize}
              onValueChange={handleGridSizeChange}
              disabled={generatingGrid || generatingScript}
            >
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2x2">2x2</SelectItem>
                <SelectItem value="3x3">3x3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">모드:</span>
            <Select
              value={videoMode}
              onValueChange={handleVideoModeChange}
              disabled={generatingGrid || generatingScript}
            >
              <SelectTrigger className="w-[130px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cut-to-cut">컷to컷</SelectItem>
                <SelectItem value="per-cut">컷별</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {projectId && (
            <Button variant="outline" size="sm" onClick={refreshProject} disabled={loading}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              새로고침
            </Button>
          )}
        </div>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="p-4 pb-0">
          <Card className="border-destructive">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p className="text-sm">{error}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 좌우 패널 레이아웃 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 좌측 패널: 대본 + 등장인물 (단일 카드) */}
        <div className="w-[400px] border-r overflow-y-auto p-4 space-y-4 flex-shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">대본 *</label>
                <Textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="대본을 입력하세요"
                  className="min-h-[200px] resize-none"
                  disabled={generatingGrid || generatingScript}
                />
              </div>

              {/* 공개/비공개 설정 (새 프로젝트일 때만 표시) */}
              {!projectId && (
                <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
                  <Checkbox
                    id="isPublic"
                    checked={newProjectIsPublic}
                    onCheckedChange={(checked) => setNewProjectIsPublic(checked === true)}
                  />
                  <label htmlFor="isPublic" className="text-sm cursor-pointer">
                    공개 프로젝트로 생성
                  </label>
                  <span className="text-xs text-muted-foreground">
                    (비공개 시 본인만 볼 수 있음)
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium">등장인물 (선택)</p>
                  <p className="text-xs text-muted-foreground">등장인물을 설정하지 않으면 AI가 자동 생성합니다</p>
                </div>

                <div className="space-y-2">
                  {characters.map((char, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      {/* 이미지 영역 */}
                      <div className="relative flex-shrink-0 group">
                        <label className="cursor-pointer block">
                          <div className="w-12 h-12 border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden hover:border-primary transition-colors bg-background">
                            {char.imageBase64 ? (
                              <img
                                src={`data:${char.imageMimeType};base64,${char.imageBase64}`}
                                alt={char.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : char.image_path ? (
                              <img
                                src={char.image_path}
                                alt={char.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <Upload className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={generatingGrid || generatingScript}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleCharacterImageUpload(index, file);
                            }}
                          />
                        </label>
                        {/* 캐릭터 시트 검색 버튼 - 호버 시 표시 */}
                        <Button
                          variant="secondary"
                          size="icon"
                          className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => openCharacterSheetDialog(index)}
                          disabled={generatingGrid || generatingScript}
                          title="캐릭터 시트에서 선택"
                        >
                          <Search className="h-2.5 w-2.5" />
                        </Button>
                      </div>

                      {/* 이름 입력 */}
                      <div className="flex-1 min-w-0">
                        <Input
                          value={char.name}
                          onChange={(e) => handleUpdateCharacter(index, 'name', e.target.value)}
                          placeholder="캐릭터 이름"
                          disabled={generatingGrid || generatingScript}
                          className="h-8 text-sm"
                        />
                      </div>

                      {/* 삭제 버튼 */}
                      {characters.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive h-7 w-7 flex-shrink-0"
                          onClick={() => handleRemoveCharacter(index)}
                          disabled={generatingGrid || generatingScript}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}

                  {/* 등장인물 추가 버튼 */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleAddCharacter}
                    disabled={generatingGrid || generatingScript}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    등장인물 추가
                  </Button>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveScriptAndCharacters}
                  disabled={savingProject || !script.trim() || generatingGrid || generatingScript}
                  size="sm"
                >
                  {savingProject ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      저장
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 우측 패널: 패널 카드 + 영상 생성 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {projectId ? (
            <>
              <PanelCardsGrid
                gridSize={gridSize}
                videoMode={videoMode}
                videoScript={videoScript}
                scenes={scenes}
                gridImagePath={gridImagePath}
                generatingScript={generatingScript}
                generatingGrid={generatingGrid}
                generatingPanels={generatingPanels}
                loadingImagePrompt={loadingImagePrompt}
                geminiModel={geminiModel}
                imageStyle={imageStyle}
                onGeminiModelChange={setGeminiModel}
                onImageStyleChange={setImageStyle}
                onGenerateScript={handleGenerateScript}
                onGenerateGrid={handleGenerateGrid}
                onGeneratePanel={handleGeneratePanel}
                onUpdatePanelDescription={handleUpdatePanelDescription}
                onPreviewImagePrompt={handlePreviewImagePrompt}
              />

              {gridImagePath && scenes.length > 0 && (
                <VideoGenerationSection
                  videoMode={videoMode}
                  videoScript={videoScript}
                  scenes={scenes}
                  generatingVideo={generatingVideo}
                  generatingAllVideos={generatingAllVideos}
                  veoApiKey={veoApiKey}
                  onShowApiKeyDialog={() => setShowVeoApiKeyDialog(true)}
                  onGenerateVideo={handleGenerateVideo}
                  onGenerateAllVideos={handleGenerateAllVideos}
                  onUpdateSceneDuration={updateSceneDuration}
                />
              )}
            </>
          ) : (
            <Card className="p-8">
              <div className="flex flex-col items-center justify-center text-center">
                <Video className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">
                  먼저 좌측에서 대본을 입력하고 저장해주세요.
                </p>
              </div>
            </Card>
          )}
        </div>
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

      {/* 이미지 생성 프롬프트 다이얼로그 */}
      <Dialog open={showImagePromptDialog} onOpenChange={setShowImagePromptDialog}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>이미지 생성 프롬프트</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {imagePrompt ? (
              <div className="bg-muted p-4 rounded-lg border">
                <pre className="whitespace-pre-wrap break-words text-sm font-mono overflow-auto">
                  {imagePrompt}
                </pre>
              </div>
            ) : (
              <p className="text-muted-foreground">프롬프트가 없습니다.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImagePromptDialog(false)}>
              닫기
            </Button>
            {imagePrompt && (
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(imagePrompt);
                  setShowImagePromptDialog(false);
                }}
              >
                복사
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 캐릭터 시트 선택 다이얼로그 */}
      <Dialog open={showCharacterSheetDialog} onOpenChange={setShowCharacterSheetDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>캐릭터 시트 선택</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {loadingCharacterSheets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : characterSheets.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                등록된 캐릭터 시트가 없습니다.
              </p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-3 gap-3 pr-4">
                  {characterSheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      className="cursor-pointer border rounded-lg overflow-hidden hover:border-primary transition-colors group"
                      onClick={() => handleSelectCharacterSheet(sheet)}
                    >
                      <div className="aspect-square relative">
                        <img
                          src={sheet.file_path}
                          alt={sheet.character_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Check className="h-8 w-8 text-white" />
                        </div>
                      </div>
                      <div className="p-2 bg-muted/50">
                        <p className="text-xs font-medium truncate">{sheet.character_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{sheet.webtoon_title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCharacterSheetDialog(false)}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
