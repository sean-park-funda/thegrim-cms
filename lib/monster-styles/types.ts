/**
 * 괴수 스타일 생성기 - 타입 정의
 */

// 사용 가능한 스타일 목록
export type MonsterStyle = 'normal' | 'jjk' | 'higanjima';

// 생물 정보
export interface Creature {
  name: string;
  description: string;
}

// 선택된 생물 (카테고리 포함)
export interface SelectedCreature {
  category: string;
  creature: Creature;
}

// 디자인 요소 (기괴함 유형, 저주 요소 등)
export interface DesignElement {
  name: string;
  description: string;
  examples: string;
}

// 프롬프트 생성 결과
export interface PromptResult {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string;
}

// 스타일 메타데이터 (프론트엔드 UI용)
export interface StyleMetadata {
  id: MonsterStyle;
  name: string;
  description: string;
  icon: string;
}

// 카테고리별 생물 목록 타입
export type CreatureCategory = 'arthropods' | 'deepSea' | 'reptiles' | 'birdsMammals' | 'parasites';

export interface CreatureCategories {
  arthropods: Creature[];
  deepSea: Creature[];
  reptiles: Creature[];
  birdsMammals: Creature[];
  parasites: Creature[];
}

// 카테고리 한글 이름 매핑
export const CATEGORY_NAMES: Record<CreatureCategory, string> = {
  arthropods: '절지동물',
  deepSea: '심해생물',
  reptiles: '파충류',
  birdsMammals: '조류/포유류',
  parasites: '기생충',
};
