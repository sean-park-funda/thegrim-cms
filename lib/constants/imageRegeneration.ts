// 이미지 재생성 관련 상수
// 스타일 옵션은 DB(ai_regeneration_styles)에서 관리됩니다.
// 이 파일에는 프롬프트 변형을 위한 키워드와 함수만 포함됩니다.

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

