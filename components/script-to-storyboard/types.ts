/**
 * ScriptToStoryboard 컴포넌트 관련 타입 정의
 */

export interface Cut {
  cutNumber: number;
  title: string;
  background?: string;
  description: string;
  dialogue?: string;
  // 이 컷에 등장하는 모든 인물 이름 (대사가 없는 캐릭터도 포함)
  charactersInCut?: string[];
  // 관련배경 목록
  relatedBackgrounds?: Array<{ cutNumber: number; background: string }>;
}

export interface StoryboardImage {
  id: string;
  storyboard_id: string;
  cut_index: number;
  mime_type: string;
  image_base64: string;
}

export interface Storyboard {
  id: string;
  model?: string | null;
  response_json: { cuts?: Cut[] };
  created_at: string;
  images?: StoryboardImage[];
}

export interface Script {
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

export interface CharacterAnalysisData {
  characters: Array<{
    name: string;
    description: string;
    existsInDb: boolean;
    characterId: string | null;
    characterSheets: Array<{ id: string; file_path: string; thumbnail_path?: string | null }>;
  }>;
  webtoonId: string;
}

export interface PreviewImageData {
  imageUrl: string;
  imageData: string;
  mimeType: string;
  scriptId: string;
  characterIndex: number;
  characterName: string;
  characterDescription: string;
  webtoonId: string;
  characterId: string | null;
}

export interface DirectEditValues {
  title: string;
  background: string;
  description: string;
  dialogue: string;
  charactersInCut: string;
}

export interface EditingCut {
  storyboardId: string;
  cutIndex: number;
  cut: Cut;
}

// 야콘티 관련 상수
export const YAKONTI_STYLE_PREFIX = '(completely naked:1.5), (nude:1.5), (monochrome:1.4), (greyscale:1.3), (black and white:1.3), (ink drawing:1.3), (manga style:1.3), pen and ink, lineart, rough sketch style, ';

export const YAKONTI_NEGATIVE_PROMPT = 'color:1.5), (colors:1.5), (colorful:1.5), (chromatic:1.5), rgb, watercolor, oil painting, (clothes:1.5), (clothing:1.5),(female genitalia on male:1.5), (vagina on man:1.5), hermaphrodite, futanari, gender swap, feminine features on man, (fused bodies:1.4), (bad anatomy:1.3), bad hands, missing fingers, extra digits, extra limbs, extra legs, extra arms, mutated, deformed, disfigured, blurry, low quality, worst quality, text, watermark, error, cropped, ugly, duplicate,  fabric, costume, wearing clothes, swimsuit, underwear, lingerie, bra, panties';

export const YAKONTI_WORKFLOW_NAME = 'Qwen Image Edit Rapid api v2.json';
