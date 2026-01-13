'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { generateMonsterPromptV2, generateMonsterImage, MonsterStyle, MonsterV2Request, SectionSelection, BodySection, HumanType } from '@/lib/api/monsterGenerator';
import { getGroupedCreatureList, HUMAN_TYPES, SECTION_DESCRIPTIONS, CreatureGroup, CreatureWithId } from '@/lib/monster-styles';
import { Loader2, Sparkles, Save, CheckSquare2, X, Maximize2, User, Bug, GripVertical, ChevronDown, ChevronRight, FileText, Edit2, Copy, Shuffle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { ImageViewer } from '@/components/ImageViewer';
import { Process, Episode, Cut } from '@/lib/supabase';
import { useStore } from '@/lib/store/useStore';
import { useImageModel } from '@/lib/contexts/ImageModelContext';
import { getEpisodes } from '@/lib/api/episodes';
import { getCuts } from '@/lib/api/cuts';

interface MonsterImage {
  id: string;
  fileId: string | null;
  fileUrl: string | null;
  prompt: string;
  aspectRatio: string;
  selected: boolean;
  createdAt: string;
}

interface MonsterGeneratorV2Props {
  cutId?: string;
  webtoonId?: string;
  processes: Process[];
  onFilesReload: () => Promise<void>;
}

// 드래그 가능한 생물 아이템
interface DraggableCreatureItemProps {
  creature: CreatureWithId;
  categoryName: string;
}

function DraggableCreatureItem({ creature, categoryName }: DraggableCreatureItemProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'creature',
      creatureId: creature.id,
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="p-1.5 border rounded bg-background hover:bg-muted cursor-move transition-colors flex items-center gap-1.5 group"
    >
      <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{creature.name.split(' (')[0]}</div>
      </div>
    </div>
  );
}

// 드래그 가능한 인체 아이템
interface DraggableHumanItemProps {
  humanType: HumanType;
}

function DraggableHumanItem({ humanType }: DraggableHumanItemProps) {
  const humanInfo = HUMAN_TYPES[humanType];

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'human',
      humanType: humanType,
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="p-1.5 border rounded bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-move transition-colors flex items-center gap-1.5 group"
    >
      <User className="h-3 w-3 text-blue-600 dark:text-blue-400" />
      <div className="flex-1">
        <div className="text-xs font-medium">{humanInfo.name}</div>
      </div>
      <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

// 섹션 드롭존
interface SectionDropZoneProps {
  section: BodySection;
  value: SectionSelection;
  onChange: (value: SectionSelection) => void;
  creatureGroups: CreatureGroup[];
}

function SectionDropZone({ section, value, onChange, creatureGroups }: SectionDropZoneProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const sectionInfo = SECTION_DESCRIPTIONS[section];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'creature' && data.creatureId) {
        onChange({ type: 'creature', creatureId: data.creatureId });
      } else if (data.type === 'human' && data.humanType) {
        onChange({ type: 'human', humanType: data.humanType });
      }
    } catch (err) {
      console.error('드롭 데이터 파싱 실패:', err);
    }
  };

  const handleRandomCreature = () => {
    // 모든 생물을 평탄화
    const allCreatures: CreatureWithId[] = [];
    creatureGroups.forEach(group => {
      group.creatures.forEach(creature => {
        allCreatures.push(creature);
      });
    });

    if (allCreatures.length === 0) return;

    // 랜덤하게 하나 선택
    const randomIndex = Math.floor(Math.random() * allCreatures.length);
    const randomCreature = allCreatures[randomIndex];
    
    onChange({ type: 'creature', creatureId: randomCreature.id });
  };

  const getDisplayContent = () => {
    if (value.type === 'none') {
      return (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">여기에 드래그하세요</p>
          <p className="text-xs mt-1">또는 클릭하여 제거</p>
        </div>
      );
    }

    if (value.type === 'human' && value.humanType) {
      const humanInfo = HUMAN_TYPES[value.humanType];
      return (
        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md flex items-center gap-3">
          <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <div className="flex-1">
            <div className="font-medium">{humanInfo.name}</div>
            <div className="text-xs text-muted-foreground">{humanInfo.description}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ type: 'none' });
            }}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    if (value.type === 'creature' && value.creatureId) {
      for (const group of creatureGroups) {
        const creature = group.creatures.find(c => c.id === value.creatureId);
        if (creature) {
          return (
            <div className="p-3 bg-muted rounded-md flex items-center gap-3">
              <Bug className="h-6 w-6 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{creature.name.split(' (')[0]}</div>
                <div className="text-xs text-muted-foreground truncate">
                  [{group.categoryName}] {creature.description}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({ type: 'none' });
                }}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        }
      }
    }

    return null;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <span>{sectionInfo.name}</span>
          <span className="text-xs text-muted-foreground">({sectionInfo.description})</span>
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRandomCreature}
          className="h-7 w-7 p-0"
          title="랜덤 생물 선택"
        >
          <Shuffle className="h-3 w-3" />
        </Button>
      </div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`min-h-[100px] border-2 border-dashed rounded-lg transition-colors ${
          isDraggingOver
            ? 'border-primary bg-primary/5'
            : value.type !== 'none'
            ? 'border-border'
            : 'border-muted-foreground/30'
        }`}
      >
        {getDisplayContent()}
      </div>
    </div>
  );
}

