'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Check,
  RefreshCcw,
  FileText,
  Sparkles,
  Download,
  Eye,
  Image as ImageIcon,
} from 'lucide-react';
import { GridSize, VideoMode, VideoScript, ShortsScene, GRID_CONFIGS, getSceneCount } from './types';

interface PanelCardsGridProps {
  gridSize: GridSize;
  videoMode: VideoMode;
  videoScript: VideoScript | null;
  scenes: ShortsScene[];
  gridImagePath: string | null;
  generatingScript: boolean;
  generatingGrid: boolean;
  loadingImagePrompt: boolean;
  geminiModel: string;
  imageStyle: 'realistic' | 'cartoon';
  onGeminiModelChange: (model: string) => void;
  onImageStyleChange: (style: 'realistic' | 'cartoon') => void;
  onGenerateScript: () => void;
  onGenerateGrid: () => void;
  onPreviewImagePrompt: () => void;
}

export function PanelCardsGrid({
  gridSize,
  videoMode,
  videoScript,
  scenes,
  gridImagePath,
  generatingScript,
  generatingGrid,
  loadingImagePrompt,
  geminiModel,
  imageStyle,
  onGeminiModelChange,
  onImageStyleChange,
  onGenerateScript,
  onGenerateGrid,
  onPreviewImagePrompt,
}: PanelCardsGridProps) {
  const panelCount = GRID_CONFIGS[gridSize].panelCount;
  const sceneCount = getSceneCount(gridSize, videoMode);

  // 패널 이미지들을 scenes에서 추출
  const getPanelImages = (): string[] => {
    const sortedScenes = [...scenes].sort((a, b) => a.scene_index - b.scene_index);
    const allPanels: string[] = [];
    sortedScenes.forEach((scene, idx) => {
      if (scene.start_panel_path && !allPanels.includes(scene.start_panel_path)) {
        allPanels.push(scene.start_panel_path);
      }
      if (idx === sortedScenes.length - 1 && scene.end_panel_path) {
        allPanels.push(scene.end_panel_path);
      }
    });
    return allPanels;
  };

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
      window.open(url, '_blank');
    }
  };

  const panelImages = getPanelImages();

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium">컷 생성</h3>
        </div>
        <div className="flex items-center gap-2">
          <Select value={geminiModel} onValueChange={onGeminiModelChange} disabled={generatingScript}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="모델 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
              <SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
              <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
              <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash</SelectItem>
              <SelectItem value="gemini-3-pro-preview">Gemini 3 Pro</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={onGenerateScript}
            disabled={generatingScript}
            size="sm"
            variant={videoScript?.panels?.length ? 'outline' : 'default'}
          >
            {generatingScript ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                생성 중...
              </>
            ) : videoScript?.panels?.length ? (
              <>
                <RefreshCcw className="h-4 w-4 mr-2" />
                컷 분석
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                컷 분석
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 패널 설명들 (컷 설명 생성 후 바로 표시) */}
      {videoScript?.panels && videoScript.panels.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-3">패널별 묘사</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {videoScript.panels.map((panel, idx) => (
              <div key={panel.panelIndex} className="p-3 bg-muted/50 rounded border">
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground">패널 {idx + 1}</span>
                  {panel.characters && panel.characters.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      👤 {panel.characters.join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                  {panel.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 이미지 생성 컨트롤 (만화풍/실사풍, 프롬프트보기, 재생성) */}
      {videoScript?.panels && videoScript.panels.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Select
            value={imageStyle}
            onValueChange={(value: 'realistic' | 'cartoon') => onImageStyleChange(value)}
            disabled={generatingGrid}
          >
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="realistic">실사풍</SelectItem>
              <SelectItem value="cartoon">만화풍</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={onPreviewImagePrompt}
            disabled={generatingGrid || loadingImagePrompt}
          >
            {loadingImagePrompt ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          <Button
            onClick={onGenerateGrid}
            disabled={generatingGrid}
            size="sm"
            variant={gridImagePath ? 'outline' : 'default'}
          >
            {generatingGrid ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                생성 중...
              </>
            ) : gridImagePath ? (
              <>
                <RefreshCcw className="h-4 w-4 mr-2" />
                컷 이미지 생성
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                컷 이미지 생성
              </>
            )}
          </Button>
        </div>
      )}

      {/* 패널 카드 그리드 */}
      {videoScript?.panels && videoScript.panels.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {videoScript.panels.map((panel, idx) => {
            const panelImage = panelImages[idx];
            const sceneInfo = videoScript.scenes.find(s => s.startPanelIndex === idx);
            
            return (
              <Card key={panel.panelIndex} className="overflow-hidden group relative">
                {/* 패널 이미지 또는 플레이스홀더 */}
                {panelImage ? (
                  <div className="relative">
                    <img
                      src={panelImage}
                      alt={`패널 ${idx + 1}`}
                      className="w-full aspect-[9/16] object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownload(panelImage, `panel-${idx + 1}.png`)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        다운로드
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-[9/16] bg-muted flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                
                {/* 패널 번호 */}
                <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  {idx + 1}
                </div>
                
                {/* 영상 길이 표시 */}
                {sceneInfo && (
                  <div className="absolute top-2 right-2 bg-primary/90 text-white text-xs px-2 py-1 rounded">
                    {sceneInfo.duration || 4}초
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* 전체 그리드 이미지 다운로드 */}
      {gridImagePath && (
        <div className="flex justify-end mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload(gridImagePath, `grid-${gridSize}.png`)}
          >
            <Download className="h-4 w-4 mr-2" />
            전체 그리드 이미지 다운로드
          </Button>
        </div>
      )}
    </Card>
  );
}

