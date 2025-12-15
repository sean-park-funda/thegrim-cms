'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, FileText, Send, Trash2, ArrowUp, ArrowDown, Plus, RefreshCcw, PenLine, User, Sparkles, Check } from 'lucide-react';
import { ImageViewer } from '@/components/ImageViewer';
import { CharacterManagementDialog } from '@/components/CharacterManagementDialog';
import { CharacterEditDialog } from '@/components/CharacterEditDialog';
import { Webtoon } from '@/lib/supabase';
import { createCharacter } from '@/lib/api/characters';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Cut {
  cutNumber: number;
  title: string;
  background?: string;
  description: string;
  dialogue?: string;
  // 이 컷에 등장하는 모든 인물 이름 (대사가 없는 캐릭터도 포함)
  charactersInCut?: string[];
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
  cutId: string;
  episodeId?: string;
  webtoonId?: string;
}

export function ScriptToStoryboard({ cutId, episodeId, webtoonId }: ScriptToStoryboardProps) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [cutDrawingId, setCutDrawingId] = useState<string | null>(null);
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
  const [characterManagementOpen, setCharacterManagementOpen] = useState(false);
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

  const canLoad = useMemo(() => !!episodeId, [episodeId]);

  const loadScripts = useCallback(async () => {
    if (!episodeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/episode-scripts?episodeId=${episodeId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '스크립트 목록을 불러오지 못했습니다.');
      }
      const data = (await res.json()) as Script[];
      setScripts(data ?? []);

      // 이미 생성된 컷 이미지 매핑
      const imageMap: Record<string, string> = {};
      (data ?? []).forEach((s) => {
        s.storyboards?.forEach((sb) => {
          sb.images?.forEach((img) => {
            const key = `${sb.id}-${img.cut_index}`;
            imageMap[key] = `data:${img.mime_type};base64,${img.image_base64}`;
          });
        });
      });
      setCutImages(imageMap);

      // DB에서 가져온 캐릭터 분석 결과를 상태에 설정
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
            characters: s.character_analysis.characters,
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
      const updatedScripts = [...scripts, created].sort((a, b) => a.order_index - b.order_index);
      setScripts(updatedScripts);
      setNewTitle('');
      setNewContent('');
      setShowAddScriptForm(false);
      // 새로 생성된 대본을 선택
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
    } catch (err) {
      console.error('글콘티 생성 실패:', err);
      setError(err instanceof Error ? err.message : '글콘티 생성에 실패했습니다.');
    } finally {
      setGeneratingId(null);
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

  const handleDrawCut = async (sbId: string, cutIdx: number, cut: Cut) => {
    const key = `${sbId}-${cutIdx}`;
    setCutDrawingId(key);
    setError(null);
    try {
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
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '콘티 이미지를 생성하지 못했습니다.');
      }
      const data = await res.json();
      if (data.imageUrl) {
        setCutImages((prev) => ({ ...prev, [key]: data.imageUrl }));
      } else {
        throw new Error('이미지 URL이 응답에 없습니다.');
      }
    } catch (err) {
      console.error('콘티 이미지 생성 실패:', err);
      setError(err instanceof Error ? err.message : '콘티 이미지 생성에 실패했습니다.');
    } finally {
      setCutDrawingId(null);
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
      <div className="flex items-center gap-2 p-4 border-b flex-shrink-0">
        <FileText className="h-6 w-6" />
        <h1 className="text-2xl font-bold">대본to글콘티</h1>
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
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                            <span className="truncate">{script.title || '제목 없음'}</span>
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs">
                            {expandedScripts.has(script.id) || script.content.length <= 240 ? (
                              <span className="whitespace-pre-wrap">{script.content}</span>
                            ) : (
                              <>
                                {script.content.slice(0, 240)}
                                {' '}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedScripts((prev) => {
                                      const next = new Set(prev);
                                      next.add(script.id);
                                      return next;
                                    });
                                  }}
                                  className="text-primary hover:underline text-xs font-medium"
                                >
                                  전체 보기
                                </button>
                              </>
                            )}
                            {expandedScripts.has(script.id) && script.content.length > 240 && (
                              <>
                                {' '}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedScripts((prev) => {
                                      const next = new Set(prev);
                                      next.delete(script.id);
                                      return next;
                                    });
                                  }}
                                  className="text-primary hover:underline text-xs font-medium"
                                >
                                  접기
                                </button>
                              </>
                            )}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-1">
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
                      <Button
                        size="sm"
                        variant="outline"
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
                  </CardHeader>
                  <CardContent>
                    {characterAnalysis[selectedScript.id] &&
                    characterAnalysis[selectedScript.id].characters.length > 0 ? (
                      <div className="space-y-3">
                        {characterAnalysis[selectedScript.id].characters.map((char, charIdx) => (
                            <Card key={charIdx} className="p-3">
                              <div className="flex items-start gap-3">
                                {char.existsInDb && char.characterSheets.length > 0 ? (
                                  <img
                                    src={char.characterSheets[0].file_path}
                                    alt={char.name}
                                    className="w-16 h-16 rounded object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-16 h-16 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                    <User className="h-8 w-8 text-muted-foreground/40" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <h5 className="font-semibold text-sm truncate">{char.name}</h5>
                                  {char.description && (
                                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                                      {char.description}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 mt-2">
                                    {char.existsInDb && (
                                      <p className="text-xs text-muted-foreground">
                                        캐릭터시트 {char.characterSheets.length}개
                                      </p>
                                    )}
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
                                          이미지 생성
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
                              </div>
                            </Card>
                          ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">캐릭터 분석을 실행하면 등장인물이 표시됩니다.</p>
                    )}
                  </CardContent>
                </Card>

                {/* 생성된 글콘티 */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>생성된 글콘티</CardTitle>
                      <Button
                        size="sm"
                        onClick={() => handleGenerate(selectedScript)}
                        disabled={generatingId === selectedScript.id}
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
                                      {cut.background && (
                                        <div>
                                          <h5 className="text-xs font-semibold text-muted-foreground mb-1">배경</h5>
                                          <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded">
                                            {cut.background}
                                          </p>
                                        </div>
                                      )}
                                      {cut.description && (
                                        <div>
                                          <h5 className="text-xs font-semibold text-muted-foreground mb-1">
                                            연출/구도
                                          </h5>
                                          <p className="text-sm whitespace-pre-wrap">{cut.description}</p>
                                        </div>
                                      )}
                                      {cut.dialogue && (
                                        <div>
                                          <h5 className="text-xs font-semibold text-muted-foreground mb-1">
                                            대사/내레이션
                                          </h5>
                                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                            {cut.dialogue}
                                          </p>
                                        </div>
                                      )}
                                      {Array.isArray(cut.charactersInCut) && cut.charactersInCut.length > 0 && (
                                        <div>
                                          <h5 className="text-xs font-semibold text-muted-foreground mb-1">
                                            등장인물
                                          </h5>
                                          <p className="text-sm text-muted-foreground">
                                            {cut.charactersInCut.join(', ')}
                                          </p>
                                        </div>
                                      )}
                                      <div className="mt-auto pt-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleDrawCut(sb.id, i, cut)}
                                          disabled={cutDrawingId === `${sb.id}-${i}`}
                                          className="w-full"
                                        >
                                          {cutDrawingId === `${sb.id}-${i}` ? (
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
                        <p className="text-sm text-muted-foreground">글콘티 생성 버튼을 클릭하면 글콘티가 생성됩니다.</p>
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

      {/* 캐릭터 관리 다이얼로그 */}
      {webtoonId && (
        <CharacterManagementDialog
          open={characterManagementOpen}
          onOpenChange={setCharacterManagementOpen}
          webtoon={{ id: webtoonId } as Webtoon}
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
    </div>
  );
}

