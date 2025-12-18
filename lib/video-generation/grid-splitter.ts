import sharp from 'sharp';

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
}

/**
 * 3x3 그리드 이미지를 9개의 패널로 분할합니다.
 * 패널 순서: 왼쪽에서 오른쪽, 위에서 아래 (0-8)
 * 
 * Layout:
 * | 0 | 1 | 2 |
 * | 3 | 4 | 5 |
 * | 6 | 7 | 8 |
 */
export async function splitGridImage(
  imageBase64: string,
  mimeType: string = 'image/png'
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

  // 3x3 그리드 패널 크기 계산
  const cols = 3;
  const rows = 3;
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
  };
}

/**
 * 영상 생성을 위해 패널 페어를 생성합니다.
 * 9개 패널에서 8개의 연속 페어 생성: (0→1), (1→2), ..., (7→8)
 * 각 영상은 이전 패널에서 다음 패널로의 전환을 표현합니다.
 */
export function createPanelPairs(panels: GridPanel[]): Array<{
  sceneIndex: number;
  startPanel: GridPanel;
  endPanel: GridPanel;
}> {
  if (panels.length !== 9) {
    throw new Error(`9개의 패널이 필요합니다. 현재: ${panels.length}`);
  }

  const sortedPanels = [...panels].sort((a, b) => a.index - b.index);
  const pairs: Array<{
    sceneIndex: number;
    startPanel: GridPanel;
    endPanel: GridPanel;
  }> = [];

  // 연속된 패널 페어 생성 (0→1, 1→2, ..., 7→8)
  for (let i = 0; i < 8; i++) {
    pairs.push({
      sceneIndex: i,
      startPanel: sortedPanels[i],
      endPanel: sortedPanels[i + 1],
    });
  }

  return pairs;
}