// 접기/펼치기 가능한 카테고리 섹션
interface CollapsibleCategorySectionProps {
  group: CreatureGroup;
  isExpanded: boolean;
  onToggle: () => void;
}

function CollapsibleCategorySection({ group, isExpanded, onToggle }: CollapsibleCategorySectionProps) {
  return (
    <div className="space-y-1">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs font-semibold w-full text-left hover:text-primary transition-colors px-1"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Bug className="h-3 w-3" />
        {group.categoryName} ({group.creatures.length})
      </button>
      {isExpanded && (
        <div className="space-y-1 pl-4">
          {group.creatures.map((creature) => (
            <DraggableCreatureItem
              key={creature.id}
              creature={creature}
              categoryName={group.categoryName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 생물 목록 사이드바 (좌우 분할)
interface CreatureSidebarProps {
  creatureGroups: CreatureGroup[];
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

function CreatureSidebar({ creatureGroups }: CreatureSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(creatureGroups.map(g => g.category)));

  // 생물 그룹을 반으로 나누기
  const midPoint = Math.ceil(creatureGroups.length / 2);
  const leftGroups = creatureGroups.slice(0, midPoint);
  const rightGroups = creatureGroups.slice(midPoint);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const renderSidebarContent = (groups: CreatureGroup[], side: 'left' | 'right') => (
    <div className="flex-1 overflow-y-auto space-y-2 p-2">
      {/* 인체 섹션 (왼쪽에만 표시) */}
      {side === 'left' && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 px-1">
            <User className="h-3 w-3" />
            인체
          </div>
          <div className="space-y-1">
            {Object.entries(HUMAN_TYPES).map(([key, info]) => (
              <DraggableHumanItem key={key} humanType={key as HumanType} />
            ))}
          </div>
        </div>
      )}

      {/* 생물 카테고리별 */}
      {groups.map((group) => (
        <CollapsibleCategorySection
          key={group.category}
          group={group}
          isExpanded={expandedCategories.has(group.category)}
          onToggle={() => toggleCategory(group.category)}
        />
      ))}
    </div>
  );

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
        <div className="flex flex-1 overflow-hidden">
          {/* 왼쪽 사이드바 */}
          <div className="flex-1 flex flex-col border-r overflow-y-auto">
            {renderSidebarContent(leftGroups, 'left')}
          </div>
          {/* 오른쪽 사이드바 */}
          <div className="flex-1 flex flex-col overflow-y-auto">
            {renderSidebarContent(rightGroups, 'right')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MonsterGeneratorV2({ cutId, webtoonId, processes, onFilesReload }: MonsterGeneratorV2Props) {
  const { profile } = useStore();
  const { model: globalModel } = useImageModel();

  // 섹션 선택 상태
  const [faceSelection, setFaceSelection] = useState<SectionSelection>({ type: 'none' });
  const [torsoSelection, setTorsoSelection] = useState<SectionSelection>({ type: 'none' });
  const [limbsSelection, setLimbsSelection] = useState<SectionSelection>({ type: 'none' });
  const [otherSelection, setOtherSelection] = useState<SectionSelection>({ type: 'none' });

  // 기타 옵션
  const [monsterStyle, setMonsterStyle] = useState<MonsterStyle>('normal');
  const [allowVariant, setAllowVariant] = useState(false);
  const [generationCount, setGenerationCount] = useState<number>(4);

  // 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<MonsterImage[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [savingImages, setSavingImages] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<string>('');

  // 프롬프트 생성 및 수정 상태
  interface GeneratedPrompt {
    id: string;
    prompt: string;
    aspectRatio: string;
    negativePrompt?: string;
    isEditing: boolean;
    isLoading: boolean;  // 이미지 생성 중인지 여부
  }
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedPrompt[]>([]);
  const [promptLoading, setPromptLoading] = useState(false);

  // 이미지 뷰어 상태
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ url: string; name: string } | null>(null);
  const [generatingImages, setGeneratingImages] = useState<Array<{ id: string; status: 'loading' | 'success' | 'error' }>>([]);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);

  // 저장 다이얼로그용 회차/컷 선택 상태
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [episodesForSave, setEpisodesForSave] = useState<Episode[]>([]);
  const [cutsForSave, setCutsForSave] = useState<Cut[]>([]);
  const [selectedEpisodeIdForSave, setSelectedEpisodeIdForSave] = useState<string>('');
  const [selectedCutIdForSave, setSelectedCutIdForSave] = useState<string>('');
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loadingCuts, setLoadingCuts] = useState(false);

  // 생물 목록 (한 번만 로드)
  const creatureGroups = useMemo(() => getGroupedCreatureList(), []);

  // 최소 1개 이상 선택되었는지 확인
  const hasSelection = faceSelection.type !== 'none' ||
    torsoSelection.type !== 'none' ||
    limbsSelection.type !== 'none' ||
    otherSelection.type !== 'none';

  // 생성 히스토리 로드
  useEffect(() => {
    loadHistory();
  }, [cutId]);

  // 저장 다이얼로그가 열릴 때 회차 목록 로드
  useEffect(() => {
    if (saveDialogOpen && webtoonId && !cutId) {
      setLoadingEpisodes(true);
      getEpisodes(webtoonId)
        .then((data) => {
          const sorted = [...data].sort((a, b) => {
            if (a.episode_number === 0) return -1;
            if (b.episode_number === 0) return 1;
            return a.episode_number - b.episode_number;
          });
          setEpisodesForSave(sorted);
        })
        .catch((err) => console.error('회차 목록 로드 실패:', err))
        .finally(() => setLoadingEpisodes(false));
    }
  }, [saveDialogOpen, webtoonId, cutId]);

  // 회차가 선택되면 컷 목록 로드
  useEffect(() => {
    if (selectedEpisodeIdForSave) {
      setLoadingCuts(true);
      setCutsForSave([]);
      setSelectedCutIdForSave('');
      getCuts(selectedEpisodeIdForSave)
        .then((data) => {
          const sorted = [...data].sort((a, b) => a.cut_number - b.cut_number);
          setCutsForSave(sorted);
        })
        .catch((err) => console.error('컷 목록 로드 실패:', err))
        .finally(() => setLoadingCuts(false));
    } else {
      setCutsForSave([]);
      setSelectedCutIdForSave('');
    }
  }, [selectedEpisodeIdForSave]);

  const loadHistory = async () => {
    try {
      const response = await fetch(`/api/regenerate-image-history?userId=${profile?.id || ''}&limit=50`);
      if (!response.ok) {
        console.error('[괴수 생성기 v2] 히스토리 로드 실패');
        return;
      }
      const data = await response.json();
      const monsterImages = (data.history || [])
        .filter((item: { description?: string }) => item.description?.includes('괴수 생성기'))
        .map((item: { fileId: string; fileUrl: string; prompt: string; createdAt: string }) => ({
          id: item.fileId,
          fileId: item.fileId,
          fileUrl: item.fileUrl,
          prompt: item.prompt || '',
          aspectRatio: '1:1',
          selected: false,
          createdAt: item.createdAt,
        }));
      setGeneratedImages(monsterImages);
    } catch (error) {
      console.error('[괴수 생성기 v2] 히스토리 로드 실패:', error);
    }
  };

  // 프롬프트 생성
  const handleGeneratePrompt = async () => {
    if (!hasSelection) {
      setError('최소 1개 이상의 섹션을 선택해주세요.');
      return;
    }

    setPromptLoading(true);
    setError(null);

    try {
      // V2 요청 생성
      const request: MonsterV2Request = {
        face: faceSelection,
        torso: torsoSelection,
        limbs: limbsSelection,
        other: otherSelection,
        style: monsterStyle,
        allowVariant,
      };

      // 프롬프트 생성
      const promptResult = await generateMonsterPromptV2(request);

      if (promptResult.error || !promptResult.imagePrompt) {
        setError(promptResult.error || '프롬프트 생성에 실패했습니다.');
        return;
      }

      // 생성된 프롬프트를 목록에 추가
      const newPrompt: GeneratedPrompt = {
        id: `prompt-${Date.now()}`,
        prompt: promptResult.imagePrompt,
        aspectRatio: promptResult.aspectRatio || '1:1',
        negativePrompt: promptResult.negativePrompt,
        isEditing: false,
        isLoading: false,
      };

      setGeneratedPrompts(prev => [newPrompt, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '프롬프트 생성 중 오류가 발생했습니다.');
    } finally {
      setPromptLoading(false);
    }
  };

  // 프롬프트 수정
  const handleEditPrompt = (id: string, newPrompt: string) => {
    setGeneratedPrompts(prev => prev.map(p => 
      p.id === id ? { ...p, prompt: newPrompt } : p
    ));
  };

  // 프롬프트 삭제
  const handleDeletePrompt = (id: string) => {
    setGeneratedPrompts(prev => prev.filter(p => p.id !== id));
  };

  // 프롬프트로 이미지 생성
  const handleGenerateImage = async (promptId: string) => {
    const promptData = generatedPrompts.find(p => p.id === promptId);
    if (!promptData) {
      setImageError('프롬프트를 찾을 수 없습니다.');
      return;
    }

    // 해당 프롬프트만 로딩 상태로 변경
    setGeneratedPrompts(prev => prev.map(p =>
      p.id === promptId ? { ...p, isLoading: true } : p
    ));
    setImageError(null);
    setGenerationProgress({ current: 0, total: generationCount });

    const placeholderIds = Array.from({ length: generationCount }, (_, i) => ({
      id: `placeholder-${Date.now()}-${i}`,
      status: 'loading' as const,
    }));
    setGeneratingImages(placeholderIds);

    const BATCH_SIZE = 2;
    let successCount = 0;
    let failCount = 0;
    const errorMessages: string[] = [];

    try {
      for (let batchStart = 0; batchStart < generationCount; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, generationCount);
        const batchPromises: Promise<void>[] = [];

        for (let i = batchStart; i < batchEnd; i++) {
          const placeholderId = placeholderIds[i].id;

          const promise = (async () => {
            try {
              // 수정된 프롬프트로 이미지 생성
              const imageResult = await generateMonsterImage(
                promptData.prompt,
                promptData.aspectRatio,
                cutId,
                profile?.id,
                globalModel
              );

              if (imageResult.error) {
                setGeneratingImages(prev => prev.map(img =>
                  img.id === placeholderId ? { ...img, status: 'error' as const } : img
                ));
                failCount++;
                // 에러 메시지 수집 (중복 방지)
                if (imageResult.error && !errorMessages.includes(imageResult.error)) {
                  errorMessages.push(imageResult.error);
                }
                setGenerationProgress(prev => prev ? {
                  current: prev.current + 1,
                  total: prev.total,
                } : null);
                return;
              }

              if (imageResult.fileId && imageResult.fileUrl) {
                const newImage: MonsterImage = {
                  id: imageResult.fileId,
                  fileId: imageResult.fileId,
                  fileUrl: imageResult.fileUrl,
                  prompt: promptData.prompt,
                  aspectRatio: promptData.aspectRatio,
                  selected: false,
                  createdAt: new Date().toISOString(),
                };

                setGeneratingImages(prev => prev.map(img =>
                  img.id === placeholderId ? { ...img, status: 'success' as const } : img
                ));

                setGeneratedImages(prev => [newImage, ...prev]);
                successCount++;
              } else {
                setGeneratingImages(prev => prev.map(img =>
                  img.id === placeholderId ? { ...img, status: 'error' as const } : img
                ));
                failCount++;
              }

              setGenerationProgress(prev => prev ? {
                current: prev.current + 1,
                total: prev.total,
              } : null);
            } catch (err) {
              console.error(`이미지 ${i + 1} 생성 실패:`, err);
              setGeneratingImages(prev => prev.map(img =>
                img.id === placeholderId ? { ...img, status: 'error' as const } : img
              ));
              failCount++;
              // 예외 메시지 수집 (중복 방지)
              const errMsg = err instanceof Error ? err.message : String(err);
              if (errMsg && !errorMessages.includes(errMsg)) {
                errorMessages.push(errMsg);
              }
              setGenerationProgress(prev => prev ? {
                current: prev.current + 1,
                total: prev.total,
              } : null);
            }
          })();

          batchPromises.push(promise);
        }

        await Promise.allSettled(batchPromises);
      }

      setTimeout(() => {
        setGeneratingImages([]);
        setGenerationProgress(null);
      }, 500);

      await loadHistory();

      // 에러 메시지 표시 (구체적인 이유 포함)
      const errorDetail = errorMessages.length > 0 ? `\n실패 이유: ${errorMessages.join(', ')}` : '';
      if (failCount > 0 && successCount === 0) {
        setImageError(`모든 이미지 생성에 실패했습니다.${errorDetail}`);
      } else if (failCount > 0) {
        setImageError(`${successCount}개의 이미지가 생성되었습니다. ${failCount}개 실패.${errorDetail}`);
      } else if (successCount > 0) {
        setImageError(null);
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : '이미지 생성 중 오류가 발생했습니다.');
      setGeneratingImages([]);
      setGenerationProgress(null);
    } finally {
      // 해당 프롬프트의 로딩 상태 해제
      setGeneratedPrompts(prev => prev.map(p =>
        p.id === promptId ? { ...p, isLoading: false } : p
      ));
    }
  };

  const handleImageSelect = (id: string, selected: boolean) => {
    setSelectedImageIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedImageIds(new Set(generatedImages.map(img => img.id)));
  };

  const handleDeselectAll = () => {
    setSelectedImageIds(new Set());
  };

  const handleSaveImages = async () => {
    if (selectedImageIds.size === 0) {
      alert('선택된 이미지가 없습니다.');
      return;
    }

    if (!selectedProcessId) {
      alert('공정을 선택해주세요.');
      return;
    }

    if (!cutId) {
      setSaveDialogOpen(true);
      return;
    }

    await saveImagesToProcess(cutId);
  };

  const saveImagesToProcess = async (targetCutId: string) => {
    const selectedImages = generatedImages.filter(img => selectedImageIds.has(img.id) && img.fileId);
    if (selectedImages.length === 0) {
      alert('선택된 이미지를 찾을 수 없습니다.');
      return;
    }

    setSavingImages(true);

    try {
      let successCount = 0;
      let failCount = 0;

      for (const img of selectedImages) {
        try {
          if (!img.fileId) continue;

          const saveResponse = await fetch('/api/regenerate-image-save', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileId: img.fileId,
              processId: selectedProcessId,
              cutId: targetCutId,
              description: monsterStyle === 'jjk'
                ? '괴수 생성기 v2로 생성된 이미지 (주술회전 스타일)'
                : monsterStyle === 'higanjima'
                ? '괴수 생성기 v2로 생성된 이미지 (피안도 스타일)'
                : '괴수 생성기 v2로 생성된 이미지',
            }),
          });

          if (!saveResponse.ok) {
            const errorData = await saveResponse.json().catch(() => ({}));
            throw new Error(errorData.error || '이미지 저장에 실패했습니다.');
          }

          successCount++;
        } catch (error) {
          failCount++;
          console.error(`이미지 저장 실패:`, error);
        }
      }

      await onFilesReload();
      setSelectedImageIds(new Set());
      await loadHistory();

      setSaveDialogOpen(false);
      setSelectedEpisodeIdForSave('');
      setSelectedCutIdForSave('');

      if (failCount > 0 && successCount === 0) {
        alert(`모든 이미지 저장에 실패했습니다.`);
      } else if (failCount > 0) {
        alert(`${successCount}개의 이미지가 저장되었습니다. ${failCount}개 실패.`);
      } else {
        alert(`${successCount}개의 이미지가 저장되었습니다.`);
      }
    } catch (error) {
      console.error('이미지 저장 중 오류:', error);
      alert('이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingImages(false);
    }
  };

  return (
    <div className="flex gap-4 min-h-[600px]">
      {/* 좌측 생물 목록 사이드바 (좌우 분할) */}
      <div className="w-[600px] flex-shrink-0 h-[calc(100vh-200px)]">
        <CreatureSidebar
          creatureGroups={creatureGroups}
          searchQuery=""
          onSearchChange={() => {}}
        />
      </div>

      {/* 중앙 메인 컨텐츠 */}
      <div className="flex-1 overflow-y-auto">
        <Card className="mb-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              괴수 생성기 v2
            </CardTitle>
            <CardDescription className="text-xs">
              좌측 목록에서 생물이나 인체를 드래그하여 각 섹션에 드롭하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {/* 4개 섹션 드롭존 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SectionDropZone
                section="face"
                value={faceSelection}
                onChange={setFaceSelection}
                creatureGroups={creatureGroups}
              />
              <SectionDropZone
                section="torso"
                value={torsoSelection}
                onChange={setTorsoSelection}
                creatureGroups={creatureGroups}
              />
              <SectionDropZone
                section="limbs"
                value={limbsSelection}
                onChange={setLimbsSelection}
                creatureGroups={creatureGroups}
              />
              <SectionDropZone
                section="other"
                value={otherSelection}
                onChange={setOtherSelection}
                creatureGroups={creatureGroups}
              />
            </div>

            {/* 스타일 및 옵션 */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="mb-2 block text-sm font-medium">스타일</label>
                <Select value={monsterStyle} onValueChange={(value) => setMonsterStyle(value as MonsterStyle)}>
                  <SelectTrigger>
                    <SelectValue placeholder="스타일 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">
                      <span className="flex items-center gap-2">
                        <span>🖊️</span>
                        <span>일반 (흑백 펜화)</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="jjk">
                      <span className="flex items-center gap-2">
                        <span>👹</span>
                        <span>주술회전 (저주 괴수)</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="higanjima">
                      <span className="flex items-center gap-2">
                        <span>🧛</span>
                        <span>피안도 (악귀)</span>
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="allowVariant"
                  checked={allowVariant}
                  onCheckedChange={(checked) => setAllowVariant(checked === true)}
                />
                <label htmlFor="allowVariant" className="text-sm cursor-pointer">
                  변종 허용
                </label>
              </div>
            </div>

            {/* 프롬프트 생성 버튼 */}
            <div className="flex gap-2">
              <Button
                onClick={handleGeneratePrompt}
                disabled={promptLoading || !hasSelection}
                className={`flex-1 ${monsterStyle === 'jjk' ? 'bg-purple-600 hover:bg-purple-700' : monsterStyle === 'higanjima' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                size="sm"
              >
                {promptLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    프롬프트 생성 중...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    {!hasSelection ? '섹션을 선택하세요' : '프롬프트 생성'}
                  </>
                )}
              </Button>
            </div>

            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {imageError && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{imageError}</p>
              </div>
            )}

            {/* 생성된 프롬프트 목록 */}
            {generatedPrompts.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  생성된 프롬프트 ({generatedPrompts.length})
                </h3>
                {generatedPrompts.map((promptData) => (
                  <Card key={promptData.id} className="border-2">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">비율: {promptData.aspectRatio}</span>
                          {promptData.negativePrompt && (
                            <span className="text-xs text-muted-foreground">(Negative Prompt 포함)</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newPrompts = generatedPrompts.map(p =>
                                p.id === promptData.id ? { ...p, isEditing: !p.isEditing } : { ...p, isEditing: false }
                              );
                              setGeneratedPrompts(newPrompts);
                            }}
                            className="h-7 px-2"
                          >
                            {promptData.isEditing ? (
                              <>
                                <X className="h-3 w-3 mr-1" />
                                취소
                              </>
                            ) : (
                              <>
                                <Edit2 className="h-3 w-3 mr-1" />
                                수정
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeletePrompt(promptData.id)}
                            className="h-7 px-2 text-destructive hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {promptData.isEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={promptData.prompt}
                            onChange={(e) => handleEditPrompt(promptData.id, e.target.value)}
                            className="min-h-[150px] font-mono text-xs"
                            placeholder="프롬프트를 수정하세요..."
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                setGeneratedPrompts(prev => prev.map(p =>
                                  p.id === promptData.id ? { ...p, isEditing: false } : p
                                ));
                              }}
                            >
                              저장
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="p-3 bg-muted rounded-md">
                            <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                              {promptData.prompt}
                            </pre>
                          </div>
                          {promptData.negativePrompt && (
                            <div className="p-3 bg-muted/50 rounded-md">
                              <div className="text-xs font-medium mb-1">Negative Prompt:</div>
                              <pre className="text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground">
                                {promptData.negativePrompt}
                              </pre>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleGenerateImage(promptData.id)}
                              disabled={promptData.isLoading}
                              className="flex-1"
                            >
                              {promptData.isLoading ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  이미지 생성 중...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-4 w-4 mr-2" />
                                  이미지 생성
                                </>
                              )}
                            </Button>
                            <Select value={generationCount.toString()} onValueChange={(value) => setGenerationCount(parseInt(value))}>
                              <SelectTrigger className="w-[80px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1개</SelectItem>
                                <SelectItem value="2">2개</SelectItem>
                                <SelectItem value="4">4개</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(promptData.prompt);
                                  alert('프롬프트가 클립보드에 복사되었습니다.');
                                } catch (err) {
                                  console.error('복사 실패:', err);
                                }
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {promptLoading && (
              <div className="flex items-center justify-center p-4 border border-border rounded-lg">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  프롬프트 생성 중...
                </span>
              </div>
            )}

            {generatedPrompts.some(p => p.isLoading) && generationProgress && (
              <div className="flex items-center justify-center p-4 border border-border rounded-lg">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  이미지 생성 중 ({generationProgress.current}/{generationProgress.total})
                </span>
              </div>
            )}

            {/* 생성 히스토리 */}
            {(generatingImages.length > 0 || generatedImages.length > 0) && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between pb-2">
                  <h3 className="text-xs font-medium">생성 히스토리</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleSelectAll} className="gap-2">
                      <CheckSquare2 className="h-4 w-4" />
                      전체 선택
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDeselectAll} className="gap-2">
                      <X className="h-4 w-4" />
                      선택 해제
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {generatingImages.map((img) => (
                    <div key={img.id} className="relative border rounded-lg overflow-hidden aspect-square">
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        {img.status === 'loading' && (
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        )}
                        {img.status === 'error' && (
                          <div className="text-xs text-destructive text-center p-2">생성 실패</div>
                        )}
                        {img.status === 'success' && (
                          <div className="text-xs text-muted-foreground text-center p-2">완료</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {generatedImages.map((img) => (
                    <div
                      key={img.id}
                      className={`relative border rounded-lg overflow-hidden transition-all ${
                        selectedImageIds.has(img.id) ? 'ring-2 ring-primary' : ''
                      }`}
                    >
                      <div
                        className="aspect-square relative cursor-pointer group"
                        onClick={() => {
                          if (img.fileUrl) {
                            setViewerImage({ url: img.fileUrl, name: `monster-${img.id}` });
                            setViewerOpen(true);
                          }
                        }}
                      >
                        {img.fileUrl ? (
                          <>
                            <img src={img.fileUrl} alt="Generated monster" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="absolute top-1 right-1 z-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedImageIds.has(img.id)}
                          onCheckedChange={(checked) => handleImageSelect(img.id, checked === true)}
                          className="bg-white/80 border-gray-400"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {selectedImageIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <Select value={selectedProcessId} onValueChange={setSelectedProcessId}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="공정 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {processes.map((process) => (
                          <SelectItem key={process.id} value={process.id}>
                            {process.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleSaveImages} disabled={savingImages || !selectedProcessId} className="gap-2">
                      {savingImages ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          저장 중...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          저장하기 ({selectedImageIds.size}개)
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 저장 위치 선택 다이얼로그 */}
      <Dialog open={saveDialogOpen} onOpenChange={(open) => {
        setSaveDialogOpen(open);
        if (!open) {
          setSelectedEpisodeIdForSave('');
          setSelectedCutIdForSave('');
          setEpisodesForSave([]);
          setCutsForSave([]);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>저장 위치 선택</DialogTitle>
            <DialogDescription>이미지를 저장할 위치를 선택해주세요.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">회차 선택</label>
              <Select value={selectedEpisodeIdForSave} onValueChange={setSelectedEpisodeIdForSave} disabled={loadingEpisodes}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingEpisodes ? "로딩 중..." : "회차를 선택하세요"} />
                </SelectTrigger>
                <SelectContent>
                  {episodesForSave.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      {ep.episode_number === 0 ? '기타' : `${ep.episode_number}화`} - {ep.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEpisodeIdForSave && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">컷/페이지 선택</label>
                <Select value={selectedCutIdForSave} onValueChange={setSelectedCutIdForSave} disabled={loadingCuts}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCuts ? "로딩 중..." : "컷/페이지를 선택하세요"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cutsForSave.map((cut) => (
                      <SelectItem key={cut.id} value={cut.id}>
                        {cut.cut_number}번 {cut.title ? `- ${cut.title}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cutsForSave.length === 0 && !loadingCuts && (
                  <p className="text-xs text-muted-foreground">선택한 회차에 컷/페이지가 없습니다.</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">선택된 공정</label>
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                {processes.find(p => p.id === selectedProcessId) && (
                  <>
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: processes.find(p => p.id === selectedProcessId)?.color }}
                    />
                    <span className="text-sm">{processes.find(p => p.id === selectedProcessId)?.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setSaveDialogOpen(false);
              setSelectedEpisodeIdForSave('');
              setSelectedCutIdForSave('');
            }}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (!selectedCutIdForSave) {
                  alert('컷/페이지를 선택해주세요.');
                  return;
                }
                saveImagesToProcess(selectedCutIdForSave);
              }}
              disabled={savingImages || !selectedCutIdForSave}
            >
              {savingImages ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  저장하기 ({selectedImageIds.size}개)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 이미지 뷰어 */}
      {viewerImage && (
        <ImageViewer
          imageUrl={viewerImage.url}
          imageName={viewerImage.name}
          open={viewerOpen}
          onOpenChange={(open) => {
            setViewerOpen(open);
            if (!open) {
              setViewerImage(null);
            }
          }}
        />
      )}
    </div>
  );
}
