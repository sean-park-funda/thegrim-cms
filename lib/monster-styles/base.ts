/**
 * 괴수 스타일 생성기 - 추상 베이스 클래스
 */

import { SelectedCreature, DesignElement, MonsterStyle } from './types';
import { shuffleArray } from './creatures';

/**
 * 모든 괴수 스타일 생성기의 베이스 클래스
 * 각 스타일은 이 클래스를 상속받아 구현해야 합니다.
 */
export abstract class MonsterStyleGenerator {
  protected creatures: SelectedCreature[];
  protected humanPart?: string;

  constructor(creatures: SelectedCreature[], humanPart?: string) {
    this.creatures = creatures;
    this.humanPart = humanPart;
  }

  // ============================================================
  // 추상 메서드 - 각 스타일에서 반드시 구현해야 함
  // ============================================================

  /** 스타일 ID */
  abstract get styleId(): MonsterStyle;

  /** 스타일 이름 (한글) */
  abstract get styleName(): string;

  /** 스타일 설명 (한글) */
  abstract get styleDescription(): string;

  /** 스타일 아이콘 (이모지) */
  abstract get styleIcon(): string;

  /** 인간 요소 포함 확률 (0.0 ~ 1.0) */
  abstract get includeHumanProbability(): number;

  /** 유효한 이미지 비율 목록 */
  abstract getValidAspectRatios(): string[];

  /** 디자인 요소 목록 반환 */
  protected abstract getDesignElements(): DesignElement[];

  /** 프롬프트 본문 생성 (각 스타일별로 다름) */
  protected abstract buildPromptBody(
    creaturesList: string,
    humanPartText: string,
    selectedElements: DesignElement[]
  ): string;

  // ============================================================
  // 공통 메서드 - 모든 스타일에서 공유
  // ============================================================

  /**
   * 선택된 생물 목록을 포맷팅된 문자열로 반환
   */
  protected formatCreaturesList(): string {
    return this.creatures.map((sc, idx) =>
      `${idx + 1}. **${sc.category}:** ${sc.creature.name} - ${sc.creature.description}`
    ).join('\n');
  }

  /**
   * 인간 신체 요소 텍스트 반환
   */
  protected formatHumanPart(): string {
    if (!this.humanPart) return '';
    return `\n${this.creatures.length + 1}. **인간의 신체 요소:** ${this.humanPart}`;
  }

  /**
   * 디자인 요소 중 랜덤으로 2~3개 선택
   */
  protected selectRandomDesignElements(): DesignElement[] {
    const elements = this.getDesignElements();
    const shuffled = shuffleArray(elements);
    const count = 2 + Math.floor(Math.random() * 2); // 2 또는 3
    return shuffled.slice(0, count);
  }

  /**
   * 선택된 디자인 요소를 포맷팅된 문자열로 반환
   */
  protected formatDesignElements(elements: DesignElement[]): string {
    return elements.map((el, idx) =>
      `   ${idx + 1}. **${el.name}:** ${el.description} (예: ${el.examples})`
    ).join('\n');
  }

  /**
   * 최종 프롬프트 생성
   */
  public generatePrompt(): string {
    const creaturesList = this.formatCreaturesList();
    const humanPartText = this.formatHumanPart();
    const selectedElements = this.selectRandomDesignElements();

    return this.buildPromptBody(creaturesList, humanPartText, selectedElements);
  }

  /**
   * 인간 요소 포함 여부 결정
   */
  public shouldIncludeHuman(): boolean {
    return Math.random() < this.includeHumanProbability;
  }
}
