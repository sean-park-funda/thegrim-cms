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

// ============================================================
// V2 괴수 생성기 타입 정의
// ============================================================

// 신체 섹션 타입
export type BodySection = 'face' | 'torso' | 'limbs' | 'other';

// 인체 타입
export type HumanType = 'man' | 'woman' | 'child';

// 섹션 선택 옵션
export interface SectionSelection {
  type: 'creature' | 'human' | 'none';
  creatureId?: string;      // 생물 선택 시 (카테고리:인덱스 형식)
  humanType?: HumanType;    // 인체 선택 시
}

// v2 요청 타입
export interface MonsterV2Request {
  face: SectionSelection;
  torso: SectionSelection;
  limbs: SectionSelection;
  other: SectionSelection;
  style: MonsterStyle;
  allowVariant?: boolean;  // 변종 허용 여부
}

// v2에서 사용하는 섹션별 선택 결과
export interface SectionCreatureResult {
  section: BodySection;
  sectionName: string;
  type: 'creature' | 'human';
  name: string;
  description: string;
  humanType?: HumanType; // 인체 선택 시 타입 정보
}

// 섹션 한글 이름 매핑
export const SECTION_NAMES: Record<BodySection, string> = {
  face: '얼굴',
  torso: '몸통',
  limbs: '팔다리',
  other: '기타',
};
