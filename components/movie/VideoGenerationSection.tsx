'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Check,
  Sparkles,
  Download,
  Play,
  Video,
  AlertCircle,
} from 'lucide-react';
import { VideoMode, VideoScript, MovieScene } from './types';

interface VideoGenerationSectionProps {
  videoMode: VideoMode;
  videoScript: VideoScript | null;
  scenes: MovieScene[];
  generatingVideo: number | null;
  generatingAllVideos: boolean;
  veoApiKey: string;
  onShowApiKeyDialog: () => void;
  onGenerateVideo: (sceneIndex: number) => void;
  onGenerateAllVideos: () => void;
  onUpdateSceneDuration: (sceneId: string, duration: number) => void;
}

export function VideoGenerationSection({
  videoMode,
  videoScript,
  scenes,
  generatingVideo,
  generatingAllVideos,
  veoApiKey,
  onShowApiKeyDialog,
  onGenerateVideo,
  onGenerateAllVideos,
  onUpdateSceneDuration,
}: VideoGenerationSectionProps) {
  const isPerCutMode = videoMode === 'per-cut';

  if (!videoScript) {
    return (
      <Card className="p-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Video className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            먼저 컷 설명과 이미지를 생성해주세요.
          </p>
        </div>
      </Card>
    );
  }

  const sortedScenes = [...scenes].sort((a, b) => a.scene_index - b.scene_index);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">영상 생성</CardTitle>
            <CardDescription className="text-xs">
              각 씬을 Veo로 영상화합니다. 생성에는 몇 분이 소요됩니다.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onShowApiKeyDialog}>
              {veoApiKey ? '🔑 커스텀 Key' : 'Veo API Key'}
            </Button>
            <Button
              onClick={onGenerateAllVideos}
              disabled={generatingAllVideos || generatingVideo !== null}
              size="sm"
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
      <CardContent className="space-y-3">
        {sortedScenes.map((scene) => {
          const sceneScript = videoScript.scenes.find(
            (s) => s.sceneIndex === scene.scene_index
          );
          const isGenerating = generatingVideo === scene.scene_index;

          return (
            <Card key={scene.id} className="p-3">
              <div className="flex items-start gap-3">
                {/* 패널 이미지 */}
                <div className="flex gap-1 flex-shrink-0">
                  {scene.start_panel_path && (
                    <img
                      src={scene.start_panel_path}
                      alt={isPerCutMode ? 'Panel' : 'Start'}
                      className="w-12 h-12 object-cover rounded"
                      loading="lazy"
                    />
                  )}
                  {!isPerCutMode && scene.end_panel_path && (
                    <img
                      src={scene.end_panel_path}
                      alt="End"
                      className="w-12 h-12 object-cover rounded"
                      loading="lazy"
                    />
                  )}
                </div>

                {/* 스크립트 정보 */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">
                        {isPerCutMode
                          ? `영상 ${scene.scene_index + 1}`
                          : `씬 ${scene.scene_index + 1}`}
                      </h4>
                      <Select
                        value={String(scene.duration || sceneScript?.duration || 4)}
                        onValueChange={(value) => onUpdateSceneDuration(scene.id, parseInt(value))}
                        disabled={scene.status === 'generating'}
                      >
                        <SelectTrigger className="h-5 w-14 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="4">4초</SelectItem>
                          <SelectItem value="6">6초</SelectItem>
                          <SelectItem value="8">8초</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1">
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

                  {scene.video_prompt && (
                    <div className="text-xs text-muted-foreground">
                      <p className="whitespace-pre-wrap break-words">{scene.video_prompt}</p>
                    </div>
                  )}

                  {scene.error_message && (
                    <p className="text-xs text-destructive">{scene.error_message}</p>
                  )}
                </div>

                {/* 액션 버튼 */}
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {scene.video_path && (
                    <>
                      <a href={scene.video_path} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <Play className="h-3 w-3 mr-1" />
                          재생
                        </Button>
                      </a>
                      <a href={scene.video_path} download>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <Download className="h-3 w-3 mr-1" />
                          다운로드
                        </Button>
                      </a>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onGenerateVideo(scene.scene_index)}
                    disabled={
                      isGenerating ||
                      generatingAllVideos ||
                      (generatingVideo !== null && generatingVideo !== scene.scene_index)
                    }
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        생성 중
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 mr-1" />
                        {scene.video_path ? '재생성' : '생성'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}
