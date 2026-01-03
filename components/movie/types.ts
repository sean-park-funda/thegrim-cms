export type GridSize = '2x2' | '3x3';
export type VideoMode = 'cut-to-cut' | 'per-cut';

export interface GridConfig {
  rows: number;
  cols: number;
  panelCount: number;
  sceneCount: Record<VideoMode, number>;
}

export const GRID_CONFIGS: Record<GridSize, GridConfig> = {
  '2x2': { rows: 2, cols: 2, panelCount: 4, sceneCount: { 'cut-to-cut': 3, 'per-cut': 4 } },
  '3x3': { rows: 3, cols: 3, panelCount: 9, sceneCount: { 'cut-to-cut': 8, 'per-cut': 9 } },
};

export function getSceneCount(gridSize: GridSize, videoMode: VideoMode): number {
  return GRID_CONFIGS[gridSize].sceneCount[videoMode];
}

export interface PanelDescription {
  panelIndex: number;
  description: string; // 이미지 생성용 프롬프트 (한글, 장면 묘사 + 연출/구도 포함)
  characters: string[]; // 등장인물
}

export interface VideoScene {
  sceneIndex: number;
  startPanelIndex: number;
  endPanelIndex: number;
  motionDescription: string;
  dialogue: string;
  veoPrompt: string;
  duration: number;
}

export interface VideoScript {
  panels: PanelDescription[];
  scenes: VideoScene[];
  totalDuration: number;
  style: string;
}

export interface MovieScene {
  id: string;
  scene_index: number;
  start_panel_path: string | null;
  end_panel_path: string | null;
  video_prompt: string | null;
  duration: number | null;
  video_path: string | null;
  status: string;
  error_message: string | null;
}
