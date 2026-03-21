'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Sparkles, Copy, Check, Loader2, ChevronDown, ChevronUp,
  Film, RefreshCw, Wand2, ImageIcon, Play,
} from 'lucide-react';
import { WebtoonAnimationCut, WebtoonAnimationProject } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type FrameRole = 'start' | 'end' | 'middle';

const FRAME_ROLE_OPTIONS: { value: FrameRole; label: string }[] = [
  { value: 'start', label: '시작' },
  { value: 'end', label: '끝' },
  { value: 'middle', label: '중간 ref' },
];

const FRAME_STRATEGY_OPTIONS = [
  { value: 'enter', label: '등장' },
  { value: 'exit', label: '퇴장' },
  { value: 'expression', label: '표정변화' },
  { value: 'empty_to_action', label: '빈→액션' },
];

interface Props {
  cut: WebtoonAnimationCut;
  project: WebtoonAnimationProject | null;
  onCutUpdated: (updated: WebtoonAnimationCut) => void;
}

function CopyBtn({ text, id, copied, onCopy }: { text: string; id: string; copied: string | null; onCopy: (id: string, text: string) => void }) {
  return (
    <button onClick={() => onCopy(id, text)} className="text-muted-foreground hover:text-foreground p-0.5 shrink-0">
      {copied === id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function Wan22CutCard({ cut, project, onCutUpdated }: Props) {
  const [synopsis, setSynopsis] = useState(cut.cut_synopsis || '');
  const [frameRole, setFrameRole] = useState<FrameRole>((cut.frame_role as FrameRole) || 'end');
  const [frameStrategy, setFrameStrategy] = useState(cut.frame_strategy || '');
  const [useColorize, setUseColorize] = useState(cut.use_colorize !== false);

  const [colorizePrompt, setColorizePrompt] = useState(cut.gemini_colorize_prompt || '');
  const [expandPrompt, setExpandPrompt] = useState(cut.gemini_expand_prompt || '');
  const [otherFramePrompt, setOtherFramePrompt] = useState(cut.gemini_start_frame_prompt || '');
  const [videoPromptEn, setVideoPromptEn] = useState(cut.video_prompt || '');
  const [videoPromptKo, setVideoPromptKo] = useState(cut.video_prompt_ko || '');

  const [colorUrl, setColorUrl] = useState<string | null>(cut.color_image_url || null);
  const [anchorUrl, setAnchorUrl] = useState<string | null>(
    (cut.frame_role === 'start' ? cut.start_frame_url : cut.end_frame_url) || null
  );
  const [otherUrl, setOtherUrl] = useState<string | null>(
    (cut.frame_role === 'start' ? cut.end_frame_url : cut.start_frame_url) || null
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(cut.comfyui_video_url || null);

  const [genPrompts, setGenPrompts] = useState(false);
  const [genAnchor, setGenAnchor] = useState(false);
  const [genOther, setGenOther] = useState(false);
  const [genVideo, setGenVideo] = useState(false);
  const [refining, setRefining] = useState(false);

  const [showPrompts, setShowPrompts] = useState(!!(cut.gemini_expand_prompt));
  const [anchorInstr, setAnchorInstr] = useState('');
  const [otherInstr, setOtherInstr] = useState('');
  const [videoInstr, setVideoInstr] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const save = useCallback((field: string, value: string | boolean) => {
    clearTimeout(saveTimers.current[field]);
    saveTimers.current[field] = setTimeout(async () => {
      await fetch('/api/webtoonanimation/generate-cut-prompts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, field, value }),
      });
    }, 600);
  }, [cut.id]);

  const update = useCallback((patch: Partial<WebtoonAnimationCut>) => {
    onCutUpdated({ ...cut, ...patch });
  }, [cut, onCutUpdated]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleGeneratePrompts = async () => {
    if (!synopsis.trim()) return;
    setGenPrompts(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-cut-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cutId: cut.id, cutSynopsis: synopsis,
          frameRole, frameStrategy: frameStrategy || undefined,
          useColorize, characterSettings: project?.character_settings || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const p = data.prompts;
      setColorizePrompt(p.gemini_colorize || '');
      setExpandPrompt(p.gemini_expand || '');
      setOtherFramePrompt(p.gemini_other_frame || '');
      setVideoPromptEn(p.video_prompt || '');
      setVideoPromptKo(p.video_prompt_ko || '');
      setShowPrompts(true);
      update({
        cut_synopsis: synopsis, frame_role: frameRole, frame_strategy: frameStrategy || null,
        use_colorize: useColorize,
        gemini_colorize_prompt: p.gemini_colorize || null,
        gemini_expand_prompt: p.gemini_expand || null,
        gemini_start_frame_prompt: p.gemini_other_frame || null,
        video_prompt: p.video_prompt || null, video_prompt_ko: p.video_prompt_ko || null,
      });
    } catch (e) { alert(`프롬프트 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenPrompts(false); }
  };

  const handleGenAnchor = async (instr?: string) => {
    setGenAnchor(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, step: 'anchor', instruction: instr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.color_image_url) setColorUrl(data.color_image_url);
      const a = frameRole === 'start' ? data.start_frame_url : data.end_frame_url;
      if (a) setAnchorUrl(a);
      setAnchorInstr('');
      update({
        color_image_url: data.color_image_url || cut.color_image_url,
        start_frame_url: data.start_frame_url || cut.start_frame_url,
        end_frame_url: data.end_frame_url || cut.end_frame_url,
      });
    } catch (e) { alert(`앵커 프레임 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenAnchor(false); }
  };

  const handleGenOther = async (instr?: string) => {
    setGenOther(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, step: 'other', instruction: instr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const o = frameRole === 'start' ? data.end_frame_url : data.start_frame_url;
      if (o) setOtherUrl(o);
      setOtherInstr('');
      update({
        start_frame_url: data.start_frame_url || cut.start_frame_url,
        end_frame_url: data.end_frame_url || cut.end_frame_url,
      });
    } catch (e) { alert(`나머지 프레임 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenOther(false); }
  };

  const handleRefinePrompt = async (): Promise<boolean> => {
    if (!videoInstr.trim()) return false;
    setRefining(true);
    try {
      const res = await fetch('/api/webtoonanimation/refine-video-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, instruction: videoInstr, currentPromptEn: videoPromptEn, currentPromptKo: videoPromptKo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVideoPromptEn(data.video_prompt || '');
      setVideoPromptKo(data.video_prompt_ko || '');
      setVideoInstr('');
      update({ video_prompt: data.video_prompt, video_prompt_ko: data.video_prompt_ko });
      return true;
    } catch (e) { alert(`프롬프트 개선 실패: ${e instanceof Error ? e.message : e}`); return false; }
    finally { setRefining(false); }
  };

  const handleGenVideo = async () => {
    setGenVideo(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-comfyui-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVideoUrl(data.video_url);
      update({ comfyui_video_url: data.video_url });
    } catch (e) { alert(`영상 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenVideo(false); }
  };

  const hasAnchor = !!anchorUrl;
  const hasOther = frameRole === 'middle' || !!otherUrl;
  const canVideo = frameRole === 'middle' ? !!anchorUrl : (!!anchorUrl && !!otherUrl);
  const displayStart = frameRole === 'start' ? anchorUrl : otherUrl;
  const displayEnd = frameRole === 'middle' ? anchorUrl : (frameRole === 'start' ? otherUrl : anchorUrl);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground">CUT {cut.order_index + 1}</span>
        {cut.cut_synopsis && <span className="text-xs text-muted-foreground truncate">{cut.cut_synopsis}</span>}
        {videoUrl && <span className="ml-auto text-[10px] text-green-600 font-medium flex items-center gap-1"><Play className="h-3 w-3" />완료</span>}
      </div>

      {/* 본문: 좌(이미지들) + 우(컨트롤) */}
      <div className="grid grid-cols-[200px_1fr] divide-x">

        {/* ── 좌: 이미지 컬럼 ── */}
        <div className="p-3 space-y-2 bg-muted/10">
          {/* 원본 */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">원본</p>
            <img src={cut.file_path} alt="원본" className="w-full aspect-video object-cover rounded border" />
          </div>
          {/* 컬러 */}
          {colorUrl && useColorize && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">컬러화</p>
              <img src={colorUrl} alt="컬러" className="w-full aspect-video object-cover rounded border" />
            </div>
          )}
          {/* Start / End 프레임 */}
          {(displayStart || displayEnd) && (
            <div className="space-y-1.5">
              {displayStart && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Start Frame</p>
                  <img src={displayStart} alt="Start" className="w-full aspect-video object-cover rounded border" />
                </div>
              )}
              {displayEnd && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">{frameRole === 'middle' ? 'Ref Frame' : 'End Frame'}</p>
                  <img src={displayEnd} alt="End" className="w-full aspect-video object-cover rounded border" />
                </div>
              )}
            </div>
          )}
          {/* 영상 */}
          {videoUrl && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">영상</p>
              <video src={videoUrl} controls className="w-full rounded border" style={{ aspectRatio: '832/480' }} />
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary underline block text-center mt-1">새 탭</a>
            </div>
          )}
        </div>

        {/* ── 우: 컨트롤 컬럼 ── */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[800px]">

          {/* 연출 설명 */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">연출 설명</Label>
            <Textarea
              value={synopsis}
              onChange={(e) => { setSynopsis(e.target.value); save('cut_synopsis', e.target.value); }}
              placeholder="이 컷에서 일어나는 일을 설명해주세요"
              className="text-sm resize-none min-h-[64px]"
              rows={3}
            />
          </div>

          {/* 역할 + 컬러화 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">이 컷의 역할</Label>
              <div className="flex gap-1">
                {FRAME_ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setFrameRole(opt.value); save('frame_role', opt.value); }}
                    className={cn(
                      'flex-1 text-xs py-1 px-2 rounded border transition-colors',
                      frameRole === opt.value
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border hover:border-muted-foreground text-muted-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1 shrink-0">
              <Label className="text-xs text-muted-foreground">컬러화</Label>
              <div className="flex items-center gap-1.5 h-8">
                <Switch
                  checked={useColorize}
                  onCheckedChange={(v) => { setUseColorize(v); save('use_colorize', v); }}
                />
                <span className="text-xs text-muted-foreground">{useColorize ? 'ON' : 'OFF'}</span>
              </div>
            </div>
          </div>

          {/* 씬 유형 */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">씬 유형 (선택)</Label>
            <Select value={frameStrategy} onValueChange={(v) => { setFrameStrategy(v); save('frame_strategy', v); }}>
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="선택사항" />
              </SelectTrigger>
              <SelectContent>
                {FRAME_STRATEGY_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 프롬프트 생성 */}
          <Button onClick={handleGeneratePrompts} disabled={genPrompts || !synopsis.trim()} className="w-full" size="sm">
            {genPrompts
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
              : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />프롬프트 자동 생성</>}
          </Button>

          {/* 프롬프트 편집 (접기) */}
          {expandPrompt && (
            <div>
              <button
                onClick={() => setShowPrompts((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
              >
                {showPrompts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                이미지 프롬프트 편집
              </button>
              {showPrompts && (
                <div className="space-y-2 pt-2">
                  {useColorize && colorizePrompt !== undefined && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">컬러화</Label>
                        <CopyBtn text={colorizePrompt} id="col" copied={copied} onCopy={handleCopy} />
                      </div>
                      <Textarea value={colorizePrompt} onChange={(e) => { setColorizePrompt(e.target.value); save('gemini_colorize_prompt', e.target.value); }} className="text-xs font-mono resize-none" rows={2} />
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">앵커 프레임 (16:9 확장)</Label>
                      <CopyBtn text={expandPrompt} id="exp" copied={copied} onCopy={handleCopy} />
                    </div>
                    <Textarea value={expandPrompt} onChange={(e) => { setExpandPrompt(e.target.value); save('gemini_expand_prompt', e.target.value); }} className="text-xs font-mono resize-none" rows={2} />
                  </div>
                  {frameRole !== 'middle' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">{frameRole === 'start' ? '끝 프레임' : '시작 프레임'} 생성</Label>
                        <CopyBtn text={otherFramePrompt} id="oth" copied={copied} onCopy={handleCopy} />
                      </div>
                      <Textarea value={otherFramePrompt} onChange={(e) => { setOtherFramePrompt(e.target.value); save('gemini_start_frame_prompt', e.target.value); }} className="text-xs font-mono resize-none" rows={2} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 구분선 */}
          {expandPrompt && <div className="border-t" />}

          {/* 앵커 프레임 생성 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button onClick={() => handleGenAnchor()} disabled={genAnchor || !expandPrompt} variant={hasAnchor ? 'outline' : 'default'} size="sm" className="flex-1">
                {genAnchor
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />앵커 생성 중...</>
                  : <><ImageIcon className="h-3.5 w-3.5 mr-1.5" />{hasAnchor ? '앵커 재생성' : '① 앵커 프레임 생성'}</>}
              </Button>
            </div>
            {hasAnchor && (
              <div className="flex gap-2">
                <Textarea value={anchorInstr} onChange={(e) => setAnchorInstr(e.target.value)} placeholder="앵커 수정 지시..." className="text-xs resize-none min-h-[40px] flex-1" rows={2} />
                <Button onClick={() => handleGenAnchor(anchorInstr)} disabled={genAnchor || !anchorInstr.trim()} variant="outline" size="sm" className="shrink-0 self-end">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* 나머지 프레임 생성 */}
          {frameRole !== 'middle' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button onClick={() => handleGenOther()} disabled={genOther || !hasAnchor || !otherFramePrompt} variant={hasOther ? 'outline' : 'default'} size="sm" className="flex-1">
                  {genOther
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
                    : <><ImageIcon className="h-3.5 w-3.5 mr-1.5" />{hasOther ? '나머지 재생성' : `② ${frameRole === 'start' ? '끝' : '시작'} 프레임 생성`}</>}
                </Button>
              </div>
              {hasOther && otherUrl && (
                <div className="flex gap-2">
                  <Textarea value={otherInstr} onChange={(e) => setOtherInstr(e.target.value)} placeholder="나머지 프레임 수정 지시..." className="text-xs resize-none min-h-[40px] flex-1" rows={2} />
                  <Button onClick={() => handleGenOther(otherInstr)} disabled={genOther || !otherInstr.trim()} variant="outline" size="sm" className="shrink-0 self-end">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 구분선 */}
          <div className="border-t" />

          {/* 영상 프롬프트 */}
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-blue-600">영상 프롬프트 (한국어)</Label>
                <CopyBtn text={videoPromptKo} id="vko" copied={copied} onCopy={handleCopy} />
              </div>
              <Textarea value={videoPromptKo} onChange={(e) => { setVideoPromptKo(e.target.value); save('video_prompt_ko', e.target.value); }} placeholder="한국어 영상 설명..." className="text-xs resize-none min-h-[60px] border-blue-200 focus-visible:ring-blue-300" rows={3} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">영상 프롬프트 (영어)</Label>
                <CopyBtn text={videoPromptEn} id="ven" copied={copied} onCopy={handleCopy} />
              </div>
              <Textarea value={videoPromptEn} onChange={(e) => { setVideoPromptEn(e.target.value); save('video_prompt', e.target.value); }} placeholder="Anime style, Korean webtoon aesthetic..." className="text-xs font-mono resize-none min-h-[72px]" rows={3} />
            </div>

            {/* 프롬프트 수정 */}
            <div className="flex gap-2">
              <Textarea value={videoInstr} onChange={(e) => setVideoInstr(e.target.value)} placeholder="프롬프트 수정 지시..." className="text-xs resize-none min-h-[40px] flex-1" rows={2} />
              <div className="flex flex-col gap-1 shrink-0">
                <Button onClick={handleRefinePrompt} disabled={refining || !videoInstr.trim()} variant="outline" size="sm" title="프롬프트만 개선">
                  {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                </Button>
                <Button onClick={async () => { const ok = await handleRefinePrompt(); if (ok) handleGenVideo(); }} disabled={refining || genVideo || !videoInstr.trim() || !canVideo} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" title="개선+생성">
                  {refining || genVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>

          {/* 영상 생성 */}
          <Button onClick={handleGenVideo} disabled={genVideo || !canVideo || !videoPromptEn} className="w-full bg-violet-600 hover:bg-violet-700 text-white" size="sm">
            {genVideo
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Wan 2.2 렌더링 중... (~60초)</>
              : <><Film className="h-3.5 w-3.5 mr-1.5" />③ 영상 생성 (5090 PC)</>}
          </Button>

          {videoUrl && !genVideo && (
            <button onClick={handleGenVideo} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 w-full justify-center">
              <RefreshCw className="h-3 w-3" /> 영상 재생성
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
