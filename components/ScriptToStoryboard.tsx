'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, FileText, Send, Trash2, ArrowUp, ArrowDown, Plus, RefreshCcw, PenLine, User, Users, Sparkles, Check, Edit, Scissors, ListPlus } from 'lucide-react';
import { ImageViewer } from '@/components/ImageViewer';
import { CharacterEditDialog } from '@/components/CharacterEditDialog';
import { Webtoon, Episode } from '@/lib/supabase';
import { createCharacter, getCharactersByWebtoon } from '@/lib/api/characters';
import { CharacterWithSheets } from '@/lib/supabase';
import { getEpisodes } from '@/lib/api/episodes';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useImageModel } from '@/lib/contexts/ImageModelContext';

interface Cut {
  cutNumber: number;
  title: string;
  background?: string;
  description: string;
  dialogue?: string;
  // 이 컷에 등장하는 모든 인물 이름 (대사가 없는 캐릭터도 포함)
  charactersInCut?: string[];
  // 관련배경 목록
  relatedBackgrounds?: Array<{ cutNumber: number; background: string }>;
}

interface StoryboardImage {
  id: string;
  storyboard_id: string;
  cut_index: number;
  mime_type: string;
  image_base64: string;
}

interface Storyboard {
  id: string;
  model?: string | null;
  response_json: { cuts?: Cut[] };
  created_at: string;
  images?: StoryboardImage[];
}

interface Script {
  id: string;
  episode_id: string;
  title: string;
  content: string;
  order_index: number;
  storyboards?: Storyboard[];
  character_analysis?: {
    characters: Array<{
      name: string;
      description: string;
      existsInDb: boolean;
      characterId: string | null;
      characterSheets: Array<{ id: string; file_path: string; thumbnail_path?: string | null }>;
    }>;
    webtoonId: string;
    analyzedAt?: string;
  };
}

interface ScriptToStoryboardProps {
  cutId?: string;
  episodeId?: string;
  webtoonId?: string;
}

