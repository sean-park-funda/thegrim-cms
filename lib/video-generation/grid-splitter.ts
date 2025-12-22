import sharp from 'sharp';

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

/**
 * 그리드 크기와 영상 모드에 따른 씬 개수를 반환합니다.
 */
export function getSceneCount(gridSize: GridSize, videoMode: VideoMode): number {
  return GRID_CONFIGS[gridSize].sceneCount[videoMode];
}

export interface GridPanel {
  index: number;
  row: number;
  col: number;
  base64: string;
  mimeType: string;
}

export interface GridSplitResult {
  panels: GridPanel[];
  originalWidth: number;
  originalHeight: number;
  panelWidth: number;
  panelHeight: number;
  gridSize: GridSize;
}

/**
 * 그리드 이미지를 패널로 분할합니다.
 * 
 * 2x2 Layout (4 panels):
 * | 0 | 1 |
 * | 2 | 3 |
 * 
 * 3x3 Layout (9 panels):
 * | 0 | 1 | 2 |
 * | 3 | 4 | 5 |
 * | 6 | 7 | 8 |
 */
export async function splitGridImage(
  imageBase64: string,
  mimeType: string = 'image/png',
  gridSize: GridSize = '3x3'
): Promise<GridSplitResult> {
  // Base64 데이터 URL prefix 제거
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  // 이미지 메타데이터 가져오기
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  if (!width || !height) {
    throw new Error('이미지 크기를 가져올 수 없습니다.');
  }

  const config = GRID_CONFIGS[gridSize];
  const { rows, cols } = config;
  const panelWidth = Math.floor(width / cols);
  const panelHeight = Math.floor(height / rows);

  const panels: GridPanel[] = [];

  // 각 패널 추출
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const left = col * panelWidth;
      const top = row * panelHeight;

      const panelBuffer = await sharp(imageBuffer)
        .extract({
          left,
          top,
          width: panelWidth,
          height: panelHeight,
        })
        .png()
        .toBuffer();

      panels.push({
        index,
        row,
        col,
        base64: panelBuffer.toString('base64'),
        mimeType: 'image/png',
      });
    }
  }

  return {
    panels,
    originalWidth: width,
    originalHeight: height,
    panelWidth,
    panelHeight,
    gridSize,
  };
}

/**
 * 영상 생성을 위해 패널 페어를 생성합니다. (cut-to-cut 모드)
 * 
 * 2x2 (4 panels): 3개 연속 페어 (0→1), (1→2), (2→3)
 * 3x3 (9 panels): 8개 연속 페어 (0→1), (1→2), ..., (7→8)
 */
export function createPanelPairs(
  panels: GridPanel[],
  gridSize: GridSize = '3x3'
): Array<{
  sceneIndex: number;
  startPanel: GridPanel;
  endPanel: GridPanel;
}> {
  const config = GRID_CONFIGS[gridSize];
  
  if (panels.length !== config.panelCount) {
    throw new Error(`${gridSize} 그리드에는 ${config.panelCount}개의 패널이 필요합니다. 현재: ${panels.length}`);
  }

  const sortedPanels = [...panels].sort((a, b) => a.index - b.index);
  const pairs: Array<{
    sceneIndex: number;
    startPanel: GridPanel;
    endPanel: GridPanel;
  }> = [];

  const sceneCount = config.sceneCount['cut-to-cut'];

  // 연속된 패널 페어 생성
  for (let i = 0; i < sceneCount; i++) {
    pairs.push({
      sceneIndex: i,
      startPanel: sortedPanels[i],
      endPanel: sortedPanels[i + 1],
    });
  }

  return pairs;
}

/**
 * 각 패널별로 개별 씬을 생성합니다. (per-cut 모드)
 * 
 * 2x2 (4 panels): 4개 씬 (패널 0, 1, 2, 3 각각)
 * 3x3 (9 panels): 9개 씬 (패널 0, 1, 2, ..., 8 각각)
 */
export function createPerCutScenes(
  panels: GridPanel[],
  gridSize: GridSize = '3x3'
): Array<{
  sceneIndex: number;
  panel: GridPanel;
}> {
  const config = GRID_CONFIGS[gridSize];
  
  if (panels.length !== config.panelCount) {
    throw new Error(`${gridSize} 그리드에는 ${config.panelCount}개의 패널이 필요합니다. 현재: ${panels.length}`);
  }

  const sortedPanels = [...panels].sort((a, b) => a.index - b.index);
  
  return sortedPanels.map((panel, index) => ({
    sceneIndex: index,
    panel,
  }));
}
