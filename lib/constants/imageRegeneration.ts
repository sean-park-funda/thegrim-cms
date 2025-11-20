// API 제공자 타입
export type ApiProvider = 'gemini' | 'seedream' | 'auto';

// 이미지 재생성 스타일 옵션
export const styleOptions = [
  { 
    id: 'berserk', 
    name: '괴수디테일', 
    prompt: 'Redraw this image in Berserk manga style with dense lines',
    defaultCount: 2, // 기본 생성 개수
    allowMultiple: true, // 여러 장 생성 가능
    apiProvider: 'auto' as ApiProvider, // auto: 홀수는 Gemini, 짝수는 Seedream
  },
  { 
    id: 'grayscale', 
    name: '채색 빼기(흑백으로 만들기)', 
    prompt: 'Remove the color from this image and convert it to grayscale',
    defaultCount: 1, // 기본 생성 개수
    allowMultiple: false, // 여러 장 생성 불가
    apiProvider: 'seedream' as ApiProvider, // Seedream만 사용
  },
  { 
    id: 'remove-background', 
    name: '배경 지우기', 
    prompt: 'Remove the background from this image and make it transparent',
    defaultCount: 1, // 기본 생성 개수
    allowMultiple: false, // 여러 장 생성 불가
    apiProvider: 'seedream' as ApiProvider, // Seedream만 사용
  },
  { 
    id: 'shading', 
    name: '극적 명암', 
    prompt: 'Preserve the original line art completely, keep all original lines intact, add dramatic shading and chiaroscuro lighting only, high contrast shadows and highlights, heavy black ink shading, deep shadows, monochromatic screentones, maintain original linework structure, professional seinen manga style, dark fantasy aesthetic, inspired by Kentaro Miura',
    defaultCount: 2, // 기본 생성 개수
    allowMultiple: true, // 여러 장 생성 가능
    apiProvider: 'auto' as ApiProvider, // Gemini만 사용
  },
  { 
    id: 'manga-shading', 
    name: '만화풍 명암', 
    prompt: 'Add high-quality Japanese manga-style shading and black-and-white coloring to this sketch. Include detailed shadows cast by hair onto the face, such as shadows from bangs on the forehead, shadows from hair strands on the cheeks and temples, and shadows from hair falling onto the shoulders and neck. Add subtle hair shadow details to enhance the three-dimensional appearance.',
    defaultCount: 2, // 기본 생성 개수
    allowMultiple: true, // 여러 장 생성 가능
    apiProvider: 'auto' as ApiProvider, // auto: 홀수는 Gemini, 짝수는 Seedream
  },
  { 
    id: 'line-art-only', 
    name: '선화만 남기기', 
    prompt: 'Remove all colors, shading, shadows, highlights, and tones from this image. Extract only the clean line art. Keep only the pure black lines on white background. Remove all grayscale areas, screentones, hatching, cross-hatching, and any shading effects. The output should be a clean line drawing with no colors, no shading, no shadows, and no tones - only pure black lines defining the shapes and forms.',
    defaultCount: 1, // 기본 생성 개수
    allowMultiple: false, // 여러 장 생성 불가
    apiProvider: 'seedream' as ApiProvider, // Seedream만 사용
  },
];

// 베르세르크 스타일 변형 키워드
export const berserkVariationKeywords = {
  lighting: [
    'extreme chiaroscuro',
    'dramatic lighting',
    'high contrast',
    'deep shadows',
    'intense highlights',
  ],
  detail: [
    'highly detailed',
    'intricate details',
    'fine linework',
    'meticulous rendering',
    'precise linework',
  ],
  hatching: [
    'cross-hatching',
    'dense cross-hatching',
    'fine hatching',
    'hatching techniques',
    'intricate hatching',
  ],
  linework: [
    'tight linework',
    'precise lines',
    'intricate linework',
    'fine lines',
  ],
  tone: [
    'dark tones',
    'moody atmosphere',
    'gritty texture',
    'atmospheric depth',
  ],
};

// 극적 명암 스타일 변형 키워드
export const shadingVariationKeywords = {
  shading: [
    'extreme chiaroscuro',
    'dramatic chiaroscuro',
    'intense chiaroscuro',
    'heavy chiaroscuro',
    'strong chiaroscuro',
  ],
  shadows: [
    'deep shadows',
    'intense shadows',
    'dramatic shadows',
    'heavy shadows',
    'profound shadows',
  ],
  highlights: [
    'intense highlights',
    'dramatic highlights',
    'sharp highlights',
    'bright highlights',
    'stark highlights',
  ],
  contrast: [
    'extreme contrast',
    'high contrast',
    'maximum contrast',
    'stark contrast',
    'dramatic contrast',
  ],
  screentones: [
    'monochromatic screentones',
    'dense screentones',
    'intricate screentones',
    'fine screentones',
    'detailed screentones',
  ],
  ink: [
    'heavy black ink',
    'dense black ink',
    'thick black ink',
    'rich black ink',
    'intense black ink',
  ],
};

// 프롬프트 변형 생성 함수
export function generateVariedPrompt(basePrompt: string, styleId: string): string {
  // 스타일별 variation 키워드 선택
  if (styleId === 'berserk') {
    // 랜덤하게 2-3개의 키워드 선택
    const numKeywords = 2 + Math.floor(Math.random() * 2); // 2 또는 3
    const selectedKeywords: string[] = [];

    // 각 카테고리에서 최대 1개씩 선택
    const categories = Object.keys(berserkVariationKeywords) as Array<keyof typeof berserkVariationKeywords>;
    const shuffledCategories = [...categories].sort(() => Math.random() - 0.5);

    for (const category of shuffledCategories) {
      if (selectedKeywords.length >= numKeywords) break;
      
      const keywords = berserkVariationKeywords[category];
      const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
      
      if (!selectedKeywords.includes(randomKeyword)) {
        selectedKeywords.push(randomKeyword);
      }
    }

    // 선택된 키워드를 프롬프트에 추가
    if (selectedKeywords.length > 0) {
      const keywordsString = selectedKeywords.join(', ');
      return `${basePrompt}, ${keywordsString}`;
    }
  } else if (styleId === 'shading') {
    // 랜덤하게 2-3개의 키워드 선택
    const numKeywords = 2 + Math.floor(Math.random() * 2); // 2 또는 3
    const selectedKeywords: string[] = [];

    // 각 카테고리에서 최대 1개씩 선택
    const categories = Object.keys(shadingVariationKeywords) as Array<keyof typeof shadingVariationKeywords>;
    const shuffledCategories = [...categories].sort(() => Math.random() - 0.5);

    for (const category of shuffledCategories) {
      if (selectedKeywords.length >= numKeywords) break;
      
      const keywords = shadingVariationKeywords[category];
      const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
      
      if (!selectedKeywords.includes(randomKeyword)) {
        selectedKeywords.push(randomKeyword);
      }
    }

    // 선택된 키워드를 프롬프트에 추가
    if (selectedKeywords.length > 0) {
      const keywordsString = selectedKeywords.join(', ');
      return `${basePrompt}, ${keywordsString}`;
    }
  }

  // 변형이 지원되지 않는 스타일이거나 키워드 선택 실패
  return basePrompt;
}