export function ScriptToStoryboard({ cutId, episodeId: initialEpisodeId, webtoonId }: ScriptToStoryboardProps) {
  const router = useRouter();
  const { model: imageModel } = useImageModel();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 회차 선택 상태
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(initialEpisodeId || '');
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [cutDrawingIds, setCutDrawingIds] = useState<Set<string>>(new Set());
  const [cutImages, setCutImages] = useState<Record<string, string>>({});
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [viewingImageName, setViewingImageName] = useState<string>('');
  const [imageViewerOpen, setImageViewerOpen] = useState(false);

  // 캐릭터 분석 관련 상태
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [characterAnalysis, setCharacterAnalysis] = useState<Record<string, {
    characters: Array<{
      name: string;
      description: string;
      existsInDb: boolean;
      characterId: string | null;
      characterSheets: Array<{ id: string; file_path: string; thumbnail_path?: string | null }>;
    }>;
    webtoonId: string;
  }>>({});
  const [characterEditOpen, setCharacterEditOpen] = useState(false);
  const [editingCharacterForScript, setEditingCharacterForScript] = useState<{ scriptId: string; characterName: string; characterDescription: string; webtoonId: string } | null>(null);

  // 캐릭터 이미지 생성 관련 상태
  const [generatingCharacterImage, setGeneratingCharacterImage] = useState<string | null>(null); // "scriptId:characterIndex"
  const [previewImageData, setPreviewImageData] = useState<{
    imageUrl: string;
    imageData: string;
    mimeType: string;
    scriptId: string;
    characterIndex: number;
    characterName: string;
    characterDescription: string;
    webtoonId: string;
    characterId: string | null;
  } | null>(null);
  const [acceptingImage, setAcceptingImage] = useState(false);

  // 대본 전체 보기 상태 관리
  const [expandedScripts, setExpandedScripts] = useState<Set<string>>(new Set());

  // 선택된 대본 ID 상태 관리
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);

  // 대본 추가 폼 표시 상태
  const [showAddScriptForm, setShowAddScriptForm] = useState(false);

  // 선택된 캐릭터시트 인덱스 관리 (scriptId:characterName -> sheetIndex)
  // 캐릭터 이름을 키로 사용하여 인덱스 변경에 영향받지 않도록 함
  const [selectedCharacterSheet, setSelectedCharacterSheet] = useState<Record<string, number>>({});

  // 컷 수정 관련 상태
  const [editingCut, setEditingCut] = useState<{ storyboardId: string; cutIndex: number; cut: Cut } | null>(null);
  const [modificationPrompt, setModificationPrompt] = useState('');
  const [modifyingCut, setModifyingCut] = useState(false);
  const [cutEditDialogOpen, setCutEditDialogOpen] = useState(false);

  // 컷 직접 수정 관련 상태
  const [directEditMode, setDirectEditMode] = useState(false);
  const [directEditValues, setDirectEditValues] = useState<{
    title: string;
    background: string;
    description: string;
    dialogue: string;
    charactersInCut: string;
  }>({ title: '', background: '', description: '', dialogue: '', charactersInCut: '' });
  const [savingDirectEdit, setSavingDirectEdit] = useState(false);

  // 컷 분할 관련 상태
  const [splittingCut, setSplittingCut] = useState<string | null>(null); // "storyboardId:cutIndex"

  // 이미지 로드 추적 (중복 로드 방지)
  const [loadedStoryboardImages, setLoadedStoryboardImages] = useState<Set<string>>(new Set());

  // 이미지 로딩 중인 storyboard ID 추적
  const [loadingStoryboardImages, setLoadingStoryboardImages] = useState<Set<string>>(new Set());

  // 수동입력 관련 상태
  const [webtoonCharacters, setWebtoonCharacters] = useState<CharacterWithSheets[]>([]);
  const [loadingWebtoonCharacters, setLoadingWebtoonCharacters] = useState(false);
  const [manualSelectOpen, setManualSelectOpen] = useState(false);
  const [selectedManualCharacters, setSelectedManualCharacters] = useState<Set<string>>(new Set());
  const [savingManualCharacters, setSavingManualCharacters] = useState(false);

  // 대본 수정 관련 상태
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [editScriptTitle, setEditScriptTitle] = useState('');
  const [editScriptContent, setEditScriptContent] = useState('');
  const [savingEditScript, setSavingEditScript] = useState(false);
  const [editScriptDialogOpen, setEditScriptDialogOpen] = useState(false);

  // 컷목록 바로넣기 관련 상태
  const [savingCutList, setSavingCutList] = useState(false);
  const [cutListConfirmOpen, setCutListConfirmOpen] = useState(false);
  const [pendingCutListScript, setPendingCutListScript] = useState<Script | null>(null);

  // 배경 관련 상태
  const [cutBackgroundImages, setCutBackgroundImages] = useState<Record<string, string>>({});
  const [generatingBgDescKey, setGeneratingBgDescKey] = useState<string | null>(null);
  const [generatingBgImageKey, setGeneratingBgImageKey] = useState<string | null>(null);
  const [editingBgDescKey, setEditingBgDescKey] = useState<string | null>(null);
  const [editingBgDescValue, setEditingBgDescValue] = useState('');

  // 회차 목록 로드
  useEffect(() => {
    if (webtoonId) {
      setLoadingEpisodes(true);
      getEpisodes(webtoonId)
        .then((data) => {
          // episode_number 순으로 정렬 (0번 "기타"는 맨 위)
          const sorted = [...data].sort((a, b) => {
            if (a.episode_number === 0) return -1;
            if (b.episode_number === 0) return 1;
            return a.episode_number - b.episode_number;
          });
          setEpisodes(sorted);

          // initialEpisodeId가 없으면 첫 번째 회차 자동 선택
          if (!initialEpisodeId && sorted.length > 0) {
            setSelectedEpisodeId(sorted[0].id);
          }
        })
        .catch((err) => console.error('회차 목록 로드 실패:', err))
        .finally(() => setLoadingEpisodes(false));
    }
  }, [webtoonId, initialEpisodeId]);

  // 웹툰 캐릭터 목록 로드
  useEffect(() => {
    if (webtoonId) {
      setLoadingWebtoonCharacters(true);
      getCharactersByWebtoon(webtoonId)
        .then((data) => {
          setWebtoonCharacters(data);
        })
        .catch((err) => console.error('웹툰 캐릭터 목록 로드 실패:', err))
        .finally(() => setLoadingWebtoonCharacters(false));
    }
  }, [webtoonId]);

  // 현재 선택된 episodeId (props로 받은 것 또는 선택한 것)
  const episodeId = initialEpisodeId || selectedEpisodeId;

  const canLoad = useMemo(() => !!episodeId, [episodeId]);

  const loadScripts = useCallback(async () => {
    if (!episodeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/episode-scripts?episodeId=${episodeId}`, {
        credentials: 'include', // 쿠키 포함
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 401 Unauthorized인 경우 로그인 페이지로 리다이렉트 (전체 페이지 리로드 방지)
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(data.error || '스크립트 목록을 불러오지 못했습니다.');
      }
      const data = (await res.json()) as Script[];
      // storyboards는 초기 로딩에서 제외 (선택된 대본에서만 lazy-load)
      setScripts(data ?? []);

      // DB에서 가져온 캐릭터 분석 결과를 상태에 설정 (characterSheets는 analyze-characters 호출 시 갱신)
      const analysisMap: Record<string, {
        characters: Array<{
          name: string;
          description: string;
          existsInDb: boolean;
          characterId: string | null;
          characterSheets: Array<{ id: string; file_path: string; thumbnail_path?: string | null }>;
        }>;
        webtoonId: string;
      }> = {};
      (data ?? []).forEach((s) => {
        if (s.character_analysis) {
          analysisMap[s.id] = {
            characters: s.character_analysis.characters || [],
            webtoonId: s.character_analysis.webtoonId,
          };
        }
      });
      setCharacterAnalysis(analysisMap);
    } catch (err) {
      console.error('스크립트 로드 실패:', err);
      setError(err instanceof Error ? err.message : '스크립트 로드에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [episodeId]);

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  // scripts가 변경될 때 첫 번째 대본을 기본 선택
  useEffect(() => {
    if (scripts.length > 0 && !selectedScriptId) {
      const sorted = [...scripts].sort((a, b) => a.order_index - b.order_index);
      setSelectedScriptId(sorted[0].id);
    } else if (scripts.length === 0) {
      setSelectedScriptId(null);
    }
  }, [scripts, selectedScriptId]);

  // 선택된 대본의 storyboards lazy-load
  const loadStoryboards = useCallback(async (scriptId: string) => {
    try {
      const res = await fetch(`/api/episode-scripts/${encodeURIComponent(scriptId)}/storyboards`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '글콘티 조회에 실패했습니다.');
      }
      const storyboards = (await res.json()) as Storyboard[];

      // 스크립트 목록에 storyboards 추가
      setScripts((prev) =>
        prev.map((s) => (s.id === scriptId ? { ...s, storyboards } : s))
      );
    } catch (err) {
      console.error('글콘티 로드 실패:', err);
      setError(err instanceof Error ? err.message : '글콘티 로드에 실패했습니다.');
    }
  }, []);

  // 선택된 대본이 변경될 때 storyboards 로드
  useEffect(() => {
    if (selectedScriptId) {
      const selectedScript = scripts.find((s) => s.id === selectedScriptId);
      // storyboards가 아직 로드되지 않았으면 로드
      if (selectedScript && !selectedScript.storyboards) {
        loadStoryboards(selectedScriptId);
      }
    }
  }, [selectedScriptId, scripts, loadStoryboards]);

  // 선택된 대본의 storyboards 이미지 lazy-load
  const loadStoryboardImages = useCallback(async (storyboardId: string) => {
    // 로딩 시작
    setLoadingStoryboardImages((prev) => new Set(prev).add(storyboardId));
    try {
      const res = await fetch(`/api/episode-scripts/storyboards/${encodeURIComponent(storyboardId)}/images`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '이미지 조회에 실패했습니다.');
      }
      const images = (await res.json()) as Array<{
        id: string;
        storyboardId: string;
        cutIndex: number;
        mimeType: string;
        imageType: string;
        imageUrl: string;
      }>;

      // 이미지 타입별로 분리하여 매핑
      const cutImageMap: Record<string, string> = {};
      const bgImageMap: Record<string, string> = {};
      images.forEach((img) => {
        const key = `${img.storyboardId}-${img.cutIndex}`;
        if (img.imageType === 'background') {
          bgImageMap[key] = img.imageUrl;
        } else {
          cutImageMap[key] = img.imageUrl;
        }
      });
      setCutImages((prev) => ({ ...prev, ...cutImageMap }));
      setCutBackgroundImages((prev) => ({ ...prev, ...bgImageMap }));
    } catch (err) {
      console.error('이미지 로드 실패:', err);
      // 이미지 로드 실패는 에러로 표시하지 않음 (선택적)
    } finally {
      // 로딩 완료
      setLoadingStoryboardImages((prev) => {
        const next = new Set(prev);
        next.delete(storyboardId);
        return next;
      });
    }
  }, []);

  // 선택된 대본의 storyboards가 로드되면 이미지도 로드
  useEffect(() => {
    if (selectedScriptId) {
      const selectedScript = scripts.find((s) => s.id === selectedScriptId);
      if (selectedScript?.storyboards) {
        selectedScript.storyboards.forEach((sb) => {
          // 이미지가 아직 로드되지 않았으면 로드
          if (!loadedStoryboardImages.has(sb.id)) {
            loadStoryboardImages(sb.id);
            setLoadedStoryboardImages((prev) => new Set(prev).add(sb.id));
          }
        });
      }
    }
  }, [selectedScriptId, scripts, loadedStoryboardImages, loadStoryboardImages]);

  const handleAddScript = async () => {
    if (!episodeId) return;
    if (!newContent.trim()) {
      setError('대본 내용을 입력해주세요.');
      return;
    }
    setSavingNew(true);
    setError(null);
    try {
      const res = await fetch('/api/episode-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId,
          title: newTitle,
          content: newContent,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '스크립트 생성에 실패했습니다.');
      }
      const created = (await res.json()) as Script;
      // POST 응답에는 storyboards가 없으므로 빈 배열로 설정
      const createdWithEmptyStoryboards = { ...created, storyboards: [] };
      const updatedScripts = [...scripts, createdWithEmptyStoryboards].sort((a, b) => a.order_index - b.order_index);
      setScripts(updatedScripts);
      setNewTitle('');
      setNewContent('');
      setShowAddScriptForm(false);
      // 새로 생성된 대본을 선택 (자동으로 storyboards 로드됨)
      setSelectedScriptId(created.id);
    } catch (err) {
      console.error('스크립트 생성 실패:', err);
      setError(err instanceof Error ? err.message : '스크립트 생성에 실패했습니다.');
    } finally {
      setSavingNew(false);
    }
  };

  const handleDeleteScript = async (id: string) => {
    if (!confirm('이 대본을 삭제할까요?')) return;
    try {
      const res = await fetch(`/api/episode-scripts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '삭제에 실패했습니다.');
      }
      setScripts((prev) => {
        const filtered = prev.filter((s) => s.id !== id);
        // 삭제된 대본이 선택되어 있었다면 첫 번째 대본 선택
        if (selectedScriptId === id && filtered.length > 0) {
          const sorted = [...filtered].sort((a, b) => a.order_index - b.order_index);
          setSelectedScriptId(sorted[0].id);
        } else if (filtered.length === 0) {
          setSelectedScriptId(null);
        }
        return filtered;
      });
    } catch (err) {
      console.error('스크립트 삭제 실패:', err);
      setError(err instanceof Error ? err.message : '스크립트 삭제에 실패했습니다.');
    }
  };

  const handleEditScriptOpen = (script: Script) => {
    setEditingScript(script);
    setEditScriptTitle(script.title || '');
    setEditScriptContent(script.content);
    setEditScriptDialogOpen(true);
  };

  const handleEditScriptSave = async () => {
    if (!editingScript) return;
    if (!editScriptContent.trim()) {
      setError('대본 내용을 입력해주세요.');
      return;
    }

    setSavingEditScript(true);
    setError(null);
    try {
      const res = await fetch(`/api/episode-scripts/${editingScript.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editScriptTitle.trim() || null,
          content: editScriptContent.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '대본 수정에 실패했습니다.');
      }
      const updated = await res.json();

      // 스크립트 목록 업데이트
      setScripts((prev) =>
        prev.map((s) =>
          s.id === editingScript.id
            ? { ...s, title: updated.title, content: updated.content }
            : s
        )
      );

      setEditScriptDialogOpen(false);
      setEditingScript(null);
    } catch (err) {
      console.error('대본 수정 실패:', err);
      setError(err instanceof Error ? err.message : '대본 수정에 실패했습니다.');
    } finally {
      setSavingEditScript(false);
    }
  };

  const reorder = async (ids: string[]) => {
    await fetch('/api/episode-scripts/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptIds: ids }),
    });
  };

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    let nextOrder: string[] | null = null;
    setScripts((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const newArr = [...prev];
      [newArr[idx], newArr[targetIdx]] = [newArr[targetIdx], newArr[idx]];
      const ordered = newArr.map((s, i) => ({ ...s, order_index: i }));
      nextOrder = ordered.map((s) => s.id);
      return ordered;
    });
    if (nextOrder) {
      await reorder(nextOrder);
      loadScripts();
    }
  };

  const handleGenerate = async (script: Script) => {
    if (!script.id) {
      setError('scriptId가 없습니다. 페이지를 새로고침 후 다시 시도하세요.');
      return;
    }

    // 기존 스토리보드가 있으면 확인
    const hasExistingStoryboards = script.storyboards && script.storyboards.length > 0;
    if (hasExistingStoryboards) {
      const confirmed = window.confirm(
        '기존 글콘티와 생성된 이미지가 모두 삭제되고 새로 생성됩니다. 계속하시겠습니까?'
      );
      if (!confirmed) {
        return;
      }
    }

    setGeneratingId(script.id);
    setError(null);
    try {
      const res = await fetch(`/api/episode-scripts/${encodeURIComponent(script.id)}/storyboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          deleteExisting: hasExistingStoryboards,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '글콘티 생성에 실패했습니다.');
      }
      const storyboard = (await res.json()) as Storyboard;
      setScripts((prev) =>
        prev.map((s) =>
          s.id === script.id
            ? {
                ...s,
                storyboards: [storyboard], // 기존 것을 삭제했으므로 새 것으로 교체
              }
            : s
        )
      );
      // 새로 생성된 storyboard의 이미지는 아직 없으므로 로드하지 않음 (사용자가 "콘티 그리기" 버튼을 눌러야 생성됨)
    } catch (err) {
      console.error('글콘티 생성 실패:', err);
      setError(err instanceof Error ? err.message : '글콘티 생성에 실패했습니다.');
    } finally {
      setGeneratingId(null);
    }
  };

  // 컷목록 파싱: 숫자로 시작하는 줄들을 컷으로 변환
  const parseCutList = (text: string): Cut[] => {
    const lines = text.split('\n');
    const cuts: Cut[] = [];
    let currentCut: { number: number; content: string[] } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 숫자로 시작하는지 확인 (예: "1. ", "1) ", "1: ", "1 ")
      const match = trimmed.match(/^(\d+)[\.\)\:\s]+(.*)$/);
      if (match) {
        // 이전 컷 저장
        if (currentCut) {
          cuts.push({
            cutNumber: currentCut.number,
            title: '',
            description: currentCut.content.join('\n').trim(),
          });
        }
        // 새 컷 시작
        currentCut = {
          number: parseInt(match[1], 10),
          content: match[2].trim() ? [match[2].trim()] : [],
        };
      } else if (currentCut) {
        // 현재 컷에 내용 추가 (다음 숫자가 나올 때까지)
        currentCut.content.push(trimmed);
      }
    }

    // 마지막 컷 저장
    if (currentCut) {
      cuts.push({
        cutNumber: currentCut.number,
        title: '',
        description: currentCut.content.join('\n').trim(),
      });
    }

    return cuts;
  };

  // 컷목록 바로넣기: 대본 내용에서 숫자 목록을 파싱하여 컷으로 변환
  const handleDirectCutList = async (script: Script) => {
    if (!script.id) {
      setError('scriptId가 없습니다. 페이지를 새로고침 후 다시 시도하세요.');
      return;
    }

    const cuts = parseCutList(script.content);
    if (cuts.length === 0) {
      setError('대본에서 유효한 컷을 찾을 수 없습니다. 숫자로 시작하는 형식(예: 1. 내용)으로 대본을 작성해주세요.');
      return;
    }

    // 컨펌 다이얼로그 표시
    setPendingCutListScript(script);
    setCutListConfirmOpen(true);
  };

  // 컷목록 바로넣기 확인 후 실행
  const handleDirectCutListConfirm = async () => {
    if (!pendingCutListScript || !pendingCutListScript.id) {
      return;
    }

    const script = pendingCutListScript;
    const cuts = parseCutList(script.content);

    setCutListConfirmOpen(false);
    setSavingCutList(true);
    setError(null);
    try {
      const res = await fetch(`/api/episode-scripts/${encodeURIComponent(script.id)}/storyboards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          cuts: cuts,
          deleteExisting: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '컷 목록 저장에 실패했습니다.');
      }

      const storyboard = (await res.json()) as Storyboard;
      setScripts((prev) =>
        prev.map((s) =>
          s.id === script.id
            ? {
                ...s,
                storyboards: [storyboard],
              }
            : s
        )
      );
    } catch (err) {
      console.error('컷 목록 저장 실패:', err);
      setError(err instanceof Error ? err.message : '컷 목록 저장에 실패했습니다.');
    } finally {
      setSavingCutList(false);
      setPendingCutListScript(null);
    }
  };

  const handleAnalyzeCharacters = async (script: Script) => {
    if (!script.id) {
      setError('scriptId가 없습니다. 페이지를 새로고침 후 다시 시도하세요.');
      return;
    }

    setAnalyzingId(script.id);
    setError(null);
    try {
      const res = await fetch(`/api/episode-scripts/${encodeURIComponent(script.id)}/analyze-characters`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '캐릭터 분석에 실패했습니다.');
      }
      const data = await res.json();
      setCharacterAnalysis((prev) => ({
        ...prev,
        [script.id]: {
          characters: data.characters || [],
          webtoonId: data.webtoonId,
        },
      }));
    } catch (err) {
      console.error('캐릭터 분석 실패:', err);
      setError(err instanceof Error ? err.message : '캐릭터 분석에 실패했습니다.');
    } finally {
      setAnalyzingId(null);
    }
  };

  // 수동입력 다이얼로그 열기
  const handleManualSelectOpen = () => {
    // 이미 선택된 캐릭터가 있으면 미리 체크
    if (selectedScriptId && characterAnalysis[selectedScriptId]) {
      const existingCharacterIds = new Set(
        characterAnalysis[selectedScriptId].characters
          .filter((c) => c.characterId)
          .map((c) => c.characterId as string)
      );
      setSelectedManualCharacters(existingCharacterIds);
    } else {
      setSelectedManualCharacters(new Set());
    }
    setManualSelectOpen(true);
  };

  // 수동입력 캐릭터 선택 토글
  const handleManualCharacterToggle = (characterId: string) => {
    setSelectedManualCharacters((prev) => {
      const next = new Set(prev);
      if (next.has(characterId)) {
        next.delete(characterId);
      } else {
        next.add(characterId);
      }
      return next;
    });
  };

  // 수동입력 확인
  const handleManualSelectConfirm = async () => {
    if (!selectedScriptId || !webtoonId) return;

    setSavingManualCharacters(true);
    setError(null);
    try {
      // 선택된 캐릭터들의 정보 구성
      const selectedCharacters = webtoonCharacters
        .filter((c) => selectedManualCharacters.has(c.id))
        .map((c) => ({
          name: c.name,
          description: c.description || '',
          existsInDb: true,
          characterId: c.id,
          characterSheets: (c.character_sheets || []).map((sheet) => ({
            id: sheet.id,
            file_path: sheet.file_path,
            thumbnail_path: sheet.thumbnail_path || null,
          })),
        }));

      // API로 저장 (analyze-characters API에 manual 플래그 추가)
      const res = await fetch(`/api/episode-scripts/${encodeURIComponent(selectedScriptId)}/analyze-characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manual: true,
          characters: selectedCharacters,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '캐릭터 저장에 실패했습니다.');
      }

      const data = await res.json();
      setCharacterAnalysis((prev) => ({
        ...prev,
        [selectedScriptId]: {
          characters: data.characters || [],
          webtoonId: data.webtoonId,
        },
      }));

      setManualSelectOpen(false);
    } catch (err) {
      console.error('수동입력 캐릭터 저장 실패:', err);
      setError(err instanceof Error ? err.message : '캐릭터 저장에 실패했습니다.');
    } finally {
      setSavingManualCharacters(false);
    }
  };

  const handleCreateCharacterFromAnalysis = (scriptId: string, characterName: string, characterDescription: string, webtoonId: string) => {
    setEditingCharacterForScript({
      scriptId,
      characterName,
      characterDescription,
      webtoonId,
    });
    setCharacterEditOpen(true);
  };

  const handleCharacterSaved = async () => {
    setCharacterEditOpen(false);
    if (editingCharacterForScript) {
      // 분석 결과 다시 로드
      const script = scripts.find((s) => s.id === editingCharacterForScript.scriptId);
      if (script) {
        await handleAnalyzeCharacters(script);
      }
    }
    setEditingCharacterForScript(null);
  };

  // 캐릭터 이미지 생성
  const handleGenerateCharacterImage = async (scriptId: string, characterIndex: number, characterName: string, characterDescription: string) => {
    const key = `${scriptId}:${characterIndex}`;
    setGeneratingCharacterImage(key);
    setError(null);
    try {
      const res = await fetch('/api/generate-character-image-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: characterName,
          description: characterDescription,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '캐릭터 이미지 생성에 실패했습니다.');
      }

      const data = await res.json();
      const analysis = characterAnalysis[scriptId];
      const character = analysis?.characters[characterIndex];

      if (!character || !analysis) {
        throw new Error('캐릭터 정보를 찾을 수 없습니다.');
      }

      setPreviewImageData({
        imageUrl: data.imageUrl,
        imageData: data.imageData,
        mimeType: data.mimeType,
        scriptId,
        characterIndex,
        characterName: character.name,
        characterDescription: character.description,
        webtoonId: analysis.webtoonId,
        characterId: character.characterId,
      });
    } catch (err) {
      console.error('캐릭터 이미지 생성 실패:', err);
      setError(err instanceof Error ? err.message : '캐릭터 이미지 생성에 실패했습니다.');
    } finally {
      setGeneratingCharacterImage(null);
    }
  };

  // 생성된 이미지 채택 (캐릭터시트로 저장)
  const handleAcceptCharacterImage = async () => {
    console.log('[handleAcceptCharacterImage] 함수 호출됨');

    if (!previewImageData) {
      console.error('[handleAcceptCharacterImage] previewImageData가 없습니다');
      return;
    }

    if (acceptingImage) {
      console.warn('[handleAcceptCharacterImage] 이미 진행 중입니다');
      return;
    }

    console.log('[handleAcceptCharacterImage] 시작', { previewImageData });
    const scriptId = previewImageData.scriptId; // 미리 저장

    try {
      setAcceptingImage(true);
      setError(null);
      let characterId = previewImageData.characterId;
      console.log('[handleAcceptCharacterImage] characterId:', characterId);

      // 캐릭터가 DB에 없으면 먼저 생성
      if (!characterId) {
        console.log('[handleAcceptCharacterImage] 캐릭터 생성 중...');
        const createdCharacter = await createCharacter({
          webtoon_id: previewImageData.webtoonId,
          name: previewImageData.characterName,
          description: previewImageData.characterDescription,
        });
        characterId = createdCharacter.id;
        console.log('[handleAcceptCharacterImage] 캐릭터 생성 완료:', characterId);
      }

      // 캐릭터시트로 저장 (서버 API 사용)
      console.log('[handleAcceptCharacterImage] 캐릭터시트 저장 중...', {
        characterId,
        imageDataLength: previewImageData.imageData?.length,
        mimeType: previewImageData.mimeType,
      });

      const saveRes = await fetch(`/api/characters/${characterId}/save-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: previewImageData.imageData,
          mimeType: previewImageData.mimeType,
          fileName: `${previewImageData.characterName}-generated`,
          description: 'AI로 생성된 캐릭터 이미지',
        }),
      });

      if (!saveRes.ok) {
        const errorData = await saveRes.json().catch(() => ({}));
        throw new Error(errorData.error || '캐릭터시트 저장에 실패했습니다.');
      }

      const saveData = await saveRes.json();
      console.log('[handleAcceptCharacterImage] 캐릭터시트 저장 완료', saveData);

      // 로컬 상태 업데이트 (불필요한 API 호출 방지)
      const savedSheet = saveData.sheet;
      setCharacterAnalysis((prev) => {
        const analysis = prev[scriptId];
        if (!analysis) return prev;

        const updatedCharacters = analysis.characters.map((char) => {
          // 해당 캐릭터의 characterSheets에 새로 저장된 시트 추가
          if (char.characterId === characterId || (!char.existsInDb && char.name === previewImageData.characterName)) {
            return {
              ...char,
              existsInDb: true,
              characterId: characterId,
              characterSheets: [
                ...(char.characterSheets || []),
                {
                  id: savedSheet.id,
                  file_path: savedSheet.file_path,
                  thumbnail_path: savedSheet.thumbnail_path || null,
                },
              ],
            };
          }
          return char;
        });

        return {
          ...prev,
          [scriptId]: {
            ...analysis,
            characters: updatedCharacters,
          },
        };
      });

      // 스크립트 목록도 업데이트 (character_analysis 반영)
      setScripts((prev) =>
        prev.map((s) => {
          if (s.id === scriptId && s.character_analysis) {
            const updatedAnalysis = {
              ...s.character_analysis,
              characters: s.character_analysis.characters.map((char: any) => {
                if (char.characterId === characterId || (!char.existsInDb && char.name === previewImageData.characterName)) {
                  return {
                    ...char,
                    existsInDb: true,
                    characterId: characterId,
                    characterSheets: [
                      ...(char.characterSheets || []),
                      {
                        id: savedSheet.id,
                        file_path: savedSheet.file_path,
                        thumbnail_path: savedSheet.thumbnail_path || null,
                      },
                    ],
                  };
                }
                return char;
              }),
            };
            return {
              ...s,
              character_analysis: updatedAnalysis,
            };
          }
          return s;
        })
      );

      // 미리보기 닫기
      setPreviewImageData(null);

      alert('캐릭터시트가 저장되었습니다.');
    } catch (err) {
      console.error('[handleAcceptCharacterImage] 캐릭터시트 저장 실패:', err);
      if (err instanceof Error) {
        console.error('[handleAcceptCharacterImage] 에러 상세:', err.message, err.stack);
      }
      setError(err instanceof Error ? err.message : '캐릭터시트 저장에 실패했습니다.');
      alert(`캐릭터시트 저장에 실패했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setAcceptingImage(false);
    }
  };

  // 배경설명 생성
  const handleGenerateBgDescription = async (storyboardId: string, cutIndex: number, script: Script) => {
    if (!script.content) {
      setError('대본 내용이 없습니다.');
      return;
    }

    const key = `${storyboardId}-${cutIndex}`;
    setGeneratingBgDescKey(key);
    setError(null);
    try {
      const res = await fetch('/api/generate-cut-background-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyboardId,
          cutIndex,
          scriptContent: script.content,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '배경설명 생성에 실패했습니다.');
      }

      const data = await res.json();

      // 스크립트 목록 업데이트
      setScripts((prev) =>
        prev.map((s) =>
          s.id === script.id
            ? {
                ...s,
                storyboards: s.storyboards?.map((sb) =>
                  sb.id === storyboardId
                    ? {
                        ...sb,
                        response_json: {
                          ...sb.response_json,
                          cuts: (sb.response_json?.cuts || []).map((c: Cut, idx: number) =>
                            idx === cutIndex
                              ? { ...c, background: data.background, relatedBackgrounds: data.relatedBackgrounds }
                              : c
                          ),
                        },
                      }
                    : sb
                ) ?? [],
              }
            : s
        )
      );
    } catch (err) {
      console.error('배경설명 생성 실패:', err);
      setError(err instanceof Error ? err.message : '배경설명 생성에 실패했습니다.');
    } finally {
      setGeneratingBgDescKey(null);
    }
  };

  // 배경설명 직접 수정
  const handleUpdateBgDescription = async (storyboardId: string, cutIndex: number, newBackground: string) => {
    if (!selectedScriptId) {
      setError('대본을 선택해주세요.');
      return;
    }

    setError(null);
    try {
      const res = await fetch(`/api/episode-scripts/${encodeURIComponent(selectedScriptId)}/storyboards/cuts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyboardId,
          cutIndex,
          cut: {
            cutNumber: cutIndex + 1,
            background: newBackground.trim(),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '배경설명 수정에 실패했습니다.');
      }

      const data = await res.json();
      const updatedStoryboard = data.storyboard;

      // 스크립트 목록 업데이트
      setScripts((prev) =>
        prev.map((s) =>
          s.id === selectedScriptId
            ? {
                ...s,
                storyboards: s.storyboards?.map((sb) =>
                  sb.id === storyboardId ? updatedStoryboard : sb
                ) ?? [updatedStoryboard],
              }
            : s
        )
      );
    } catch (err) {
      console.error('배경설명 수정 실패:', err);
      setError(err instanceof Error ? err.message : '배경설명 수정에 실패했습니다.');
    }
  };

  // 배경이미지 생성
  const handleGenerateBgImage = async (storyboardId: string, cutIndex: number, cut: Cut) => {
    if (!cut.background) {
      setError('배경설명이 없습니다. 먼저 배경설명을 생성하세요.');
      return;
    }

    const key = `${storyboardId}-${cutIndex}`;
    setGeneratingBgImageKey(key);
    setError(null);
    try {
      const res = await fetch('/api/generate-cut-background-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyboardId,
          cutIndex,
          background: cut.background,
          relatedBackgrounds: Array.isArray(cut.relatedBackgrounds) ? cut.relatedBackgrounds : [],
          apiProvider: imageModel,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '배경 이미지 생성에 실패했습니다.');
      }

      const data = await res.json();
      setCutBackgroundImages((prev) => ({ ...prev, [key]: data.imageUrl }));
    } catch (err) {
      console.error('배경 이미지 생성 실패:', err);
      setError(err instanceof Error ? err.message : '배경 이미지 생성에 실패했습니다.');
    } finally {
      setGeneratingBgImageKey(null);
    }
  };

  const handleDrawCut = async (sbId: string, cutIdx: number, cut: Cut) => {
    const key = `${sbId}-${cutIdx}`;
    setCutDrawingIds((prev) => new Set(prev).add(key));
    setError(null);
    try {
      // 선택된 캐릭터시트 정보 수집
      const selectedSheets: Record<string, number> = {};
      if (selectedScriptId && cut.charactersInCut && Array.isArray(cut.charactersInCut)) {
        const analysis = characterAnalysis[selectedScriptId];
        if (analysis) {
          cut.charactersInCut.forEach((charName) => {
            const charIndex = analysis.characters.findIndex((c) => c.name === charName);
            if (charIndex !== -1) {
              // 캐릭터 이름을 키로 사용하여 인덱스 변경에 영향받지 않도록 함
              const sheetKey = `${selectedScriptId}:${charName}`;
              const selectedSheetIndex = selectedCharacterSheet[sheetKey] ?? 0;
              selectedSheets[charName] = selectedSheetIndex;
              console.log('[handleDrawCut] 캐릭터시트 선택 정보:', {
                characterName: charName,
                charIndex,
                sheetKey,
                selectedSheetIndex,
                allSelectedSheets: selectedCharacterSheet,
              });
            }
          });
        }
      }

      console.log('[handleDrawCut] 전송할 selectedCharacterSheets:', selectedSheets);

      const res = await fetch('/api/storyboard-cut-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: cut.title,
          background: cut.background,
          description: cut.description,
          dialogue: cut.dialogue,
          storyboardId: sbId,
          cutIndex: cutIdx,
          selectedCharacterSheets: selectedSheets,
          apiProvider: imageModel,
          backgroundImageUrl: cutBackgroundImages[key], // 배경이미지가 있으면 포함
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '콘티 이미지를 생성하지 못했습니다.');
      }
      const data = await res.json();
      if (data.imageUrl) {
        setCutImages((prev) => ({ ...prev, [key]: data.imageUrl }));
        // 이미지가 생성되었으므로 해당 storyboard의 이미지 목록을 다시 로드 (최신 상태 유지)
        await loadStoryboardImages(sbId);
      } else {
        throw new Error('이미지 URL이 응답에 없습니다.');
      }
    } catch (err) {
      console.error('콘티 이미지 생성 실패:', err);
      setError(err instanceof Error ? err.message : '콘티 이미지 생성에 실패했습니다.');
    } finally {
      setCutDrawingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleEditCut = (storyboardId: string, cutIndex: number, cut: Cut) => {
    setEditingCut({ storyboardId, cutIndex, cut });
    setModificationPrompt('');
    setCutEditDialogOpen(true);
  };

  const handleModifyCut = async () => {
    if (!editingCut || !selectedScriptId || !modificationPrompt.trim()) {
      setError('수정 지시를 입력해주세요.');
      return;
    }

    setModifyingCut(true);
    setError(null);
    try {
      const res = await fetch(`/api/episode-scripts/${encodeURIComponent(selectedScriptId)}/storyboards/cuts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyboardId: editingCut.storyboardId,
          cutIndex: editingCut.cutIndex,
          modificationPrompt: modificationPrompt.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '컷 수정에 실패했습니다.');
      }

      const data = await res.json();
      const updatedStoryboard = data.storyboard;

      // 스크립트 목록 업데이트
      setScripts((prev) =>
        prev.map((s) =>
          s.id === selectedScriptId
            ? {
                ...s,
                storyboards: s.storyboards?.map((sb) =>
                  sb.id === editingCut.storyboardId ? updatedStoryboard : sb
                ) ?? [updatedStoryboard],
              }
            : s
        )
      );

      // 다이얼로그 닫기
      setCutEditDialogOpen(false);
      setEditingCut(null);
      setModificationPrompt('');
    } catch (err) {
      console.error('컷 수정 실패:', err);
      setError(err instanceof Error ? err.message : '컷 수정에 실패했습니다.');
    } finally {
      setModifyingCut(false);
    }
  };

  // 직접 수정 모드로 전환
  const handleDirectEditOpen = () => {
    if (!editingCut) return;
    setDirectEditValues({
      title: editingCut.cut.title || '',
      background: editingCut.cut.background || '',
      description: editingCut.cut.description || '',
      dialogue: editingCut.cut.dialogue || '',
      charactersInCut: Array.isArray(editingCut.cut.charactersInCut)
        ? editingCut.cut.charactersInCut.join(', ')
        : '',
    });
    setDirectEditMode(true);
  };

  // 직접 수정 저장
  const handleDirectEditSave = async () => {
    if (!editingCut || !selectedScriptId) return;

    setSavingDirectEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/episode-scripts/${encodeURIComponent(selectedScriptId)}/storyboards/cuts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyboardId: editingCut.storyboardId,
          cutIndex: editingCut.cutIndex,
          cut: {
            cutNumber: editingCut.cut.cutNumber,
            title: directEditValues.title.trim(),
            background: directEditValues.background.trim(),
            description: directEditValues.description.trim(),
            dialogue: directEditValues.dialogue.trim(),
            charactersInCut: directEditValues.charactersInCut
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '컷 직접 수정에 실패했습니다.');
      }

      const data = await res.json();
      const updatedStoryboard = data.storyboard;

      // 스크립트 목록 업데이트
      setScripts((prev) =>
        prev.map((s) =>
          s.id === selectedScriptId
            ? {
                ...s,
                storyboards: s.storyboards?.map((sb) =>
                  sb.id === editingCut.storyboardId ? updatedStoryboard : sb
                ) ?? [updatedStoryboard],
              }
            : s
        )
      );

      // 다이얼로그 닫기
      setCutEditDialogOpen(false);
      setEditingCut(null);
      setDirectEditMode(false);
    } catch (err) {
      console.error('컷 직접 수정 실패:', err);
      setError(err instanceof Error ? err.message : '컷 직접 수정에 실패했습니다.');
    } finally {
      setSavingDirectEdit(false);
    }
  };

  const handleSplitCut = async (storyboardId: string, cutIndex: number) => {
    if (!selectedScriptId) {
      setError('대본을 선택해주세요.');
      return;
    }

    const key = `${storyboardId}:${cutIndex}`;
    setSplittingCut(key);
    setError(null);
    try {
      const res = await fetch(`/api/episode-scripts/${encodeURIComponent(selectedScriptId)}/storyboards/cuts/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyboardId,
          cutIndex,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '컷 분할에 실패했습니다.');
      }

      const data = await res.json();
      const updatedStoryboard = data.storyboard;

      // 스크립트 목록 업데이트
      setScripts((prev) =>
        prev.map((s) =>
          s.id === selectedScriptId
            ? {
                ...s,
                storyboards: s.storyboards?.map((sb) =>
                  sb.id === storyboardId ? updatedStoryboard : sb
                ) ?? [updatedStoryboard],
              }
            : s
        )
      );

      // 선택된 대본의 storyboards만 다시 로드 (이미지는 자동으로 lazy-load됨)
      if (selectedScriptId) {
        await loadStoryboards(selectedScriptId);
      }
    } catch (err) {
      console.error('컷 분할 실패:', err);
      setError(err instanceof Error ? err.message : '컷 분할에 실패했습니다.');
    } finally {
      setSplittingCut(null);
    }
  };

  // 선택된 대본 찾기
  const selectedScript = scripts.find((s) => s.id === selectedScriptId);
  const sortedScripts = useMemo(() => {
    return [...scripts].sort((a, b) => a.order_index - b.order_index);
  }, [scripts]);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">대본to콘티</h1>
        </div>

        {/* 회차 선택 (webtoonId가 있을 때만 표시) */}
        {webtoonId && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">회차:</span>
            <Select
              value={selectedEpisodeId}
              onValueChange={setSelectedEpisodeId}
              disabled={loadingEpisodes}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={loadingEpisodes ? "로딩 중..." : "회차 선택"} />
              </SelectTrigger>
              <SelectContent>
                {episodes.map((ep) => (
                  <SelectItem key={ep.id} value={ep.id}>
                    {ep.episode_number === 0 ? '기타' : `${ep.episode_number}화`} - {ep.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!canLoad && (
        <div className="flex-1 flex items-center justify-center">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">episodeId가 필요합니다.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {canLoad && (
        <div className="flex-1 flex overflow-hidden">
          {/* 왼쪽 패널: 500px 고정 */}
          <div className="w-[500px] border-r flex flex-col overflow-hidden">
            {/* 대본 추가 버튼 */}
            <div className="p-4 border-b">
              <Button
                onClick={() => setShowAddScriptForm(!showAddScriptForm)}
                className="w-full"
                disabled={!canLoad}
              >
                <Plus className="mr-2 h-4 w-4" />
                대본 추가
              </Button>

              {/* 대본 추가 폼 */}
              {showAddScriptForm && (
                <Card className="mt-3">
                  <CardContent className="pt-4 space-y-3">
                    <input
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="대본 제목 (선택)"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      disabled={savingNew}
                    />
                    <Textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      placeholder="대본을 입력하세요..."
                      className="min-h-[120px]"
                      disabled={savingNew}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleAddScript}
                        disabled={savingNew || !newContent.trim()}
                        className="flex-1"
                      >
                        {savingNew ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            저장 중...
                          </>
                        ) : (
                          <>
                            <Plus className="mr-2 h-4 w-4" />
                            저장
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowAddScriptForm(false);
                          setNewTitle('');
                          setNewContent('');
                        }}
                        disabled={savingNew}
                      >
                        취소
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* 대본 목록 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">대본 목록</h2>
                <Button variant="ghost" size="sm" onClick={loadScripts} disabled={loading}>
                  <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  불러오는 중...
                </div>
              )}

              {sortedScripts.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground">저장된 대본이 없습니다.</p>
              )}

              <div className="space-y-2">
                {sortedScripts.map((script, idx) => (
                  <Card
                    key={script.id}
                    className={`cursor-pointer transition-colors ${
                      selectedScriptId === script.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedScriptId(script.id)}
                  >
                    <CardHeader className="pb-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                          <span className="truncate">{script.title || '제목 없음'}</span>
                        </CardTitle>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMove(script.id, 'up');
                            }}
                            disabled={idx === 0}
                            title="위로"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMove(script.id, 'down');
                            }}
                            disabled={idx === sortedScripts.length - 1}
                            title="아래로"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditScriptOpen(script);
                            }}
                            title="수정"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteScript(script.id);
                            }}
                            title="삭제"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <CardDescription className="text-xs w-full">
                        <div className="space-y-2">
                          <div className="whitespace-pre-wrap break-words">
                            {expandedScripts.has(script.id) || script.content.length <= 240
                              ? script.content
                              : script.content.slice(0, 240)}
                          </div>
                          {script.content.length > 240 && (
                            <div>
                              {expandedScripts.has(script.id) ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedScripts((prev) => {
                                      const next = new Set(prev);
                                      next.delete(script.id);
                                      return next;
                                    });
                                  }}
                                >
                                  접기
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedScripts((prev) => {
                                      const next = new Set(prev);
                                      next.add(script.id);
                                      return next;
                                    });
                                  }}
                                >
                                  전체 보기
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* 우측 패널: 선택된 대본의 등장인물과 글콘티 */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <Card className="border-destructive mb-4">
                <CardContent className="pt-6">
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {!selectedScript && sortedScripts.length === 0 && !loading && (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">대본을 추가해주세요.</p>
              </div>
            )}

            {!selectedScript && sortedScripts.length > 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">대본을 선택해주세요.</p>
              </div>
            )}

            {selectedScript && (
              <div className="space-y-6 max-w-full">
                {/* 등장인물 */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        등장인물
                        {characterAnalysis[selectedScript.id] &&
                          characterAnalysis[selectedScript.id].characters.length > 0 && (
                            <span className="text-sm font-normal text-muted-foreground">
                              ({characterAnalysis[selectedScript.id].characters.length}명)
                            </span>
                          )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleManualSelectOpen}
                          disabled={loadingWebtoonCharacters || webtoonCharacters.length === 0}
                        >
                          <Users className="mr-2 h-4 w-4" />
                          수동입력
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleAnalyzeCharacters(selectedScript)}
                          disabled={analyzingId === selectedScript.id}
                        >
                          {analyzingId === selectedScript.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              분석 중...
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-2 h-4 w-4" />
                              캐릭터 분석
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {characterAnalysis[selectedScript.id] &&
                    characterAnalysis[selectedScript.id].characters.length > 0 ? (
                      <div className="space-y-3">
                        {characterAnalysis[selectedScript.id].characters.map((char, charIdx) => (
                            <Card key={charIdx} className="p-3">
                              <div className="space-y-3">
                                <div>
                                  <h5 className="font-semibold text-sm">{char.name}</h5>
                                  {char.description && (
                                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                                      {char.description}
                                    </p>
                                  )}
                                </div>

                                {char.existsInDb && char.characterSheets.length > 0 ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xs text-muted-foreground">
                                        캐릭터시트 {char.characterSheets.length}개
                                      </p>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto py-2 px-1">
                                      {char.characterSheets.map((sheet, sheetIdx) => {
                                        // 캐릭터 이름을 키로 사용하여 인덱스 변경에 영향받지 않도록 함
                                        const key = `${selectedScript.id}:${char.name}`;
                                        const isSelected = (selectedCharacterSheet[key] ?? 0) === sheetIdx;
                                        return (
                                          <div
                                            key={sheetIdx}
                                            className={`flex-shrink-0 cursor-pointer transition-all ${
                                              isSelected ? 'ring-2 ring-primary' : 'ring-1 ring-muted'
                                            } rounded-md overflow-hidden`}
                                            onClick={() => {
                                              setSelectedCharacterSheet((prev) => ({
                                                ...prev,
                                                [key]: sheetIdx,
                                              }));
                                            }}
                                          >
                                            <img
                                              src={sheet.file_path}
                                              alt={`${char.name} 캐릭터시트 ${sheetIdx + 1}`}
                                              className="w-20 h-20 object-cover"
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-16 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                      <User className="h-8 w-8 text-muted-foreground/40" />
                                    </div>
                                    <p className="text-xs text-muted-foreground">캐릭터시트가 없습니다</p>
                                  </div>
                                )}

                                <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7"
                                      onClick={() =>
                                        handleGenerateCharacterImage(
                                          selectedScript.id,
                                          charIdx,
                                          char.name,
                                          char.description
                                        )
                                      }
                                      disabled={generatingCharacterImage === `${selectedScript.id}:${charIdx}`}
                                    >
                                      {generatingCharacterImage === `${selectedScript.id}:${charIdx}` ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          생성 중...
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="h-3 w-3 mr-1" />
                                          캐릭터시트 생성
                                        </>
                                      )}
                                    </Button>
                                    {!char.existsInDb && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7"
                                        onClick={() =>
                                          handleCreateCharacterFromAnalysis(
                                            selectedScript.id,
                                            char.name,
                                            char.description,
                                            characterAnalysis[selectedScript.id].webtoonId
                                          )
                                        }
                                      >
                                        <Plus className="h-3 w-3 mr-1" />
                                        캐릭터 생성
                                      </Button>
                                    )}
                                </div>
                              </div>
                            </Card>
                          ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">대본에 등장하는 캐릭터들을 자동 분석합니다</p>
                    )}
                  </CardContent>
                </Card>

                {/* 생성된 글콘티 */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>생성된 글콘티</CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDirectCutList(selectedScript)}
                          disabled={generatingId === selectedScript.id || savingCutList}
                        >
                          {savingCutList ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              추출 중...
                            </>
                          ) : (
                            <>
                              <ListPlus className="mr-2 h-4 w-4" />
                              컷목록 바로넣기
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleGenerate(selectedScript)}
                          disabled={generatingId === selectedScript.id || savingCutList}
                        >
                          {generatingId === selectedScript.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              생성 중...
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-4 w-4" />
                              글콘티 생성
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {(selectedScript.storyboards ?? []).length > 0 ? (
                        selectedScript.storyboards?.map((sb) => {
                          const cuts = sb.response_json?.cuts ?? [];
                          return cuts.map((cut, i) => (
                            <Card key={`${sb.id}-${i}`}>
                              <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <CardTitle className="text-base">
                                      컷 {cut.cutNumber ?? i + 1}
                                      {cut.title && <span className="ml-2">{cut.title}</span>}
                                    </CardTitle>
                                  </div>
                                  {i === 0 && (
                                    <CardDescription className="text-xs text-muted-foreground">
                                      {cuts.length}개 컷 · {new Date(sb.created_at).toLocaleString()}
                                    </CardDescription>
                                  )}
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    {/* 왼쪽 패널: 컷 내용 + 콘티 그리기 버튼 */}
                                    <div className="flex flex-col space-y-3 lg:col-span-2">
                                      {/* 제목 */}
                                      <div>
                                        <h5 className="text-xs font-semibold text-muted-foreground mb-1">제목</h5>
                                        <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded">
                                          {cut.title || <span className="text-muted-foreground italic">없음</span>}
                                        </p>
                                      </div>
                                      {/* 배경 */}
                                      <div className="space-y-2">
                                        <h5 className="text-xs font-semibold text-muted-foreground">배경</h5>

                                        {/* 배경설명 */}
                                        <div>
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-muted-foreground">배경설명</span>
                                            <div className="flex gap-1">
                                              {editingBgDescKey !== `${sb.id}-${i}` ? (
                                                <>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={() => {
                                                      setEditingBgDescKey(`${sb.id}-${i}`);
                                                      setEditingBgDescValue(cut.background || '');
                                                    }}
                                                  >
                                                    <Edit className="h-3 w-3 mr-1" />
                                                    수정
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={() => handleGenerateBgDescription(sb.id, i, selectedScript)}
                                                    disabled={generatingBgDescKey === `${sb.id}-${i}`}
                                                  >
                                                    {generatingBgDescKey === `${sb.id}-${i}` ? (
                                                      <>
                                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                        생성 중...
                                                      </>
                                                    ) : (
                                                      <>
                                                        <Sparkles className="h-3 w-3 mr-1" />
                                                        AI 생성
                                                      </>
                                                    )}
                                                  </Button>
                                                </>
                                              ) : (
                                                <div className="flex gap-1">
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={async () => {
                                                      await handleUpdateBgDescription(sb.id, i, editingBgDescValue);
                                                      setEditingBgDescKey(null);
                                                      setEditingBgDescValue('');
                                                    }}
                                                  >
                                                    <Check className="h-3 w-3 mr-1" />
                                                    저장
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={() => {
                                                      setEditingBgDescKey(null);
                                                      setEditingBgDescValue('');
                                                    }}
                                                  >
                                                    취소
                                                  </Button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          {editingBgDescKey === `${sb.id}-${i}` ? (
                                            <Textarea
                                              value={editingBgDescValue}
                                              onChange={(e) => setEditingBgDescValue(e.target.value)}
                                              className="min-h-[80px] text-sm"
                                              placeholder="배경 설명을 입력하세요..."
                                            />
                                          ) : (
                                            <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded">
                                              {cut.background || <span className="text-muted-foreground italic">없음</span>}
                                            </p>
                                          )}
                                        </div>

                                        {/* 배경이미지 */}
                                        <div>
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-muted-foreground">배경이미지</span>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 text-xs"
                                              onClick={() => handleGenerateBgImage(sb.id, i, cut)}
                                              disabled={generatingBgImageKey === `${sb.id}-${i}` || !cut.background}
                                            >
                                              {generatingBgImageKey === `${sb.id}-${i}` ? (
                                                <>
                                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                  생성 중...
                                                </>
                                              ) : (
                                                <>
                                                  <PenLine className="h-3 w-3 mr-1" />
                                                  배경 그리기
                                                </>
                                              )}
                                            </Button>
                                          </div>
                                          {cutBackgroundImages[`${sb.id}-${i}`] ? (
                                            <div className="relative">
                                              <img
                                                src={cutBackgroundImages[`${sb.id}-${i}`]}
                                                alt="배경 이미지"
                                                className="w-full max-h-[200px] object-contain rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                                onClick={() => {
                                                  setViewingImageUrl(cutBackgroundImages[`${sb.id}-${i}`]);
                                                  setViewingImageName(`컷 ${cut.cutNumber ?? i + 1} 배경`);
                                                  setImageViewerOpen(true);
                                                }}
                                              />
                                            </div>
                                          ) : (
                                            <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded">
                                              배경 이미지가 없습니다
                                            </p>
                                          )}
                                        </div>

                                        {/* 관련배경 */}
                                        {Array.isArray(cut.relatedBackgrounds) && cut.relatedBackgrounds.length > 0 && (
                                          <div>
                                            <span className="text-xs text-muted-foreground">관련배경:</span>
                                            <div className="text-xs text-muted-foreground mt-1 space-y-1">
                                              {cut.relatedBackgrounds.map((rb: { cutNumber: number; background: string }, idx: number) => (
                                                <div key={idx} className="pl-2">
                                                  컷 {rb.cutNumber}: {rb.background.slice(0, 50)}
                                                  {rb.background.length > 50 ? '...' : ''}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      {/* 연출/구도 */}
                                      <div>
                                        <h5 className="text-xs font-semibold text-muted-foreground mb-1">
                                          연출/구도
                                        </h5>
                                        <p className="text-sm whitespace-pre-wrap">
                                          {cut.description || <span className="text-muted-foreground italic">없음</span>}
                                        </p>
                                      </div>
                                      {/* 대사/내레이션 */}
                                      <div>
                                        <h5 className="text-xs font-semibold text-muted-foreground mb-1">
                                          대사/내레이션
                                        </h5>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                          {cut.dialogue || <span className="text-muted-foreground italic">없음</span>}
                                        </p>
                                      </div>
                                      {/* 등장인물 */}
                                      <div>
                                        <h5 className="text-xs font-semibold text-muted-foreground mb-1">
                                          등장인물
                                        </h5>
                                        <p className="text-sm text-muted-foreground">
                                          {Array.isArray(cut.charactersInCut) && cut.charactersInCut.length > 0
                                            ? cut.charactersInCut.join(', ')
                                            : <span className="text-muted-foreground italic">없음</span>}
                                        </p>
                                      </div>
                                      <div className="mt-auto pt-2 flex gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleEditCut(sb.id, i, cut)}
                                          className="flex-1"
                                        >
                                          <Edit className="mr-2 h-4 w-4" />
                                          수정
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleSplitCut(sb.id, i)}
                                          disabled={splittingCut === `${sb.id}:${i}`}
                                          className="flex-1"
                                        >
                                          {splittingCut === `${sb.id}:${i}` ? (
                                            <>
                                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                              분할 중...
                                            </>
                                          ) : (
                                            <>
                                              <Scissors className="mr-2 h-4 w-4" />
                                              분할
                                            </>
                                          )}
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleDrawCut(sb.id, i, cut)}
                                          disabled={cutDrawingIds.has(`${sb.id}-${i}`)}
                                          className="flex-1"
                                        >
                                          {cutDrawingIds.has(`${sb.id}-${i}`) ? (
                                            <>
                                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                              생성 중...
                                            </>
                                          ) : (
                                            <>
                                              <PenLine className="mr-2 h-4 w-4" />
                                              콘티 그리기
                                            </>
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                    {/* 오른쪽 패널: 이미지 */}
                                    <div className="flex items-center justify-center min-h-[200px] bg-muted/20 rounded border lg:col-span-1">
                                      {cutImages[`${sb.id}-${i}`] ? (
                                        <img
                                          src={cutImages[`${sb.id}-${i}`]}
                                          alt={cut.title || `cut-${i + 1}`}
                                          className="max-w-full max-h-[400px] rounded cursor-pointer hover:opacity-80 transition-opacity"
                                          onClick={() => {
                                            setViewingImageUrl(cutImages[`${sb.id}-${i}`]);
                                            setViewingImageName(cut.title || `컷 ${cut.cutNumber ?? i + 1}`);
                                            setImageViewerOpen(true);
                                          }}
                                        />
                                      ) : loadingStoryboardImages.has(sb.id) || cutDrawingIds.has(`${sb.id}-${i}`) ? (
                                        <div className="flex flex-col items-center gap-2">
                                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                          <p className="text-sm text-muted-foreground">
                                            {cutDrawingIds.has(`${sb.id}-${i}`) ? '이미지 생성 중...' : '이미지 불러오는 중...'}
                                          </p>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-muted-foreground">
                                          콘티 이미지가 생성되면 여기에 표시됩니다.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                              </CardContent>
                            </Card>
                          ));
                        }).flat()
                      ) : (
                        <p className="text-sm text-muted-foreground">대본을 글콘티로 변환하고, 이미지도 생성합니다</p>
                      )}
                    </CardContent>
                  </Card>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 이미지 뷰어 */}
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

      {/* 캐릭터 생성 다이얼로그 */}
      {editingCharacterForScript && (
        <CharacterEditDialog
          open={characterEditOpen}
          onOpenChange={setCharacterEditOpen}
          webtoonId={editingCharacterForScript.webtoonId}
          character={null}
          onSaved={handleCharacterSaved}
          initialName={editingCharacterForScript.characterName}
          initialDescription={editingCharacterForScript.characterDescription}
        />
      )}

      {/* 생성된 캐릭터 이미지 미리보기 다이얼로그 */}
      <Dialog open={!!previewImageData} onOpenChange={(open) => !open && setPreviewImageData(null)}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>생성된 캐릭터 이미지</DialogTitle>
            <DialogDescription>
              {previewImageData?.characterName}의 이미지가 생성되었습니다. 채택하면 캐릭터시트에 저장됩니다.
            </DialogDescription>
          </DialogHeader>
          {previewImageData && (
            <div className="space-y-4">
              <div className="relative w-full aspect-square bg-muted rounded-lg overflow-hidden">
                <img
                  src={previewImageData.imageUrl}
                  alt={previewImageData.characterName}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPreviewImageData(null)}
                  disabled={acceptingImage}
                >
                  취소
                </Button>
                <Button
                  onClick={handleAcceptCharacterImage}
                  disabled={acceptingImage}
                >
                  {acceptingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      채택
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 수동입력 캐릭터 선택 다이얼로그 */}
      <Dialog open={manualSelectOpen} onOpenChange={setManualSelectOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              캐릭터 수동 선택
            </DialogTitle>
            <DialogDescription>
              이 웹툰에 등록된 캐릭터 중에서 대본에 등장하는 캐릭터를 선택하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingWebtoonCharacters ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">캐릭터 목록 로딩 중...</span>
              </div>
            ) : webtoonCharacters.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">등록된 캐릭터가 없습니다.</p>
                <p className="text-xs mt-1">먼저 웹툰에 캐릭터를 등록해주세요.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {webtoonCharacters.map((character) => {
                  const isSelected = selectedManualCharacters.has(character.id);
                  const sheetCount = character.character_sheets?.length || 0;
                  const firstSheet = character.character_sheets?.[0];
                  return (
                    <div
                      key={character.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => handleManualCharacterToggle(character.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => handleManualCharacterToggle(character.id)}
                      />
                      {firstSheet ? (
                        <img
                          src={firstSheet.file_path}
                          alt={character.name}
                          className="w-12 h-12 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <User className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{character.name}</h4>
                        {sheetCount > 0 && (
                          <p className="text-xs text-muted-foreground">캐릭터시트 {sheetCount}개</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setManualSelectOpen(false)}
              disabled={savingManualCharacters}
            >
              취소
            </Button>
            <Button
              onClick={handleManualSelectConfirm}
              disabled={savingManualCharacters || selectedManualCharacters.size === 0}
            >
              {savingManualCharacters ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  선택 완료 ({selectedManualCharacters.size}명)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 대본 수정 다이얼로그 */}
      <Dialog open={editScriptDialogOpen} onOpenChange={(open) => {
        setEditScriptDialogOpen(open);
        if (!open) setEditingScript(null);
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              대본 수정
            </DialogTitle>
            <DialogDescription>
              대본의 제목과 내용을 수정할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">제목 (선택)</label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="대본 제목"
                value={editScriptTitle}
                onChange={(e) => setEditScriptTitle(e.target.value)}
                disabled={savingEditScript}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">대본 내용</label>
              <Textarea
                value={editScriptContent}
                onChange={(e) => setEditScriptContent(e.target.value)}
                placeholder="대본 내용을 입력하세요..."
                className="min-h-[300px]"
                disabled={savingEditScript}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditScriptDialogOpen(false);
                setEditingScript(null);
              }}
              disabled={savingEditScript}
            >
              취소
            </Button>
            <Button
              onClick={handleEditScriptSave}
              disabled={savingEditScript || !editScriptContent.trim()}
            >
              {savingEditScript ? (
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 컷목록 바로넣기 컨펌 다이얼로그 */}
      <Dialog open={cutListConfirmOpen} onOpenChange={setCutListConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>컷목록 바로넣기</DialogTitle>
            <DialogDescription>
              현재 만들어진 컷정보를 지우고 대본의 컷 내용으로 새로 생성합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {pendingCutListScript && (() => {
                const cuts = parseCutList(pendingCutListScript.content);
                return `대본에서 ${cuts.length}개의 컷을 추출하여 글콘티로 저장합니다. 기존 글콘티와 생성된 이미지가 모두 삭제됩니다.`;
              })()}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCutListConfirmOpen(false);
                setPendingCutListScript(null);
              }}
              disabled={savingCutList}
            >
              취소
            </Button>
            <Button
              onClick={handleDirectCutListConfirm}
              disabled={savingCutList}
            >
              {savingCutList ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  추출 중...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  확인
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 컷 수정 다이얼로그 */}
      <Dialog open={cutEditDialogOpen} onOpenChange={setCutEditDialogOpen}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>컷 수정</DialogTitle>
            <DialogDescription>
              전체 대본과 현재 컷 내용을 바탕으로 수정 지시를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          {editingCut && (
            <div className="space-y-4">
              {/* 현재 컷 내용 표시 또는 직접 수정 폼 */}
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">현재 컷 내용 (컷 {editingCut.cut.cutNumber})</h4>
                    {!directEditMode && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDirectEditOpen}
                      >
                        <PenLine className="h-3 w-3 mr-1" />
                        직접 수정
                      </Button>
                    )}
                  </div>

                  {directEditMode ? (
                    // 직접 수정 폼
                    <div className="space-y-3 border rounded-lg p-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">제목</label>
                        <input
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          placeholder="컷 제목"
                          value={directEditValues.title}
                          onChange={(e) => setDirectEditValues((prev) => ({ ...prev, title: e.target.value }))}
                          disabled={savingDirectEdit}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">배경</label>
                        <Textarea
                          placeholder="배경 설명"
                          value={directEditValues.background}
                          onChange={(e) => setDirectEditValues((prev) => ({ ...prev, background: e.target.value }))}
                          disabled={savingDirectEdit}
                          className="min-h-[60px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">연출/구도</label>
                        <Textarea
                          placeholder="연출 및 구도 설명"
                          value={directEditValues.description}
                          onChange={(e) => setDirectEditValues((prev) => ({ ...prev, description: e.target.value }))}
                          disabled={savingDirectEdit}
                          className="min-h-[80px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">대사/내레이션</label>
                        <Textarea
                          placeholder="대사 또는 내레이션"
                          value={directEditValues.dialogue}
                          onChange={(e) => setDirectEditValues((prev) => ({ ...prev, dialogue: e.target.value }))}
                          disabled={savingDirectEdit}
                          className="min-h-[60px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">등장인물 (쉼표로 구분)</label>
                        <input
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          placeholder="예: 철수, 영희, 민수"
                          value={directEditValues.charactersInCut}
                          onChange={(e) => setDirectEditValues((prev) => ({ ...prev, charactersInCut: e.target.value }))}
                          disabled={savingDirectEdit}
                        />
                      </div>
                    </div>
                  ) : (
                    // 읽기 전용 표시
                    <div className="bg-muted/50 p-3 rounded space-y-2 text-sm">
                      {editingCut.cut.title && (
                        <div>
                          <span className="font-semibold">제목:</span> {editingCut.cut.title}
                        </div>
                      )}
                      {editingCut.cut.background && (
                        <div>
                          <span className="font-semibold">배경:</span> {editingCut.cut.background}
                        </div>
                      )}
                      {editingCut.cut.description && (
                        <div>
                          <span className="font-semibold">연출/구도:</span> {editingCut.cut.description}
                        </div>
                      )}
                      {editingCut.cut.dialogue && (
                        <div>
                          <span className="font-semibold">대사/내레이션:</span> {editingCut.cut.dialogue}
                        </div>
                      )}
                      {Array.isArray(editingCut.cut.charactersInCut) && editingCut.cut.charactersInCut.length > 0 && (
                        <div>
                          <span className="font-semibold">등장인물:</span> {editingCut.cut.charactersInCut.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* LLM 수정 지시 (직접 수정 모드가 아닐 때만 표시) */}
                {!directEditMode && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">수정 지시 (AI)</h4>
                    <Textarea
                      value={modificationPrompt}
                      onChange={(e) => setModificationPrompt(e.target.value)}
                      placeholder="예: 배경을 실내로 변경하고, 클로즈업으로 변경해주세요"
                      className="min-h-[120px]"
                      disabled={modifyingCut}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCutEditDialogOpen(false);
                    setEditingCut(null);
                    setModificationPrompt('');
                    setDirectEditMode(false);
                  }}
                  disabled={modifyingCut || savingDirectEdit}
                >
                  취소
                </Button>

                {directEditMode ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setDirectEditMode(false)}
                      disabled={savingDirectEdit}
                    >
                      AI 수정으로 돌아가기
                    </Button>
                    <Button
                      onClick={handleDirectEditSave}
                      disabled={savingDirectEdit}
                    >
                      {savingDirectEdit ? (
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
                  </>
                ) : (
                  <Button
                    onClick={handleModifyCut}
                    disabled={modifyingCut || !modificationPrompt.trim()}
                  >
                    {modifyingCut ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        수정 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        AI로 수정
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
