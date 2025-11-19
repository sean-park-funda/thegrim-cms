// 이미지 재생성 스타일 옵션
export const styleOptions = [
  { id: 'berserk', name: '괴수디테일', prompt: 'Redraw this image in Berserk manga style with dense lines, adding detailed monster (괴수) or creature features. Even if the original is a rough sketch or simple drawing, enhance and transform it into a detailed monster with intricate details' },
  { id: 'grayscale', name: '채색 빼기(흑백으로 만들기)', prompt: 'Remove the color from this image and convert it to grayscale' },
  { id: 'remove-background', name: '배경 지우기', prompt: 'Remove the background from this image and make it transparent' },
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

// 프롬프트 변형 생성 함수
export function generateVariedPrompt(basePrompt: string, styleId: string): string {
  // 베르세르크 스타일인 경우에만 변형 적용
  if (styleId !== 'berserk') {
    return basePrompt;
  }

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

  return basePrompt;
}

