/**
 * 괴수 스타일 생성기 - 메인 엔트리포인트
 *
 * 새로운 스타일을 추가하려면:
 * 1. lib/monster-styles/styles/[new-style].ts 파일 생성
 * 2. MonsterStyleGenerator 상속하여 구현
 * 3. 아래 STYLE_REGISTRY에 등록
 * 4. getAvailableStyles()에 UI 정보 추가
 */

import { MonsterStyle, StyleMetadata, SelectedCreature } from './types';
import { MonsterStyleGenerator } from './base';
import { NormalStyleGenerator } from './styles/normal';
import { JJKStyleGenerator } from './styles/jjk';
import { HiganjimaStyleGenerator } from './styles/higanjima';

// ============================================================
// 스타일 레지스트리
// 새로운 스타일 추가 시 여기에 등록하면 됩니다.
// ============================================================

type StyleGeneratorConstructor = new (
  creatures: SelectedCreature[],
  humanPart?: string
) => MonsterStyleGenerator;

const STYLE_REGISTRY: Record<MonsterStyle, StyleGeneratorConstructor> = {
  normal: NormalStyleGenerator,
  jjk: JJKStyleGenerator,
  higanjima: HiganjimaStyleGenerator,
  // 새 스타일 추가 예시:
  // berserk: BerserkStyleGenerator,
  // darksouls: DarkSoulsStyleGenerator,
};

// ============================================================
// 팩토리 함수
// ============================================================

/**
 * 스타일에 맞는 생성기 인스턴스 생성
 */
export function createStyleGenerator(
  style: MonsterStyle,
  creatures: SelectedCreature[],
  humanPart?: string
): MonsterStyleGenerator {
  const GeneratorClass = STYLE_REGISTRY[style];
  if (!GeneratorClass) {
    console.warn(`[Monster Styles] Unknown style: ${style}, falling back to 'normal'`);
    return new NormalStyleGenerator(creatures, humanPart);
  }
  return new GeneratorClass(creatures, humanPart);
}

/**
 * 스타일이 유효한지 확인
 */
export function isValidStyle(style: string): style is MonsterStyle {
  return style in STYLE_REGISTRY;
}

/**
 * 사용 가능한 모든 스타일 목록 반환 (프론트엔드 UI용)
 */
export function getAvailableStyles(): StyleMetadata[] {
  // 각 스타일의 메타데이터를 임시 인스턴스에서 가져옴
  const styles: StyleMetadata[] = [];

  for (const styleId of Object.keys(STYLE_REGISTRY) as MonsterStyle[]) {
    const GeneratorClass = STYLE_REGISTRY[styleId];
    // 임시 인스턴스 생성 (메타데이터만 추출)
    const tempInstance = new GeneratorClass([], undefined);
    styles.push({
      id: tempInstance.styleId,
      name: tempInstance.styleName,
      description: tempInstance.styleDescription,
      icon: tempInstance.styleIcon,
    });
  }

  return styles;
}

/**
 * 특정 스타일의 메타데이터 반환
 */
export function getStyleMetadata(style: MonsterStyle): StyleMetadata | null {
  const GeneratorClass = STYLE_REGISTRY[style];
  if (!GeneratorClass) return null;

  const tempInstance = new GeneratorClass([], undefined);
  return {
    id: tempInstance.styleId,
    name: tempInstance.styleName,
    description: tempInstance.styleDescription,
    icon: tempInstance.styleIcon,
  };
}

// ============================================================
// Re-exports
// ============================================================

// 타입 및 인터페이스
export * from './types';

// 베이스 클래스 (새 스타일 구현 시 필요)
export { MonsterStyleGenerator } from './base';

// 생물 데이터 및 유틸리티
export {
  CREATURE_CATEGORIES,
  HUMAN_BODY_PARTS,
  FACIAL_PARTS,
  selectRandomCreatures,
  selectHumanBodyPart,
  getRandomItem,
  shuffleArray,
} from './creatures';

// 개별 스타일 생성기 (직접 사용 시)
export { NormalStyleGenerator } from './styles/normal';
export { JJKStyleGenerator } from './styles/jjk';
export { HiganjimaStyleGenerator } from './styles/higanjima';
