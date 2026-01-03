'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Film,
  Plus,
  Trash2,
  RefreshCcw,
  ArrowLeft,
  FolderOpen,
  AlertCircle,
  Check,
  Search,
  Sparkles,
  Pencil,
  RotateCcw,
  MapPin,
  ImageIcon,
  Wand2,
  ChevronDown,
  Download,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useStore } from '@/lib/store/useStore';

import { PanelCardsGrid } from '@/components/movie/PanelCardsGrid';
import { VideoGenerationSection } from '@/components/movie/VideoGenerationSection';
import { ImageViewer } from '@/components/ImageViewer';
import {
  GridSize,
  VideoMode,
  VideoScript,
  MovieScene,
  GRID_CONFIGS,
} from '@/components/movie/types';
import { useImageModel } from '@/lib/contexts/ImageModelContext';
import { Upload } from 'lucide-react';

interface MovieProjectListItem {
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

interface MovieCharacter {
  id?: string;
  name: string;
  description: string;
  image_prompt?: string;
  imageBase64?: string;
  imageMimeType?: string;
  image_path?: string;
}

interface MovieBackground {
  id: string;
  name: string;
  image_prompt?: string;
  image_path?: string;
  order_index: number;
}

interface MovieCut {
  id: string;
  cut_index: number;
  camera_shot?: string;
  camera_angle?: string;
  camera_composition?: string;
  image_prompt?: string;
  characters: string[];
  background_id?: string;
  background_name?: string;
  dialogue?: string;
  duration: number;
  image_path?: string;
  video_path?: string;
  video_status?: string;
}

interface MovieProject {
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
  image_style?: 'realistic' | 'cartoon';
  aspect_ratio?: '16:9' | '9:16';
  movie_characters?: MovieCharacter[];
  movie_backgrounds?: MovieBackground[];
  movie_cuts?: MovieCut[];
  movie_scenes?: MovieScene[];
}

export default function ScriptToMoviePage() {
  // 사용자 프로필
  const { profile } = useStore();

  // 뷰 상태: 'list' (목록) 또는 'edit' (편집)
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 프로젝트 목록 상태
  const [projectList, setProjectList] = useState<MovieProjectListItem[]>([]);
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
  const [characters, setCharacters] = useState<MovieCharacter[]>([
    { name: '', description: '' },
  ]);

  // 이미지 생성 설정
  const [imageStyle, setImageStyle] = useState<'realistic' | 'cartoon'>('realistic');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9'); // 16:9 롱폼용 가로, 9:16 숏폼용 세로

  // 이미지 설정 변경 시 DB에 저장
  const handleImageStyleChange = useCallback(async (newStyle: 'realistic' | 'cartoon') => {
    setImageStyle(newStyle);
    if (projectId) {
      try {
        await fetch(`/api/movie/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_style: newStyle }),
        });
      } catch (err) {
        console.error('이미지 스타일 저장 실패:', err);
      }
    }
  }, [projectId]);

  const handleAspectRatioChange = useCallback(async (newRatio: '16:9' | '9:16') => {
    setAspectRatio(newRatio);
    if (projectId) {
      try {
        await fetch(`/api/movie/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aspect_ratio: newRatio }),
        });
      } catch (err) {
        console.error('이미지 비율 저장 실패:', err);
      }
    }
  }, [projectId]);

  // 레거시 상태 (추후 정리 예정)
  const [gridImagePath, setGridImagePath] = useState<string | null>(null);
  const [scenes, setScenes] = useState<MovieScene[]>([]);
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

  // AI 캐릭터 생성 상태
  const [generatingCharacters, setGeneratingCharacters] = useState(false);
  const [regeneratingCharacterId, setRegeneratingCharacterId] = useState<string | null>(null);

  // 캐릭터 프롬프트 편집 다이얼로그
  const [showCharacterPromptDialog, setShowCharacterPromptDialog] = useState(false);
  const [editingCharacterIndex, setEditingCharacterIndex] = useState<number | null>(null);
  const [editingCharacterPrompt, setEditingCharacterPrompt] = useState('');

  // 배경 상태
  const [backgrounds, setBackgrounds] = useState<MovieBackground[]>([]);
  const [analyzingBackgrounds, setAnalyzingBackgrounds] = useState(false);
  const [generatingBackgrounds, setGeneratingBackgrounds] = useState(false);
  const [regeneratingBackgroundId, setRegeneratingBackgroundId] = useState<string | null>(null);

  // 배경 프롬프트 편집 다이얼로그
  const [showBackgroundPromptDialog, setShowBackgroundPromptDialog] = useState(false);
  const [editingBackgroundIndex, setEditingBackgroundIndex] = useState<number | null>(null);
  const [editingBackgroundPrompt, setEditingBackgroundPrompt] = useState('');

  // 컷 상태
  const [cuts, setCuts] = useState<MovieCut[]>([]);
  const [analyzingCuts, setAnalyzingCuts] = useState(false);
  const [generatingCutImages, setGeneratingCutImages] = useState(false);
  const [regeneratingCutIds, setRegeneratingCutIds] = useState<Set<string>>(new Set());

  // 컷 프롬프트 편집 다이얼로그
  const [showCutPromptDialog, setShowCutPromptDialog] = useState(false);
  const [editingCutIndex, setEditingCutIndex] = useState<number | null>(null);
  const [editingCutPrompt, setEditingCutPrompt] = useState('');

  // 컷 재분석 다이얼로그
  const [showCutReanalyzeDialog, setShowCutReanalyzeDialog] = useState(false);
  const [reanalyzingCutIndex, setReanalyzingCutIndex] = useState<number | null>(null);
  const [reanalyzePrompt, setReanalyzePrompt] = useState('');
  const [reanalyzingCutId, setReanalyzingCutId] = useState<string | null>(null);

  // 컷 프롬프트 펼침 상태 (Set of cut IDs)
  const [expandedCutPrompts, setExpandedCutPrompts] = useState<Set<string>>(new Set());

  // 이미지 뷰어 상태
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewerImageUrl, setViewerImageUrl] = useState('');
  const [viewerImageName, setViewerImageName] = useState('');

  // 이미지 뷰어 열기 핸들러
  const handleOpenImageViewer = useCallback((imageUrl: string, imageName: string) => {
    setViewerImageUrl(imageUrl);
    setViewerImageName(imageName);
    setImageViewerOpen(true);
  }, []);

  // 프로젝트 목록 로드
  const loadProjectList = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      params.set('visibility', visibilityFilter);
      if (profile?.id) {
        params.set('currentUserId', profile.id);
      }

      const res = await fetch(`/api/movie?${params.toString()}`);
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
      const res = await fetch(`/api/movie/${id}?${params.toString()}`);
      if (!res.ok) {
        throw new Error('프로젝트를 불러올 수 없습니다.');
      }

      const data: MovieProject = await res.json();
      setProjectId(data.id);
      setTitle(data.title || '');
      setScript(data.script);
      setGridImagePath(data.grid_image_path);
      setVideoScript(data.video_script);
      setScenes(data.movie_scenes || []);
      if (data.video_mode) {
        setVideoMode(data.video_mode);
      }
      if (data.grid_size) {
        setGridSize(data.grid_size);
      }

      // 등장인물 설정 (없으면 빈 상태로 초기화)
      if (data.movie_characters && data.movie_characters.length > 0) {
        setCharacters(
          data.movie_characters.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description || '',
            image_prompt: c.image_prompt || '',
            image_path: c.image_path,
          }))
        );
      } else {
        setCharacters([{ name: '', description: '' }]);
      }

      // 배경 설정
      if (data.movie_backgrounds && data.movie_backgrounds.length > 0) {
        setBackgrounds(data.movie_backgrounds);
      } else {
        setBackgrounds([]);
      }

      // 컷 설정
      if (data.movie_cuts && data.movie_cuts.length > 0) {
        setCuts(data.movie_cuts);
      } else {
        setCuts([]);
      }

      // 공개/비공개 상태 및 소유자 설정
      setProjectIsPublic(data.is_public ?? true);
      setProjectCreatedBy(data.created_by ?? null);

      // 이미지 설정 로드
      if (data.image_style) {
        setImageStyle(data.image_style as 'realistic' | 'cartoon');
      }
      if (data.aspect_ratio) {
        setAspectRatio(data.aspect_ratio as '16:9' | '9:16');
      }

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
    // 배경 및 컷 상태 초기화
    setBackgrounds([]);
    setCuts([]);
    // 이미지 설정 초기화
    setImageStyle('realistic');
    setAspectRatio('16:9');
    setVideoMode('per-cut');
    setGridSize('2x2');
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
      const res = await fetch(`/api/movie/${id}`, { method: 'DELETE' });
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
      const res = await fetch(`/api/movie/${projectId}`, {
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
      const res = await fetch(`/api/movie/${projectId}`, {
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
        const res = await fetch(`/api/movie/${currentProjectId}`, {
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
        const res = await fetch('/api/movie', {
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

        const res = await fetch(`/api/movie/${currentProjectId}/characters`, {
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
      const res = await fetch(`/api/movie/${projectId}/preview-image-prompt?${params.toString()}`);

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
      const res = await fetch(`/api/movie/${projectId}/generate-grid`, {
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
      const res = await fetch(`/api/movie/${projectId}/generate-script`, {
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
        const res = await fetch(`/api/movie/${projectId}/generate-video`, {
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
      const res = await fetch(`/api/movie/${projectId}/generate-video`, {
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
      const res = await fetch(`/api/movie/${projectId}`);
      if (res.ok) {
        const data: MovieProject = await res.json();
        setTitle(data.title || '');
        setScript(data.script);
        setGridImagePath(data.grid_image_path);
        setVideoScript(data.video_script);
        setScenes(data.movie_scenes || []);
        if (data.video_mode) {
          setVideoMode(data.video_mode);
        }
        if (data.grid_size) {
          setGridSize(data.grid_size);
        }

        if (data.movie_characters && data.movie_characters.length > 0) {
          setCharacters(
            data.movie_characters.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description || '',
              image_prompt: c.image_prompt || '',
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
      const res = await fetch(`/api/movie/${projectId}`, {
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
      const res = await fetch(`/api/movie/${projectId}/generate-panel`, {
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
      const res = await fetch(`/api/movie/${projectId}/scenes/${sceneId}`, {
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

  // 캐릭터 분석 (LLM으로 대본에서 캐릭터 추출, 이미지 없음)
  const handleAnalyzeCharacters = useCallback(async () => {
    if (!projectId) {
      setError('먼저 대본을 저장해주세요.');
      return;
    }

    setGeneratingCharacters(true);
    setError(null);

    try {
      const res = await fetch(`/api/movie/${projectId}/analyze-characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style: imageStyle,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '캐릭터 분석에 실패했습니다.');
      }

      const data = await res.json();

      // 분석된 캐릭터로 상태 업데이트 (이미지 없음)
      if (data.characters && data.characters.length > 0) {
        setCharacters(data.characters.map((c: { id: string; name: string; description: string; image_prompt: string; image_path: string }) => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          image_prompt: c.image_prompt || '',
          image_path: c.image_path || null,
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '캐릭터 분석에 실패했습니다.');
    } finally {
      setGeneratingCharacters(false);
    }
  }, [projectId, imageStyle]);

// 캐릭터 이미지 생성 (시작만 5초 간격, 병렬 처리로 효율성 향상)
  const handleGenerateCharacterImages = useCallback(async () => {
    if (!projectId || characters.length === 0) {
      setError('먼저 캐릭터 분석을 실행해주세요.');
      return;
    }

    setGeneratingCharacters(true);
    setError(null);

    // 이미지가 없는 캐릭터만 필터링
    const charactersToGenerate = characters.filter(c => !c.image_path);

    if (charactersToGenerate.length === 0) {
      setGeneratingCharacters(false);
      return;
    }

    const DELAY_BETWEEN_STARTS = 20000; // 시작 간격 20초

    // 각 캐릭터 생성을 Promise로 만들고, 시작만 5초 간격으로
    const generateCharacter = async (char: typeof charactersToGenerate[0], index: number) => {
      // 시작 딜레이 (첫 번째 제외)
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_STARTS * index));
      }

      console.log(`[캐릭터 이미지 생성] 시작 ${index + 1}/${charactersToGenerate.length}: ${char.name}`);

      try {
        const res = await fetch(`/api/movie/${projectId}/generate-characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiProvider: imageModel,
            characterIds: [char.id],
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          console.error(`[캐릭터 이미지 생성] ${char.name} 실패:`, errorData.error);
          return;
        }

        const data = await res.json();

        // 해당 캐릭터만 업데이트 (완료 즉시 UI 반영)
        if (data.characters && data.characters.length > 0) {
          const updatedChar = data.characters.find((c: { id: string }) => c.id === char.id);
          if (updatedChar) {
            console.log(`[캐릭터 이미지 생성] 완료: ${char.name}`);
            setCharacters(prev => prev.map(prevChar =>
              prevChar.id === char.id
                ? { ...prevChar, image_path: updatedChar.image_path }
                : prevChar
            ));
          }
        }
      } catch (err) {
        console.error(`[캐릭터 이미지 생성] ${char.name} 오류:`, err);
      }
    };

    try {
      // 모든 캐릭터를 병렬로 시작 (시작만 5초 간격)
      await Promise.all(
        charactersToGenerate.map((char, index) => generateCharacter(char, index))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '캐릭터 이미지 생성 실패');
    } finally {
      setGeneratingCharacters(false);
    }
  }, [projectId, characters, imageModel]);

  // 개별 캐릭터 이미지 재생성
  const handleRegenerateCharacter = useCallback(async (characterId: string, imagePrompt: string) => {
    if (!projectId || !characterId) return;

    setRegeneratingCharacterId(characterId);
    setError(null);

    try {
      const res = await fetch(`/api/movie/${projectId}/characters/${characterId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePrompt,
          apiProvider: imageModel,
          style: imageStyle,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '캐릭터 이미지 재생성에 실패했습니다.');
      }

      const data = await res.json();

      // 해당 캐릭터만 업데이트
      setCharacters(prev => prev.map(c =>
        c.id === characterId
          ? {
              ...c,
              image_path: data.character.image_path,
              image_prompt: data.character.image_prompt,
            }
          : c
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : '캐릭터 이미지 재생성에 실패했습니다.');
    } finally {
      setRegeneratingCharacterId(null);
    }
  }, [projectId, imageModel, imageStyle]);

  // 캐릭터 프롬프트 편집 다이얼로그 열기
  const openCharacterPromptDialog = useCallback((index: number) => {
    const char = characters[index];
    setEditingCharacterIndex(index);
    setEditingCharacterPrompt(char.image_prompt || '');
    setShowCharacterPromptDialog(true);
  }, [characters]);

  // 캐릭터 프롬프트 저장 및 재생성
  const handleSaveCharacterPromptAndRegenerate = useCallback(async () => {
    if (editingCharacterIndex === null) return;

    const char = characters[editingCharacterIndex];
    if (!char.id) {
      setError('캐릭터가 저장되지 않았습니다. 먼저 저장해주세요.');
      setShowCharacterPromptDialog(false);
      return;
    }

    setShowCharacterPromptDialog(false);
    await handleRegenerateCharacter(char.id, editingCharacterPrompt);
  }, [editingCharacterIndex, characters, editingCharacterPrompt, handleRegenerateCharacter]);

  // 배경 분석 (LLM으로 대본에서 장소 추출)
  const handleAnalyzeBackgrounds = useCallback(async () => {
    if (!projectId) {
      setError('먼저 대본을 저장해주세요.');
      return;
    }

    setAnalyzingBackgrounds(true);
    setError(null);

    try {
      const res = await fetch(`/api/movie/${projectId}/analyze-backgrounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemini-3-flash-preview' }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '배경 분석에 실패했습니다.');
      }

      const data = await res.json();
      setBackgrounds(data.backgrounds || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '배경 분석 실패');
    } finally {
      setAnalyzingBackgrounds(false);
    }
  }, [projectId]);

// 배경 이미지 생성 (시작만 5초 간격, 병렬 처리로 효율성 향상)
  const handleGenerateBackgrounds = useCallback(async () => {
    if (!projectId || backgrounds.length === 0) {
      setError('먼저 배경 분석을 실행해주세요.');
      return;
    }

    setGeneratingBackgrounds(true);
    setError(null);

    // 이미지가 없는 배경만 필터링
    const backgroundsToGenerate = backgrounds.filter(bg => !bg.image_path);

    if (backgroundsToGenerate.length === 0) {
      setGeneratingBackgrounds(false);
      return;
    }

    const DELAY_BETWEEN_STARTS = 20000; // 시작 간격 20초

    // 각 배경 생성을 Promise로 만들고, 시작만 5초 간격으로
    const generateBackground = async (bg: typeof backgroundsToGenerate[0], index: number) => {
      // 시작 딜레이 (첫 번째 제외)
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_STARTS * index));
      }

      console.log(`[배경 생성] 시작 ${index + 1}/${backgroundsToGenerate.length}: ${bg.name}`);

      try {
        const res = await fetch(`/api/movie/${projectId}/generate-backgrounds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiProvider: imageModel,
            aspectRatio: aspectRatio,
            backgroundIds: [bg.id],
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          console.error(`[배경 생성] ${bg.name} 실패:`, errorData.error);
          return;
        }

        const data = await res.json();

        // 해당 배경만 업데이트 (완료 즉시 UI 반영)
        if (data.backgrounds && data.backgrounds.length > 0) {
          // API는 전체 목록을 반환하므로, 해당 ID의 배경을 찾아서 업데이트
          const updatedBg = data.backgrounds.find((b: { id: string }) => b.id === bg.id);
          if (updatedBg) {
            console.log(`[배경 생성] 완료: ${bg.name}`);
            setBackgrounds(prev => prev.map(prevBg =>
              prevBg.id === bg.id ? updatedBg : prevBg
            ));
          }
        }
      } catch (err) {
        console.error(`[배경 생성] ${bg.name} 오류:`, err);
      }
    };

    try {
      // 모든 배경을 병렬로 시작 (시작만 5초 간격)
      await Promise.all(
        backgroundsToGenerate.map((bg, index) => generateBackground(bg, index))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '배경 이미지 생성 실패');
    } finally {
      setGeneratingBackgrounds(false);
    }
  }, [projectId, backgrounds, imageModel, aspectRatio]);

  // 배경 프롬프트 편집 열기
  const handleEditBackgroundPrompt = useCallback((index: number) => {
    const bg = backgrounds[index];
    setEditingBackgroundIndex(index);
    setEditingBackgroundPrompt(bg.image_prompt || '');
    setShowBackgroundPromptDialog(true);
  }, [backgrounds]);

  // 배경 이미지 재생성
  const handleRegenerateBackground = useCallback(async (backgroundId: string, imagePrompt?: string) => {
    if (!projectId) return;

    setRegeneratingBackgroundId(backgroundId);
    setError(null);

    try {
      const res = await fetch(`/api/movie/${projectId}/backgrounds/${backgroundId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePrompt,
          apiProvider: imageModel,
          style: imageStyle,
          aspectRatio: aspectRatio,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '배경 재생성에 실패했습니다.');
      }

      const data = await res.json();

      // 배경 목록 업데이트
      setBackgrounds(prev => prev.map(bg =>
        bg.id === backgroundId ? data.background : bg
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : '배경 재생성 실패');
    } finally {
      setRegeneratingBackgroundId(null);
    }
  }, [projectId, imageModel, imageStyle, aspectRatio]);

  // 배경 프롬프트 저장 및 재생성
  const handleSaveBackgroundPromptAndRegenerate = useCallback(async () => {
    if (editingBackgroundIndex === null) return;

    const bg = backgrounds[editingBackgroundIndex];
    if (!bg.id) {
      setError('배경이 저장되지 않았습니다.');
      setShowBackgroundPromptDialog(false);
      return;
    }

    setShowBackgroundPromptDialog(false);
    await handleRegenerateBackground(bg.id, editingBackgroundPrompt);
  }, [editingBackgroundIndex, backgrounds, editingBackgroundPrompt, handleRegenerateBackground]);

  // 배경 삭제
  const handleDeleteBackground = useCallback(async (backgroundId: string) => {
    if (!projectId) return;

    try {
      const res = await fetch(`/api/movie/${projectId}/backgrounds/${backgroundId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '배경 삭제에 실패했습니다.');
      }

      setBackgrounds(prev => prev.filter(bg => bg.id !== backgroundId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '배경 삭제 실패');
    }
  }, [projectId]);

  // 컷 분할 (LLM으로 대본 분석)
  const handleAnalyzeCuts = useCallback(async () => {
    if (!projectId) {
      setError('먼저 대본을 저장해주세요.');
      return;
    }

    if (backgrounds.length === 0) {
      setError('먼저 배경 분석을 실행해주세요.');
      return;
    }

    if (characters.filter(c => c.name.trim()).length === 0) {
      setError('먼저 등장인물을 추가해주세요.');
      return;
    }

    setAnalyzingCuts(true);
    setError(null);

    try {
      const res = await fetch(`/api/movie/${projectId}/analyze-cuts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemini-3-flash-preview' }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '컷 분할에 실패했습니다.');
      }

      const data = await res.json();
      setCuts(data.cuts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '컷 분할 실패');
    } finally {
      setAnalyzingCuts(false);
    }
  }, [projectId, backgrounds.length, characters]);

  // 컷 프롬프트 편집 열기
  const handleEditCutPrompt = useCallback((index: number) => {
    // 정렬된 배열에서 컷 찾기
    const sortedCuts = [...cuts].sort((a, b) => a.cut_index - b.cut_index);
    const cut = sortedCuts[index];
    setEditingCutIndex(index);
    setEditingCutPrompt(cut?.image_prompt || '');
    setShowCutPromptDialog(true);
  }, [cuts]);

  // 컷 프롬프트 저장
  const handleSaveCutPrompt = useCallback(async () => {
    if (editingCutIndex === null) return;

    // 정렬된 배열에서 컷 찾기
    const sortedCuts = [...cuts].sort((a, b) => a.cut_index - b.cut_index);
    const cut = sortedCuts[editingCutIndex];
    if (!cut?.id || !projectId) {
      setError('컷이 저장되지 않았습니다.');
      setShowCutPromptDialog(false);
      return;
    }

    try {
      const res = await fetch(`/api/movie/${projectId}/cuts/${cut.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_prompt: editingCutPrompt }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '컷 수정에 실패했습니다.');
      }

      // 컷 목록 업데이트 (cut.id로 찾아서 업데이트)
      setCuts(prev => prev.map(c =>
        c.id === cut.id ? { ...c, image_prompt: editingCutPrompt } : c
      ));

      setShowCutPromptDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '컷 수정 실패');
    }
  }, [editingCutIndex, cuts, editingCutPrompt, projectId]);

  // 개별 컷 이미지 다운로드
  const handleDownloadCutImage = useCallback(async (cut: MovieCut) => {
    if (!cut.image_path) return;

    try {
      const response = await fetch(cut.image_path);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cut_${cut.cut_index.toString().padStart(3, '0')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('다운로드 실패:', err);
      setError('이미지 다운로드에 실패했습니다.');
    }
  }, []);

  // 모든 컷 이미지 다운로드
  const [downloadingAllCuts, setDownloadingAllCuts] = useState(false);
  const handleDownloadAllCutImages = useCallback(async () => {
    const cutsWithImages = cuts.filter(cut => cut.image_path);
    if (cutsWithImages.length === 0) {
      setError('다운로드할 이미지가 없습니다.');
      return;
    }

    setDownloadingAllCuts(true);
    try {
      // 순차적으로 다운로드 (브라우저 제한 고려)
      for (const cut of cutsWithImages.sort((a, b) => a.cut_index - b.cut_index)) {
        await handleDownloadCutImage(cut);
        // 브라우저 다운로드 간격
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (err) {
      console.error('일괄 다운로드 실패:', err);
      setError('일부 이미지 다운로드에 실패했습니다.');
    } finally {
      setDownloadingAllCuts(false);
    }
  }, [cuts, handleDownloadCutImage]);

  // 컷 재분석 다이얼로그 열기
  const handleOpenCutReanalyze = useCallback((index: number) => {
    setReanalyzingCutIndex(index);
    setReanalyzePrompt('');
    setShowCutReanalyzeDialog(true);
  }, []);

  // 컷 재분석 실행
  const handleReanalyzeCut = useCallback(async () => {
    if (reanalyzingCutIndex === null || !reanalyzePrompt.trim()) return;

    // 정렬된 배열에서 컷 찾기
    const sortedCuts = [...cuts].sort((a, b) => a.cut_index - b.cut_index);
    const cut = sortedCuts[reanalyzingCutIndex];
    if (!cut?.id || !projectId) {
      setError('컷이 저장되지 않았습니다.');
      setShowCutReanalyzeDialog(false);
      return;
    }

    setReanalyzingCutId(cut.id);
    setError(null);

    try {
      const res = await fetch(`/api/movie/${projectId}/cuts/${cut.id}/reanalyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPrompt: reanalyzePrompt }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '컷 재분석에 실패했습니다.');
      }

      const data = await res.json();

      // 컷 목록 업데이트 (cut.id로 찾아서 업데이트)
      setCuts(prev => prev.map(c =>
        c.id === cut.id ? { ...data.cut, image_path: c.image_path } : c
      ));

      setShowCutReanalyzeDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '컷 재분석 실패');
    } finally {
      setReanalyzingCutId(null);
    }
  }, [reanalyzingCutIndex, cuts, reanalyzePrompt, projectId]);

  // 컷 삭제
  const handleDeleteCut = useCallback(async (cutId: string) => {
    if (!projectId) return;

    try {
      const res = await fetch(`/api/movie/${projectId}/cuts/${cutId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '컷 삭제에 실패했습니다.');
      }

      setCuts(prev => prev.filter(c => c.id !== cutId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '컷 삭제 실패');
    }
  }, [projectId]);

  // 컷 이미지 생성 (옵션: 'all' = 전체, 'missing' = 이미지 없는 것만)
  const handleGenerateCutImages = useCallback(async (mode: 'all' | 'missing' = 'all') => {
    if (!projectId || cuts.length === 0) {
      setError('먼저 컷 분할을 실행해주세요.');
      return;
    }

    // 이미지가 없는 컷만 생성할 경우
    if (mode === 'missing') {
      const cutsWithoutImage = cuts.filter(c => !c.image_path);
      if (cutsWithoutImage.length === 0) {
        setError('모든 컷에 이미지가 있습니다.');
        return;
      }
    }

    setGeneratingCutImages(true);
    setError(null);

    try {
      const res = await fetch(`/api/movie/${projectId}/generate-cut-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiProvider: imageModel,
          style: imageStyle,
          aspectRatio: aspectRatio,
          mode: mode, // 'all' or 'missing'
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '컷 이미지 생성에 실패했습니다.');
      }

      const data = await res.json();
      setCuts(data.cuts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '컷 이미지 생성 실패');
    } finally {
      setGeneratingCutImages(false);
    }
  }, [projectId, cuts, imageModel, imageStyle, aspectRatio]);

  // 개별 컷 이미지 재생성 (병렬 가능)
  const handleRegenerateCutImage = useCallback(async (cutId: string, imagePrompt?: string) => {
    if (!projectId) return;

    // 이미 생성 중이면 무시
    if (regeneratingCutIds.has(cutId)) return;

    setRegeneratingCutIds(prev => new Set([...prev, cutId]));
    setError(null);

    try {
      const res = await fetch(`/api/movie/${projectId}/cuts/${cutId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePrompt,
          apiProvider: imageModel,
          style: imageStyle,
          aspectRatio: aspectRatio,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '컷 이미지 재생성에 실패했습니다.');
      }

      const data = await res.json();

      // 컷 목록 업데이트
      setCuts(prev => prev.map(c =>
        c.id === cutId ? data.cut : c
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : '컷 이미지 재생성 실패');
    } finally {
      setRegeneratingCutIds(prev => {
        const next = new Set(prev);
        next.delete(cutId);
        return next;
      });
    }
  }, [projectId, imageModel, imageStyle, aspectRatio, regeneratingCutIds]);

  // 컷 프롬프트 저장 및 재생성
  const handleSaveCutPromptAndRegenerate = useCallback(async () => {
    if (editingCutIndex === null) return;

    // 정렬된 배열에서 컷 찾기
    const sortedCuts = [...cuts].sort((a, b) => a.cut_index - b.cut_index);
    const cut = sortedCuts[editingCutIndex];
    if (!cut?.id || !projectId) {
      setError('컷이 저장되지 않았습니다.');
      setShowCutPromptDialog(false);
      return;
    }

    setShowCutPromptDialog(false);
    await handleRegenerateCutImage(cut.id, editingCutPrompt);
  }, [editingCutIndex, cuts, editingCutPrompt, projectId, handleRegenerateCutImage]);

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
            <Film className="h-6 w-6" />
            <h1 className="text-2xl font-bold">대본 → 영화 영상</h1>
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
          <Film className="h-6 w-6" />
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
          {/* 이미지 생성 설정 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">스타일:</span>
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              <Button
                variant={imageStyle === 'cartoon' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleImageStyleChange('cartoon')}
              >
                🎨 만화풍
              </Button>
              <Button
                variant={imageStyle === 'realistic' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleImageStyleChange('realistic')}
              >
                📷 실사풍
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">비율:</span>
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              <Button
                variant={aspectRatio === '16:9' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleAspectRatioChange('16:9')}
              >
                📺 가로
              </Button>
              <Button
                variant={aspectRatio === '9:16' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleAspectRatioChange('9:16')}
              >
                📱 세로
              </Button>
            </div>
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
        {/* 좌측 패널: 대본 + 등장인물 */}
        <div className="w-[400px] border-r overflow-y-auto p-4 space-y-4 flex-shrink-0">
          {/* 대본 + 등장인물 */}
          <Card>
            <CardContent className="space-y-4 pt-4">
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">등장인물</p>
                    <p className="text-xs text-muted-foreground">대본 분석 → 이미지 생성 순서로 진행</p>
                  </div>
                  {projectId && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAnalyzeCharacters}
                        disabled={generatingCharacters || generatingGrid || generatingScript || !script.trim()}
                      >
                        {generatingCharacters && characters.length === 0 ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            분석 중...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3 mr-1" />
                            1. 분석
                          </>
                        )}
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleGenerateCharacterImages}
                        disabled={generatingCharacters || generatingGrid || characters.length === 0}
                        className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                      >
                        {generatingCharacters && characters.length > 0 ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            생성 중...
                          </>
                        ) : (
                          <>
                            <ImageIcon className="h-3 w-3 mr-1" />
                            2. 이미지 생성
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {characters.map((char, index) => (
                    <div key={char.id || index} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      {/* 이미지 영역 */}
                      <div className="relative flex-shrink-0 group">
                        {regeneratingCharacterId === char.id ? (
                          <div className="w-12 h-12 border-2 border-dashed rounded-lg flex items-center justify-center bg-background">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <>
                            <div className="relative">
                              <div
                                className="w-12 h-12 border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden hover:border-primary transition-colors bg-background cursor-pointer"
                                onClick={() => {
                                  const imgUrl = char.imageBase64
                                    ? `data:${char.imageMimeType};base64,${char.imageBase64}`
                                    : char.image_path;
                                  if (imgUrl) handleOpenImageViewer(imgUrl, char.name || '캐릭터');
                                }}
                              >
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
                                  <label className="cursor-pointer w-full h-full flex items-center justify-center">
                                    <Upload className="h-4 w-4 text-muted-foreground" />
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      disabled={generatingGrid || generatingScript || generatingCharacters}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleCharacterImageUpload(index, file);
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                            </div>
                            {/* 호버 시 버튼들 표시 */}
                            <div className="absolute -bottom-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="secondary"
                                size="icon"
                                className="h-5 w-5 rounded-full shadow-sm"
                                onClick={() => openCharacterSheetDialog(index)}
                                disabled={generatingGrid || generatingScript || generatingCharacters}
                                title="캐릭터 시트에서 선택"
                              >
                                <Search className="h-2.5 w-2.5" />
                              </Button>
                              {char.id && char.image_prompt && (
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="h-5 w-5 rounded-full shadow-sm"
                                  onClick={() => openCharacterPromptDialog(index)}
                                  disabled={generatingGrid || generatingScript || generatingCharacters}
                                  title="프롬프트 수정 및 재생성"
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* 이름 + 설명 */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <Input
                          value={char.name}
                          onChange={(e) => handleUpdateCharacter(index, 'name', e.target.value)}
                          placeholder="캐릭터 이름"
                          disabled={generatingGrid || generatingScript || generatingCharacters}
                          className="h-7 text-sm"
                        />
                        {char.description && (
                          <p className="text-[10px] text-muted-foreground line-clamp-1 px-1">
                            {char.description}
                          </p>
                        )}
                      </div>

                      {/* 삭제 버튼 */}
                      {characters.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive h-7 w-7 flex-shrink-0"
                          onClick={() => handleRemoveCharacter(index)}
                          disabled={generatingGrid || generatingScript || generatingCharacters}
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
                    disabled={generatingGrid || generatingScript || generatingCharacters}
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

          {/* 배경(씬) 섹션 */}
          {projectId && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">배경 (씬)</CardTitle>
                    <p className="text-xs text-muted-foreground">대본에서 장소를 추출하고 배경 이미지를 생성합니다</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAnalyzeBackgrounds}
                      disabled={analyzingBackgrounds || generatingBackgrounds || !script.trim()}
                    >
                      {analyzingBackgrounds ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          분석 중...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-3 w-3 mr-1" />
                          AI 분석
                        </>
                      )}
                    </Button>
                    {backgrounds.length > 0 && (
                      <Button
                        size="sm"
                        onClick={handleGenerateBackgrounds}
                        disabled={analyzingBackgrounds || generatingBackgrounds}
                        className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                      >
                        {generatingBackgrounds ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            생성 중...
                          </>
                        ) : (
                          <>
                            <ImageIcon className="h-3 w-3 mr-1" />
                            이미지 생성
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {backgrounds.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">배경이 없습니다</p>
                    <p className="text-xs">AI 분석 버튼을 클릭하여 대본에서 장소를 추출하세요</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {backgrounds.map((bg, index) => (
                      <div key={bg.id} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                        {/* 이미지 영역 */}
                        <div className="relative flex-shrink-0 group">
                          {regeneratingBackgroundId === bg.id ? (
                            <div className="w-16 h-10 border-2 border-dashed rounded-lg flex items-center justify-center bg-background">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : bg.image_path ? (
                            <div className="relative w-16 h-10 rounded-lg overflow-hidden">
                              <img
                                src={bg.image_path}
                                alt={bg.name}
                                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => handleOpenImageViewer(bg.image_path!, bg.name)}
                              />
                              {/* 호버 시 재생성 버튼 (우측 하단 작은 아이콘) */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRegenerateBackground(bg.id);
                                }}
                                className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-secondary shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                title="재생성"
                              >
                                <RotateCcw className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="w-16 h-10 border-2 border-dashed rounded-lg flex items-center justify-center bg-background">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* 배경 정보 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{bg.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {bg.image_prompt?.substring(0, 40) || '프롬프트 없음'}...
                          </p>
                        </div>

                        {/* 액션 버튼 */}
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEditBackgroundPrompt(index)}
                            title="프롬프트 수정"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteBackground(bg.id)}
                            title="삭제"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>

        {/* 우측 패널: 컷 분할 + 영상 생성 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {projectId ? (
            <>
              {/* 컷 분할 섹션 */}
              {backgrounds.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">컷 분할</CardTitle>
                        <p className="text-sm text-muted-foreground">대본을 영화 컷으로 분할합니다</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={handleAnalyzeCuts}
                          disabled={analyzingCuts || generatingCutImages || characters.filter(c => c.name.trim()).length === 0}
                        >
                          {analyzingCuts ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              분석 중...
                            </>
                          ) : (
                            <>
                              <Wand2 className="h-4 w-4 mr-2" />
                              AI 분할
                            </>
                          )}
                        </Button>
                        {cuts.length > 0 && (
                          <>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  disabled={analyzingCuts || generatingCutImages}
                                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                                >
                                  {generatingCutImages ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      생성 중...
                                    </>
                                  ) : (
                                    <>
                                      <ImageIcon className="h-4 w-4 mr-2" />
                                      이미지 생성
                                      <ChevronDown className="h-3 w-3 ml-1" />
                                    </>
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleGenerateCutImages('all')}>
                                  <ImageIcon className="h-4 w-4 mr-2" />
                                  전체 이미지 생성
                                  <span className="text-xs text-muted-foreground ml-2">({cuts.length}개)</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleGenerateCutImages('missing')}
                                  disabled={!cuts.some(c => !c.image_path)}
                                >
                                  <ImageIcon className="h-4 w-4 mr-2" />
                                  이미지 없는 컷만 생성
                                  <span className="text-xs text-muted-foreground ml-2">
                                    ({cuts.filter(c => !c.image_path).length}개)
                                  </span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {cuts.some(c => c.image_path) && (
                              <Button
                                variant="outline"
                                onClick={handleDownloadAllCutImages}
                                disabled={downloadingAllCuts}
                              >
                                {downloadingAllCuts ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    다운로드 중...
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-4 w-4 mr-2" />
                                    전체 다운로드
                                  </>
                                )}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {cuts.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Film className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-lg font-medium">컷이 없습니다</p>
                        <p className="text-sm">AI 분할 버튼을 클릭하여 대본을 컷으로 분할하세요</p>
                        <p className="text-xs mt-2">캐릭터와 배경이 먼저 준비되어야 합니다</p>
                      </div>
                    ) : (
                      <div className={`grid gap-3 ${
                        aspectRatio === '9:16'
                          ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                          : 'md:grid-cols-2 lg:grid-cols-3'
                      }`}>
                        {[...cuts].sort((a, b) => a.cut_index - b.cut_index).map((cut, index) => (
                          <div key={cut.id} className="border rounded-lg p-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                            {/* 헤더: 컷 번호 + 액션 */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                                  {cut.cut_index}
                                </div>
                                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                  {cut.background_name || '배경 없음'}
                                </span>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleEditCutPrompt(index)}
                                  title="프롬프트 수정"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-orange-600 hover:text-orange-700"
                                  onClick={() => handleOpenCutReanalyze(index)}
                                  disabled={reanalyzingCutId === cut.id}
                                  title="AI 재분석"
                                >
                                  {reanalyzingCutId === cut.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Wand2 className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteCut(cut.id)}
                                  title="삭제"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            {/* 이미지 영역 - 비율에 따라 크기 변경 */}
                            <div
                              className={`bg-muted rounded-lg mb-2 flex items-center justify-center relative overflow-hidden ${
                                aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'
                              }`}
                            >
                              {regeneratingCutIds.has(cut.id) ? (
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <Loader2 className="h-8 w-8 animate-spin mb-1" />
                                  <p className="text-xs">생성 중...</p>
                                </div>
                              ) : cut.image_path ? (
                                <div className="relative w-full h-full group">
                                  <img
                                    src={cut.image_path}
                                    alt={`컷 ${cut.cut_index}`}
                                    className="w-full h-full object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-black/5"
                                    onClick={() => handleOpenImageViewer(cut.image_path!, `컷 ${cut.cut_index}`)}
                                  />
                                  {/* 호버 시 다운로드 버튼 */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadCutImage(cut);
                                    }}
                                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                                    title="이미지 다운로드"
                                  >
                                    <Download className="h-3 w-3 text-white" />
                                  </button>
                                </div>
                              ) : (
                                <div className="text-center text-muted-foreground">
                                  <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-50" />
                                  <p className="text-xs">이미지 없음</p>
                                </div>
                              )}
                            </div>

                            {/* 이미지 생성/재생성 버튼 */}
                            <Button
                              variant={cut.image_path ? "outline" : "default"}
                              size="sm"
                              className="w-full mb-2"
                              onClick={() => handleRegenerateCutImage(cut.id)}
                              disabled={regeneratingCutIds.has(cut.id) || generatingCutImages}
                            >
                              {regeneratingCutIds.has(cut.id) || generatingCutImages ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  생성 중...
                                </>
                              ) : cut.image_path ? (
                                <>
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  재생성
                                </>
                              ) : (
                                <>
                                  <ImageIcon className="h-3 w-3 mr-1" />
                                  이미지 생성
                                </>
                              )}
                            </Button>

                            {/* 정보 */}
                            <div className="space-y-2">
                              {cut.characters && cut.characters.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium">등장:</span> {cut.characters.join(', ')}
                                </p>
                              )}
                              {/* 실제 LLM에 전송되는 전체 프롬프트 (접기/펼치기) */}
                              <div className="text-xs text-muted-foreground bg-muted/50 rounded overflow-hidden">
                                <button
                                  onClick={() => setExpandedCutPrompts(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(cut.id)) {
                                      newSet.delete(cut.id);
                                    } else {
                                      newSet.add(cut.id);
                                    }
                                    return newSet;
                                  })}
                                  className="w-full p-2 flex items-center justify-between hover:bg-muted/70 transition-colors"
                                >
                                  <span className="font-medium">📝 전체 프롬프트</span>
                                  <ChevronDown className={`h-3 w-3 transition-transform ${expandedCutPrompts.has(cut.id) ? 'rotate-180' : ''}`} />
                                </button>

                                {expandedCutPrompts.has(cut.id) && (
                                  <div className="p-2 pt-0 border-t border-muted">
                                    {/* 전체 프롬프트 (스타일, 카메라, 레퍼런스 모두 포함) */}
                                    <p className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words">
                                      {cut.image_prompt || '프롬프트 없음'}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {cut.dialogue && (
                                <div className="text-xs italic text-muted-foreground bg-primary/5 rounded p-2">
                                  <span className="font-medium not-italic">대사:</span>
                                  <p className="mt-1 whitespace-pre-wrap break-words">
                                    &quot;{cut.dialogue}&quot;
                                  </p>
                                </div>
                              )}
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">길이:</span> {cut.duration}초 | <span className="font-medium">비율:</span> {aspectRatio}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

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
                <Film className="h-16 w-16 text-muted-foreground/30 mb-4" />
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

      {/* 캐릭터 프롬프트 편집 다이얼로그 */}
      <Dialog open={showCharacterPromptDialog} onOpenChange={setShowCharacterPromptDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>
              캐릭터 프롬프트 수정
              {editingCharacterIndex !== null && characters[editingCharacterIndex] && (
                <span className="text-muted-foreground font-normal ml-2">
                  - {characters[editingCharacterIndex].name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">이미지 생성 프롬프트 (영어)</label>
              <Textarea
                value={editingCharacterPrompt}
                onChange={(e) => setEditingCharacterPrompt(e.target.value)}
                placeholder="character portrait of a young man with..."
                className="min-h-[150px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                프롬프트를 수정하고 &quot;저장 및 재생성&quot;을 클릭하면 새 이미지가 생성됩니다.
              </p>
            </div>
            {editingCharacterIndex !== null && characters[editingCharacterIndex]?.image_path && (
              <div className="space-y-2">
                <label className="text-sm font-medium">현재 이미지</label>
                <div className="w-32 h-32 border rounded-lg overflow-hidden">
                  <img
                    src={characters[editingCharacterIndex].image_path}
                    alt={characters[editingCharacterIndex].name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCharacterPromptDialog(false)}>
              취소
            </Button>
            <Button
              onClick={handleSaveCharacterPromptAndRegenerate}
              disabled={!editingCharacterPrompt.trim() || regeneratingCharacterId !== null}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              {regeneratingCharacterId ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  재생성 중...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  저장 및 재생성
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 배경 프롬프트 편집 다이얼로그 */}
      <Dialog open={showBackgroundPromptDialog} onOpenChange={setShowBackgroundPromptDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>
              배경 프롬프트 수정
              {editingBackgroundIndex !== null && backgrounds[editingBackgroundIndex] && (
                <span className="text-muted-foreground ml-2">
                  - {backgrounds[editingBackgroundIndex].name}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              배경 이미지 생성에 사용될 프롬프트를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">이미지 프롬프트</label>
              <Textarea
                value={editingBackgroundPrompt}
                onChange={(e) => setEditingBackgroundPrompt(e.target.value)}
                placeholder="background scene of a cozy cafe interior..."
                className="min-h-[150px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                프롬프트를 수정하고 &quot;저장 및 재생성&quot;을 클릭하면 새 이미지가 생성됩니다.
              </p>
            </div>
            {editingBackgroundIndex !== null && backgrounds[editingBackgroundIndex]?.image_path && (
              <div className="space-y-2">
                <label className="text-sm font-medium">현재 이미지</label>
                <div className="w-48 h-28 border rounded-lg overflow-hidden">
                  <img
                    src={backgrounds[editingBackgroundIndex].image_path}
                    alt={backgrounds[editingBackgroundIndex].name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBackgroundPromptDialog(false)}
            >
              취소
            </Button>
            <Button
              onClick={handleSaveBackgroundPromptAndRegenerate}
              disabled={!editingBackgroundPrompt.trim() || regeneratingBackgroundId !== null}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
            >
              {regeneratingBackgroundId ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  재생성 중...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  저장 및 재생성
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 컷 프롬프트 편집 다이얼로그 */}
      <Dialog open={showCutPromptDialog} onOpenChange={setShowCutPromptDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>
              컷 프롬프트 수정
              {(() => {
                const sortedCuts = [...cuts].sort((a, b) => a.cut_index - b.cut_index);
                const currentCut = editingCutIndex !== null ? sortedCuts[editingCutIndex] : null;
                return currentCut ? (
                  <span className="text-muted-foreground ml-2">
                    - 컷 {currentCut.cut_index}
                  </span>
                ) : null;
              })()}
            </DialogTitle>
            <DialogDescription>
              컷 이미지 생성에 사용될 프롬프트를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">이미지 프롬프트</label>
              <Textarea
                value={editingCutPrompt}
                onChange={(e) => setEditingCutPrompt(e.target.value)}
                placeholder="medium shot, character sitting at a table..."
                className="min-h-[150px] font-mono text-sm"
              />
            </div>
            {(() => {
              const sortedCuts = [...cuts].sort((a, b) => a.cut_index - b.cut_index);
              const currentCut = editingCutIndex !== null ? sortedCuts[editingCutIndex] : null;
              if (!currentCut) return null;
              return (
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <span className="font-medium">배경:</span>
                    <span className="text-muted-foreground">{currentCut.background_name || '없음'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium">등장인물:</span>
                    <span className="text-muted-foreground">{currentCut.characters?.join(', ') || '없음'}</span>
                  </div>
                  {currentCut.dialogue && (
                    <div className="flex gap-2">
                      <span className="font-medium">대사:</span>
                      <span className="text-muted-foreground italic">&quot;{currentCut.dialogue}&quot;</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCutPromptDialog(false)}
            >
              취소
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveCutPrompt}
              disabled={!editingCutPrompt.trim()}
            >
              <Check className="h-4 w-4 mr-2" />
              저장만
            </Button>
            <Button
              onClick={handleSaveCutPromptAndRegenerate}
              disabled={(() => {
                const sortedCuts = [...cuts].sort((a, b) => a.cut_index - b.cut_index);
                const currentCut = editingCutIndex !== null ? sortedCuts[editingCutIndex] : null;
                return !editingCutPrompt.trim() || !!(currentCut && regeneratingCutIds.has(currentCut.id || ''));
              })()}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              {(() => {
                const sortedCuts = [...cuts].sort((a, b) => a.cut_index - b.cut_index);
                const currentCut = editingCutIndex !== null ? sortedCuts[editingCutIndex] : null;
                return currentCut && regeneratingCutIds.has(currentCut.id || '') ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    재생성 중...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    저장 및 재생성
                  </>
                );
              })()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 컷 재분석 다이얼로그 */}
      <Dialog open={showCutReanalyzeDialog} onOpenChange={setShowCutReanalyzeDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>
              AI 컷 재분석
              {(() => {
                const sortedCuts = [...cuts].sort((a, b) => a.cut_index - b.cut_index);
                const currentCut = reanalyzingCutIndex !== null ? sortedCuts[reanalyzingCutIndex] : null;
                return currentCut ? (
                  <span className="text-muted-foreground ml-2">
                    - 컷 {currentCut.cut_index}
                  </span>
                ) : null;
              })()}
            </DialogTitle>
            <DialogDescription>
              수정 요청을 입력하면 AI가 컷 정보(카메라, 배경, 등장인물, 프롬프트)를 재분석합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 현재 컷 정보 */}
            {(() => {
              const sortedCuts = [...cuts].sort((a, b) => a.cut_index - b.cut_index);
              const currentCut = reanalyzingCutIndex !== null ? sortedCuts[reanalyzingCutIndex] : null;
              if (!currentCut) return null;
              return (
                <div className="space-y-2 text-sm bg-muted/50 rounded-lg p-3">
                  <p className="font-medium text-xs uppercase text-muted-foreground">현재 컷 정보</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-medium">카메라:</span>{' '}
                      <span className="text-muted-foreground">
                        {currentCut.camera_shot || 'MS'} / {currentCut.camera_angle || 'Eye Level'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">배경:</span>{' '}
                      <span className="text-muted-foreground">{currentCut.background_name || '없음'}</span>
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">등장인물:</span>{' '}
                    <span className="text-muted-foreground">{currentCut.characters?.join(', ') || '없음'}</span>
                  </div>
                  <div>
                    <span className="font-medium">프롬프트:</span>{' '}
                    <span className="text-muted-foreground text-xs">{currentCut.image_prompt?.substring(0, 100) || '없음'}...</span>
                  </div>
                </div>
              );
            })()}
            <div className="space-y-2">
              <label className="text-sm font-medium">수정 요청</label>
              <Textarea
                value={reanalyzePrompt}
                onChange={(e) => setReanalyzePrompt(e.target.value)}
                placeholder="예: 클로즈업으로 바꿔줘 / 카메라 앵글을 낮게 해줘 / 더 긴장감 있게 연출해줘 / 배경을 집 거실로 바꿔줘"
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                자연어로 수정 요청을 작성하면 AI가 컷 정보를 전체적으로 재분석합니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCutReanalyzeDialog(false)}
            >
              취소
            </Button>
            <Button
              onClick={handleReanalyzeCut}
              disabled={!reanalyzePrompt.trim() || reanalyzingCutId !== null}
              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
            >
              {reanalyzingCutId ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  재분석 중...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  AI 재분석
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 이미지 뷰어 */}
      <ImageViewer
        imageUrl={viewerImageUrl}
        imageName={viewerImageName}
        open={imageViewerOpen}
        onOpenChange={setImageViewerOpen}
      />
    </div>
  );
}
