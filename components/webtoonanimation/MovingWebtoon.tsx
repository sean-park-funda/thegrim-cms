'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Download,
  Trash2,
  Plus,
  Merge,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  WebtoonAnimationCut,
  MovingWebtoonProject,
  MovingWebtoonCut,
  MovingWebtoonCutWithImage,
  MovingWebtoonMotionType,
  MOTION_TYPE_PRESETS,
} from '@/lib/supabase';

interface MovingWebtoonProps {
  cuts: WebtoonAnimationCut[];
  projectId: string;
}

const PROVIDERS = [
  { id: 'kling-o3-pro', name: 'Kling O3 Pro', badge: '추천' },
  { id: 'kling-o3-standard', name: 'Kling O3 Standard', badge: '저렴' },
  { id: 'veo-3.1', name: 'Veo 3.1', badge: '' },
];

export function MovingWebtoon({ cuts, projectId }: MovingWebtoonProps) {
  const [mwProject, setMwProject] = useState<MovingWebtoonProject | null>(null);
  const [mwCuts, setMwCuts] = useState<MovingWebtoonCutWithImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);

  // 기본 설정
  const [defaultProvider, setDefaultProvider] = useState('kling-o3-pro');
  const [defaultMotion, setDefaultMotion] = useState<MovingWebtoonMotionType>('lip_sync');

  // 컷 추가 모드
  const [showCutPicker, setShowCutPicker] = useState(false);

  // 확장된 컷 (프롬프트 편집용)
  const [expandedCut, setExpandedCut] = useState<string | null>(null);

  // ===== 데이터 로드 =====
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/webtoonanimation/moving-webtoon?projectId=${projectId}`);
      const data = await res.json();

      if (data.project) {
        setMwProject(data.project);
        setMwCuts(data.cuts || []);
        setDefaultProvider(data.project.default_provider || 'kling-o3-pro');
        setDefaultMotion(data.project.default_motion_type || 'lip_sync');
      }
    } catch (e) {
      console.error('무빙웹툰 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ===== 프로젝트 생성/초기화 =====
  const initProject = async () => {
    try {
      const res = await fetch('/api/webtoonanimation/moving-webtoon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          projectId,
          defaultProvider,
          defaultMotionType: defaultMotion,
        }),
      });
      const data = await res.json();
      if (data.id) {
        setMwProject(data);
        setShowCutPicker(true);
      }
    } catch (e) {
      console.error('프로젝트 생성 실패:', e);
    }
  };

  // ===== 컷 추가 =====
  const addCuts = async (cutIds: string[]) => {
    if (!mwProject) return;

    const maxOrder = mwCuts.length > 0 ? Math.max(...mwCuts.map((c) => c.order_index)) + 1 : 0;
    const preset = MOTION_TYPE_PRESETS[defaultMotion];

    const cutsToAdd = cutIds.map((cutId, i) => ({
      cutId,
      orderIndex: maxOrder + i,
      motionType: defaultMotion,
      prompt: preset.prompt,
    }));

    try {
      const res = await fetch('/api/webtoonanimation/moving-webtoon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_cuts',
          movingProjectId: mwProject.id,
          cuts: cutsToAdd,
        }),
      });
      if (res.ok) {
        await loadData();
        setShowCutPicker(false);
      }
    } catch (e) {
      console.error('컷 추가 실패:', e);
    }
  };

  // ===== 개별 영상 생성 =====
  const generateCut = async (mwCut: MovingWebtoonCutWithImage) => {
    setGenerating((prev) => new Set(prev).add(mwCut.id));

    try {
      const res = await fetch('/api/webtoonanimation/moving-webtoon/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cutId: mwCut.id,
          prompt: mwCut.prompt,
          provider: mwCut.provider || defaultProvider,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setMwCuts((prev) => prev.map((c) => (c.id === updated.id ? { ...updated, cut: c.cut } : c)));
      } else {
        const err = await res.json();
        setMwCuts((prev) =>
          prev.map((c) =>
            c.id === mwCut.id
              ? { ...c, status: 'failed' as const, error_message: err.error }
              : c
          )
        );
      }
    } catch (e) {
      console.error('영상 생성 실패:', e);
    } finally {
      setGenerating((prev) => {
        const next = new Set(prev);
        next.delete(mwCut.id);
        return next;
      });
    }
  };

  // ===== 전체 생성 =====
  const generateAll = async () => {
    const pendingCuts = mwCuts.filter((c) => c.status === 'pending' || c.status === 'failed');
    for (const cut of pendingCuts) {
      await generateCut(cut);
    }
  };

  // ===== 합치기 =====
  const mergeCuts = async (transition?: string) => {
    if (!mwProject) return;
    setMerging(true);

    try {
      const res = await fetch('/api/webtoonanimation/moving-webtoon/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movingProjectId: mwProject.id,
          transition,
        }),
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

  // ===== 컷 업데이트 =====
  const updateCut = async (cutId: string, updates: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/webtoonanimation/moving-webtoon', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId, ...updates }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMwCuts((prev) =>
          prev.map((c) => (c.id === cutId ? { ...updated, cut: c.cut } : c))
        );
      }
    } catch (e) {
      console.error('업데이트 실패:', e);
    }
  };

  // ===== 컷 삭제 =====
  const deleteCut = async (cutId: string) => {
    try {
      const res = await fetch(`/api/webtoonanimation/moving-webtoon?cutId=${cutId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMwCuts((prev) => prev.filter((c) => c.id !== cutId));
      }
    } catch (e) {
      console.error('삭제 실패:', e);
    }
  };

  // ===== 모션타입 변경 시 프롬프트 자동 업데이트 =====
  const handleMotionChange = (cutId: string, motion: MovingWebtoonMotionType) => {
    const preset = MOTION_TYPE_PRESETS[motion];
    updateCut(cutId, {
      motion_type: motion,
      prompt: motion !== 'custom' ? preset.prompt : undefined,
    });
  };

  // ===== 로딩 =====
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ===== 프로젝트 미생성 =====
  if (!mwProject) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <h3 className="text-lg font-medium">무빙웹툰 시작하기</h3>
              <p className="text-sm text-muted-foreground">
                웹툰 컷을 선택하면 캐릭터 일관성을 유지하면서 최소한의 움직임을 추가합니다.
              </p>

              <div className="flex gap-4 justify-center">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">기본 모델</label>
                  <Select value={defaultProvider} onValueChange={setDefaultProvider}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} {p.badge && <Badge variant="secondary" className="ml-1 text-[10px]">{p.badge}</Badge>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">기본 움직임</label>
                  <Select value={defaultMotion} onValueChange={(v) => setDefaultMotion(v as MovingWebtoonMotionType)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MOTION_TYPE_PRESETS).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{val.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={initProject} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                무빙웹툰 프로젝트 시작
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedCount = mwCuts.filter((c) => c.status === 'completed').length;
  const pendingCount = mwCuts.filter((c) => c.status === 'pending' || c.status === 'failed').length;

  return (
    <div className="space-y-4">
      {/* 상단 설정 바 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Select value={defaultProvider} onValueChange={setDefaultProvider}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={defaultMotion} onValueChange={(v) => setDefaultMotion(v as MovingWebtoonMotionType)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MOTION_TYPE_PRESETS).map(([key, val]) => (
                <SelectItem key={key} value={key}>{val.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="outline" className="text-xs">
            {completedCount}/{mwCuts.length} 완료
          </Badge>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowCutPicker(!showCutPicker)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            컷 추가
          </Button>

          {pendingCount > 0 && (
            <Button size="sm" onClick={generateAll} disabled={generating.size > 0}>
              {generating.size > 0 ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1" />
              )}
              전체 생성 ({pendingCount}개)
            </Button>
          )}

          {completedCount >= 2 && (
            <Button size="sm" variant="secondary" onClick={() => mergeCuts()} disabled={merging}>
              {merging ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Merge className="h-3.5 w-3.5 mr-1" />
              )}
              합치기 & 다운로드
            </Button>
          )}
        </div>
      </div>

      {/* 컷 선택기 */}
      {showCutPicker && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-3">추가할 컷을 선택하세요 (클릭으로 토글)</p>
            <CutPicker
              cuts={cuts}
              existingCutIds={new Set(mwCuts.map((c) => c.cut_id).filter(Boolean) as string[])}
              onConfirm={(ids) => { addCuts(ids); }}
              onCancel={() => setShowCutPicker(false)}
            />
          </CardContent>
        </Card>
      )}

      {/* 컷 목록 */}
      {mwCuts.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            컷을 추가해주세요
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {mwCuts.map((mwCut) => (
            <MovingWebtoonCutCard
              key={mwCut.id}
              mwCut={mwCut}
              isGenerating={generating.has(mwCut.id)}
              isExpanded={expandedCut === mwCut.id}
              onToggleExpand={() => setExpandedCut(expandedCut === mwCut.id ? null : mwCut.id)}
              onGenerate={() => generateCut(mwCut)}
              onMotionChange={(motion) => handleMotionChange(mwCut.id, motion)}
              onPromptChange={(prompt) => updateCut(mwCut.id, { prompt })}
              onDelete={() => deleteCut(mwCut.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===== 컷 카드 컴포넌트 =====
function MovingWebtoonCutCard({
  mwCut,
  isGenerating,
  isExpanded,
  onToggleExpand,
  onGenerate,
  onMotionChange,
  onPromptChange,
  onDelete,
}: {
  mwCut: MovingWebtoonCutWithImage;
  isGenerating: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onGenerate: () => void;
  onMotionChange: (motion: MovingWebtoonMotionType) => void;
  onPromptChange: (prompt: string) => void;
  onDelete: () => void;
}) {
  const [localPrompt, setLocalPrompt] = useState(mwCut.prompt || '');

  useEffect(() => {
    setLocalPrompt(mwCut.prompt || '');
  }, [mwCut.prompt]);

  const statusColor = {
    pending: 'bg-gray-500',
    generating: 'bg-yellow-500 animate-pulse',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
  }[mwCut.status];

  const statusLabel = {
    pending: '대기',
    generating: '생성중',
    completed: '완료',
    failed: '실패',
  }[mwCut.status];

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-3 p-3">
        {/* 원본 이미지 */}
        <div className="shrink-0 w-24 h-32 rounded overflow-hidden bg-muted">
          {mwCut.cut?.file_path ? (
            <img
              src={mwCut.cut.file_path}
              alt={`컷 ${mwCut.order_index}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
              이미지 없음
            </div>
          )}
        </div>

        {/* 영상 미리보기 */}
        <div className="shrink-0 w-24 h-32 rounded overflow-hidden bg-muted">
          {mwCut.status === 'completed' && mwCut.video_url ? (
            <video
              src={mwCut.video_url}
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : mwCut.status === 'generating' || isGenerating ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
              영상 없음
            </div>
          )}
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">#{mwCut.order_index + 1}</span>
              <div className={`w-2 h-2 rounded-full ${statusColor}`} />
              <span className="text-xs text-muted-foreground">{statusLabel}</span>
              {mwCut.elapsed_ms && (
                <span className="text-xs text-muted-foreground">
                  ({(mwCut.elapsed_ms / 1000).toFixed(1)}초)
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Select
                value={mwCut.motion_type}
                onValueChange={(v) => onMotionChange(v as MovingWebtoonMotionType)}
              >
                <SelectTrigger className="w-28 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MOTION_TYPE_PRESETS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={onGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : mwCut.status === 'completed' ? (
                  <RefreshCw className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={onToggleExpand}
              >
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* 프롬프트 미리보기 (접혀있을 때) */}
          {!isExpanded && (
            <p className="text-xs text-muted-foreground truncate">
              {mwCut.prompt || '프롬프트 없음'}
            </p>
          )}

          {/* 에러 메시지 */}
          {mwCut.error_message && (
            <p className="text-xs text-red-500">{mwCut.error_message}</p>
          )}
        </div>
      </div>

      {/* 확장: 프롬프트 편집 */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t pt-3">
          <Textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onBlur={() => {
              if (localPrompt !== mwCut.prompt) {
                onPromptChange(localPrompt);
              }
            }}
            rows={4}
            className="text-xs"
            placeholder="프롬프트를 입력하세요..."
          />
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">
              모션: {MOTION_TYPE_PRESETS[mwCut.motion_type]?.label}
              {mwCut.provider && ` · ${mwCut.provider}`}
              {` · ${mwCut.duration_seconds}초`}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

// ===== 컷 선택기 컴포넌트 =====
function CutPicker({
  cuts,
  existingCutIds,
  onConfirm,
  onCancel,
}: {
  cuts: WebtoonAnimationCut[];
  existingCutIds: Set<string>;
  onConfirm: (cutIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const available = cuts.filter((c) => !existingCutIds.has(c.id)).map((c) => c.id);
    setSelected(new Set(available));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={selectAll}>전체 선택</Button>
        <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>선택 해제</Button>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-60 overflow-y-auto">
        {cuts.map((cut) => {
          const isExisting = existingCutIds.has(cut.id);
          const isSelected = selected.has(cut.id);

          return (
            <button
              key={cut.id}
              onClick={() => !isExisting && toggle(cut.id)}
              disabled={isExisting}
              className={`relative aspect-[3/4] rounded overflow-hidden border-2 transition-colors ${
                isExisting
                  ? 'opacity-40 border-transparent cursor-not-allowed'
                  : isSelected
                    ? 'border-primary'
                    : 'border-transparent hover:border-muted-foreground/30'
              }`}
            >
              <img src={cut.file_path} alt={cut.file_name} className="w-full h-full object-cover" />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                {cut.order_index + 1}
              </div>
              {isExisting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-[10px]">
                  추가됨
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>취소</Button>
        <Button size="sm" onClick={() => onConfirm(Array.from(selected))} disabled={selected.size === 0}>
          {selected.size}개 추가
        </Button>
      </div>
    </div>
  );
}
