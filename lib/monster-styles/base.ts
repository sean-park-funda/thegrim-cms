/**
 * 괴수 스타일 생성기 - 추상 베이스 클래스
 */

import { SelectedCreature, DesignElement, MonsterStyle, SectionCreatureResult, BodySection, SECTION_NAMES } from './types';
import { shuffleArray, SECTION_DESCRIPTIONS, HUMAN_TYPES, getCreatureById } from './creatures';
import type { MonsterV2Request, SectionSelection, HumanType } from './types';

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

  // ============================================================
  // V2 괴수 생성기 메서드
  // ============================================================

  /** V2 프롬프트 본문 생성 (각 스타일별로 오버라이드 가능) */
  protected buildPromptBodyV2(
    sectionResults: SectionCreatureResult[],
    allowVariant: boolean,
    selectedElements: DesignElement[]
  ): string {
    // 기본 구현 - 서브클래스에서 오버라이드 가능
    const elementsList = this.formatDesignElements(selectedElements);
    const sectionsText = this.formatSectionResults(sectionResults);
    const variantText = allowVariant ? '\n- **변종 허용:** 선택된 요소들의 변형 및 돌연변이 가능' : '';
    const humanInstructions = this.formatHumanInstructions(sectionResults);
    
    return `당신은 '다크 판타지 크리처 컨셉 아티스트'이자 '전문 프롬프트 엔지니어'입니다.
아래에 **신체 섹션별로 지정된 요소들**을 사용하여 괴수 디자인을 생성하세요:

**신체 섹션별 구성:**
${sectionsText}${variantText}${humanInstructions}

지정된 요소들의 특징을 창의적으로 결합하여, 정교한 흑백 펜화 일러스트를 생성하기 위한 **영어 이미지 프롬프트**를 작성해 주세요.

### 작성 규칙:
1. **화풍:** 정교한 펜 선, **라인드로잉(line drawing)만 사용**, 톤(tone)이나 해칭(hatching) 없음, 압도적인 디테일, 흑백(Monochrome), 글씨 금지(Textless).

2. **표현:** '단순한 결합'을 넘어 생물학적으로 불쾌한 변형(Body Horror)을 묘사할 것.

3. **이번에 강조할 기괴함 유형:**
${elementsList}

4. **구도:**
   - **배경 없음:** 단색 배경(흰색 또는 검은색)만 사용
   - **전신 표시:** 괴수의 머리부터 발끝까지 전체가 보이도록 전신 샷(full body shot)
   - **중앙 배치:** 괴수가 이미지 중앙에 위치하도록 구성

5. **이미지 비율:** 괴수의 형태에 맞는 적절한 비율 선택 (9:16, 1:1, 16:9)

**중요:** 응답은 반드시 유효한 JSON 형식으로 작성해주세요:
\`\`\`json
{
  "imagePrompt": "실제 생성에 사용할 상세한 영어 프롬프트. 부정 프롬프트 파라미터 --no text, background, scenery 포함",
  "aspectRatio": "9:16 또는 1:1 또는 16:9 중 하나"
}
\`\`\`

지금 바로 1개의 **독창적인** 괴수 디자인을 생성하고 JSON 형식으로 응답해 주세요.`;
  }

  /**
   * V2 요청에서 섹션 결과 추출
   */
  protected parseSectionSelections(request: MonsterV2Request): SectionCreatureResult[] {
    const results: SectionCreatureResult[] = [];
    const sections: BodySection[] = ['face', 'torso', 'limbs', 'other'];

    for (const section of sections) {
      const selection = request[section] as SectionSelection;
      if (selection.type === 'none') continue;

      const sectionInfo = SECTION_DESCRIPTIONS[section];

      if (selection.type === 'human' && selection.humanType) {
        const humanInfo = HUMAN_TYPES[selection.humanType];
        results.push({
          section,
          sectionName: sectionInfo.name,
          type: 'human',
          name: humanInfo.nameEn,
          description: humanInfo.description,
          humanType: selection.humanType,
        });
      } else if (selection.type === 'creature' && selection.creatureId) {
        const creature = getCreatureById(selection.creatureId);
        if (creature) {
          results.push({
            section,
            sectionName: sectionInfo.name,
            type: 'creature',
            name: creature.name,
            description: creature.description,
          });
        }
      }
    }

    return results;
  }

  /**
   * 섹션 결과를 포맷팅된 문자열로 반환
   */
  protected formatSectionResults(results: SectionCreatureResult[]): string {
    if (results.length === 0) {
      return '(지정된 요소 없음 - 랜덤 생성)';
    }

    return results.map((result, idx) => {
      const typeLabel = result.type === 'human' ? '인체' : '생물';
      let descPart = result.description ? ` - ${result.description}` : '';
      
      // 인체 선택 시 타입 정보 추가
      if (result.type === 'human' && result.humanType) {
        const humanInfo = HUMAN_TYPES[result.humanType];
        descPart = ` - ${humanInfo.name} (${humanInfo.description})`;
      }
      
      return `${idx + 1}. **${result.sectionName} (${SECTION_DESCRIPTIONS[result.section].promptHint}):** [${typeLabel}] ${result.name}${descPart}`;
    }).join('\n');
  }

  /**
   * 인체 관련 지시사항 생성
   */
  protected formatHumanInstructions(results: SectionCreatureResult[]): string {
    const humanSections = results.filter(r => r.type === 'human');
    if (humanSections.length === 0) return '';

    const hasWoman = humanSections.some(r => r.humanType === 'woman');
    const hasMan = humanSections.some(r => r.humanType === 'man');
    const hasChild = humanSections.some(r => r.humanType === 'child');

    const instructions: string[] = [];

    instructions.push('- **인체 표현:** 모든 인체 부위는 **나체(nude, naked, no clothing)**로 표현해야 합니다. 옷이나 의류는 절대 포함하지 마세요.');

    if (hasWoman) {
      instructions.push('- **여성 신체 표현:** 여성 인체 부위는 **우아하고 아름다운(elegant, graceful, beautiful, feminine curves, natural proportions)** 방식으로 표현하세요. 자연스러운 곡선과 균형잡힌 신체 비율을 유지하되, 기괴한 변형과 조화롭게 결합하세요.');
    }

    if (hasMan) {
      instructions.push('- **남성 신체 표현:** 남성 인체 부위는 근육질이고 강인한(muscular, strong, powerful) 방식으로 표현하세요.');
    }

    if (hasChild) {
      instructions.push('- **아이 신체 표현:** 아이 인체 부위는 작고 유아적인(small, childlike, infantile) 방식으로 표현하세요.');
    }

    return '\n\n**인체 표현 지시사항:**\n' + instructions.join('\n');
  }

  /**
   * V2 프롬프트 생성
   */
  public generatePromptV2(request: MonsterV2Request): string {
    const sectionResults = this.parseSectionSelections(request);
    const selectedElements = this.selectRandomDesignElements();
    const allowVariant = request.allowVariant ?? false;

    return this.buildPromptBodyV2(sectionResults, allowVariant, selectedElements);
  }
}
