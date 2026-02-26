'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Check, Trash2, Wand2, Loader2, Download, Package } from 'lucide-react';
import {
  WebtoonAnimationCutPrompt,
  WebtoonAnimationPromptGroupWithCuts,
  WebtoonAnimationCut,
} from '@/lib/supabase';

interface CutPromptEditorProps {
  group: WebtoonAnimationPromptGroupWithCuts;
  cuts: WebtoonAnimationCut[];
  projectId: string;
  onUpdatePrompt: (id: string, field: string, value: string | number) => void;
  onUpdateGroup: (groupId: string, field: string, value: string) => void;
  onDeletePrompt: (id: string) => void;
  onRefinePrompt: (promptId: string, instruction: string, currentValues: {
    prompt: string; camera: string | null; continuity: string; duration: number;
  }) => Promise<void>;
}

const CAMERA_PRESETS = [
  'static, fixed lens',
  'slow zoom in',
  'slow zoom out',
  'pan left',
  'pan right',
  'tilt up',
  'tilt down',
  'tracking shot',
  'dolly in',
  'dolly out',
  'crane up',
  'crane down',
  'orbit',
  'low angle, slow zoom in',
  'high angle, static',
  'close-up, pull back',
];

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'];

export function CutPromptEditor({
  group,
  cuts,
  projectId,
  onUpdatePrompt,
  onUpdateGroup,
  onDeletePrompt,
  onRefinePrompt,
}: CutPromptEditorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refineInputs, setRefineInputs] = useState<Record<string, string>>({});
  const [refiningIds, setRefiningIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const prompts = group.cut_prompts || [];

  const handleRefine = async (prompt: WebtoonAnimationCutPrompt) => {
    const instruction = refineInputs[prompt.id]?.trim();
    if (!instruction) return;
    setRefiningIds((prev) => new Set(prev).add(prompt.id));
    try {
      await onRefinePrompt(prompt.id, instruction, {
        prompt: prompt.prompt,
        camera: prompt.camera || null,
        continuity: prompt.continuity,
        duration: prompt.duration,
      });
      setRefineInputs((prev) => ({ ...prev, [prompt.id]: '' }));
    } finally {
      setRefiningIds((prev) => {
        const next = new Set(prev);
        next.delete(prompt.id);
        return next;
      });
    }
  };

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/webtoonanimation/export-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.id, projectId }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`내보내기 실패: ${err.error}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : `output-${Date.now()}.zip`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('내보내기 실패:', e);
      alert('프롬프트 내보내기 중 오류가 발생했습니다.');
    } finally {
      setExporting(false);
    }
  }, [group.id, projectId]);

  const copyFullJson = useCallback(async () => {
    const output = {
      aspect_ratio: group.aspect_ratio,
      cuts: prompts.map((p, i) => ({
        cut_index: p.cut_index,
        reference_image: `@cut${String(i + 1).padStart(2, '0')}`,
        prompt: p.prompt,
        camera: p.camera || '',
        continuity: p.continuity,
        duration: p.duration,
      })),
    };
    await copyToClipboard(JSON.stringify(output, null, 2), 'full-json');
  }, [group, prompts, copyToClipboard]);

  const getCutThumbnail = (cutIndex: number) => {
    const realIndex = group.range_start + cutIndex;
    const cut = cuts.find((c) => c.order_index === realIndex);
    return cut?.file_path;
  };

  const handleContinuityToggle = (prompt: WebtoonAnimationCutPrompt, connected: boolean) => {
    if (!connected) {
      onUpdatePrompt(prompt.id, 'continuity', 'new scene');
    } else {
      const prevIndex = prompt.cut_index - 1;
      onUpdatePrompt(prompt.id, 'continuity', `continues from cut ${group.range_start + prevIndex}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* 공통 설정 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">
              공통 설정 (컷 {group.range_start}~{group.range_end})
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyFullJson}>
                {copiedId === 'full-json' ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                JSON 복사
              </Button>
              <Button
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Package className="h-3.5 w-3.5 mr-1.5" />
                )}
                {exporting ? '생성 중...' : '영상제작용 프롬프트 생성'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-xs whitespace-nowrap">비율</Label>
            <Select
              value={group.aspect_ratio}
              onValueChange={(v) => onUpdateGroup(group.id, 'aspect_ratio', v)}
            >
              <SelectTrigger className="w-28 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto text-sm tabular-nums">
              합계 <span className="font-semibold">{prompts.reduce((s, p) => s + (Number(p.duration) || 0), 0).toFixed(1)}초</span>
              <span className="text-muted-foreground ml-1">({prompts.length}컷)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 컷별 프롬프트 */}
      {prompts.map((prompt) => {
        const thumbnail = getCutThumbnail(prompt.cut_index);
        const isConnected = prompt.continuity !== 'new scene';

        return (
          <Card key={prompt.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex gap-4">
                {/* 썸네일 */}
                <div className="flex-shrink-0 w-24">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={`Cut ${group.range_start + prompt.cut_index}`}
                      className="w-24 h-24 object-cover rounded border"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                  <div className="text-center text-xs font-mono mt-1 text-muted-foreground">
                    컷 {group.range_start + prompt.cut_index}
                  </div>
                  <div className="text-center text-xs font-mono text-primary/70">
                    @cut{String(prompts.indexOf(prompt) + 1).padStart(2, '0')}
                  </div>
                </div>

                {/* 필드들 */}
                <div className="flex-1 space-y-2.5">
                  {/* 프롬프트 */}
                  <div>
                    <Label className="text-xs text-muted-foreground">프롬프트</Label>
                    <div className="flex gap-1">
                      <Textarea
                        value={prompt.prompt}
                        onChange={(e) => onUpdatePrompt(prompt.id, 'prompt', e.target.value)}
                        className="min-h-[60px] text-sm resize-y"
                        placeholder="영상 묘사 프롬프트 (영문)"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 flex-shrink-0"
                        onClick={() => copyToClipboard(prompt.prompt, prompt.id)}
                      >
                        {copiedId === prompt.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    {/* 카메라 */}
                    <div className="flex-1 min-w-[200px]">
                      <Label className="text-xs text-muted-foreground">카메라</Label>
                      <Input
                        value={prompt.camera || ''}
                        onChange={(e) => onUpdatePrompt(prompt.id, 'camera', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="예: low angle, slow zoom in"
                        list={`camera-presets-${prompt.id}`}
                      />
                      <datalist id={`camera-presets-${prompt.id}`}>
                        {CAMERA_PRESETS.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>

                    {/* 이어짐 */}
                    <div>
                      <Label className="text-xs text-muted-foreground">이어짐</Label>
                      <div className="flex gap-2 h-8 items-center">
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <input
                            type="radio"
                            name={`continuity-${prompt.id}`}
                            checked={!isConnected}
                            onChange={() => handleContinuityToggle(prompt, false)}
                            className="accent-primary"
                          />
                          새 장면
                        </label>
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <input
                            type="radio"
                            name={`continuity-${prompt.id}`}
                            checked={isConnected}
                            onChange={() => handleContinuityToggle(prompt, true)}
                            className="accent-primary"
                            disabled={prompt.cut_index === 0}
                          />
                          이전 컷 연결
                        </label>
                      </div>
                    </div>

                    {/* 길이 */}
                    <div>
                      <Label className="text-xs text-muted-foreground">길이(초)</Label>
                      <Input
                        type="number"
                        min={0.1}
                        max={12}
                        step={0.5}
                        value={prompt.duration}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (v > 0 && v <= 12) onUpdatePrompt(prompt.id, 'duration', v);
                        }}
                        className="w-20 h-8 text-sm"
                      />
                    </div>

                    {/* 삭제 */}
                    <div className="flex items-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => onDeletePrompt(prompt.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* AI 수정 */}
                  <div className="flex gap-1.5 pt-1 border-t border-dashed">
                    <Input
                      value={refineInputs[prompt.id] || ''}
                      onChange={(e) => setRefineInputs((prev) => ({ ...prev, [prompt.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleRefine(prompt); }}
                      className="h-8 text-sm"
                      placeholder="AI 수정 지시 (예: 버드아이뷰로 변경, 더 역동적으로)"
                      disabled={refiningIds.has(prompt.id)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 flex-shrink-0"
                      onClick={() => handleRefine(prompt)}
                      disabled={refiningIds.has(prompt.id) || !refineInputs[prompt.id]?.trim()}
                    >
                      {refiningIds.has(prompt.id) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
