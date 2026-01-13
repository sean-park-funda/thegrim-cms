/**
 * 괴수 스타일 생성기 - 일반 스타일 (흑백 펜화)
 */

import { MonsterStyleGenerator } from '../base';
import { DesignElement, MonsterStyle, SectionCreatureResult } from '../types';
import { SECTION_DESCRIPTIONS } from '../creatures';

/**
 * 일반 스타일 괴수 생성기
 * 정교한 흑백 펜화 스타일의 Body Horror 괴수를 생성합니다.
 */
export class NormalStyleGenerator extends MonsterStyleGenerator {
  // ============================================================
  // 스타일 메타데이터
  // ============================================================

  get styleId(): MonsterStyle {
    return 'normal';
  }

  get styleName(): string {
    return '일반 스타일';
  }

  get styleDescription(): string {
    return '정교한 흑백 펜화';
  }

  get styleIcon(): string {
    return '🖊️';
  }

  get includeHumanProbability(): number {
    return 0.85; // 85% 확률로 인간 요소 포함
  }

  getValidAspectRatios(): string[] {
    return ['9:16', '1:1', '16:9'];
  }

  // ============================================================
  // 디자인 요소
  // ============================================================

  protected getDesignElements(): DesignElement[] {
    return [
      // 형태 관련
      {
        name: '형태 변형',
        description: '신체 비율이 극단적으로 왜곡됨 (거대한 머리에 작은 몸, 비정상적으로 긴 팔다리, 비대칭적 크기)',
        examples: 'grotesquely elongated limbs, disproportionate body parts, asymmetrical growth'
      },
      {
        name: '크기 왜곡',
        description: '일부 부위만 거대하거나 미세함 (거대한 손, 아주 작은 머리)',
        examples: 'oversized hands, tiny head on massive body, enlarged specific features'
      },
      {
        name: '신체 재배치',
        description: '신체 부위가 잘못된 위치에 있음 (등에 손, 무릎에 눈 등)',
        examples: 'misplaced body parts, organs in wrong positions, inverted anatomy'
      },
      {
        name: '동작/자세 공포',
        description: '불가능한 자세나 뒤틀린 관절 (역관절, 180도 회전한 목)',
        examples: 'impossible joint angles, contorted posture, spine bent backwards'
      },
      // 증식 관련
      {
        name: '다중/증식',
        description: '신체 부위가 비정상적으로 많음 (여러 개의 팔, 수십 개의 눈, 무수한 이빨)',
        examples: 'countless eyes scattered across body, too many limbs, multiple mouths'
      },
      {
        name: '군집/떼',
        description: '작은 개체들이 모여 하나의 형태를 이룸 (벌레 떼가 모인 인간형, 이빨이 모인 덩어리)',
        examples: 'swarm forming humanoid shape, mass of teeth, colony organism'
      },
      {
        name: '분열/복제',
        description: '하나의 몸에서 여러 개체가 갈라져 나옴 (쌍둥이가 붙은 몸, 머리가 여러 개)',
        examples: 'conjoined twins, multiple heads splitting from neck, bodies dividing'
      },
      // 융합 관련
      {
        name: '융합/합성',
        description: '여러 생물이 불완전하게 융합됨 (몸 곳곳에서 다른 생물이 튀어나옴, 기생 형태)',
        examples: 'creatures fused together, parasitic growths, organisms emerging from flesh'
      },
      {
        name: '기생/침식',
        description: '외부 생물이 숙주를 잠식함 (피부 아래 움직이는 무언가, 몸을 뚫고 나온 기생체)',
        examples: 'something moving under skin, parasite bursting through, host being consumed'
      },
      {
        name: '식물화',
        description: '살과 식물이 뒤섞임 (피부에서 자라는 균류, 혈관처럼 뻗은 뿌리)',
        examples: 'fungus growing from flesh, roots spreading like veins, moss-covered skin'
      },
      // 부패/질감 관련
      {
        name: '부패/노출',
        description: '내부 구조가 드러남 (뼈, 근육, 내장이 노출, 썩어가는 조직)',
        examples: 'exposed muscles and tendons, visible bone structure, decaying tissue'
      },
      {
        name: '질감 공포',
        description: '불쾌한 표면 질감 (구멍 숭숭, 벌레가 기어다니는 피부, 점액질)',
        examples: 'trypophobic skin texture, slime-covered surface, writhing masses'
      },
      {
        name: '피부 이상',
        description: '피부가 비정상적으로 변형됨 (투명해진 피부, 뒤집힌 피부, 비늘화)',
        examples: 'translucent skin showing organs, inside-out flesh, scaled patches'
      },
      {
        name: '체액 과잉',
        description: '점액, 고름, 타액 등이 과도하게 흘러내림',
        examples: 'dripping slime, oozing pus, excessive drool, weeping wounds'
      },
      // 특수 공포
      {
        name: '태아/성장 이상',
        description: '미완성되거나 과성장한 형태 (태아 같은 몸에 성인 팔다리, 노화된 아기 얼굴)',
        examples: 'fetal body with adult limbs, aged infant face, incomplete development'
      },
      {
        name: '거울/대칭 공포',
        description: '완벽한 대칭이 주는 불쾌함 (정확히 반으로 나뉜 얼굴, 거울상 같은 팔다리)',
        examples: 'perfectly symmetrical face split, mirror-image limbs, uncanny symmetry'
      },
    ];
  }

  // ============================================================
  // 프롬프트 생성
  // ============================================================

  protected buildPromptBody(
    creaturesList: string,
    humanPartText: string,
    selectedElements: DesignElement[]
  ): string {
    const elementsList = this.formatDesignElements(selectedElements);

    return `당신은 '다크 판타지 크리처 컨셉 아티스트'이자 '전문 프롬프트 엔지니어'입니다.
아래에 **이미 선택된 생물들**을 사용하여 괴수 디자인을 생성하세요:

**선택된 생물:**
${creaturesList}${humanPartText}

선택된 생물들의 특징을 창의적으로 결합하여, 정교한 흑백 펜화 일러스트를 생성하기 위한 **영어 이미지 프롬프트**를 작성해 주세요.

### 작성 규칙:
1. **화풍:** 정교한 펜 선, **라인드로잉(line drawing)만 사용**, 톤(tone)이나 해칭(hatching) 없음, 압도적인 디테일, 흑백(Monochrome), 글씨 금지(Textless). 선의 굵기 변화와 선의 밀도로 명암과 디테일을 표현하되, 크로스 해칭이나 톤 작업은 절대 사용하지 말 것.

2. **표현:** '단순한 결합'을 넘어 생물학적으로 불쾌한 변형(Body Horror)을 묘사할 것. 모든 디테일은 선으로만 표현.

3. **이번에 강조할 기괴함 유형 (아래 중에서 선택하여 적용):**
${elementsList}

   **주의:** 위 유형들을 참고하되, 매번 새롭고 독창적인 조합을 만들어주세요. 이전에 만든 디자인을 반복하지 마세요.

4. **구도:**
   - **배경 없음:** 단색 배경(흰색 또는 검은색)만 사용, 배경 디테일 없음
   - **전신 표시:** 괴수의 머리부터 발끝까지 전체가 보이도록 전신 샷(full body shot)
   - **중앙 배치:** 괴수가 이미지 중앙에 위치하도록 구성

5. **이미지 비율:** 괴수의 형태에 맞는 적절한 비율을 선택하세요:
   - 세로형(portrait): 9:16 - 키가 크거나 세로로 긴 괴수
   - 정사각형(square): 1:1 - 균형잡힌 형태의 괴수
   - 가로형(landscape): 16:9 - 넓게 퍼진 형태나 다리가 많은 괴수

**중요:** 응답은 반드시 유효한 JSON 형식으로 작성해주세요:
\`\`\`json
{
  "imagePrompt": "실제 생성에 사용할 상세한 영어 프롬프트. 부정 프롬프트 파라미터 --no text, background, scenery 포함",
  "aspectRatio": "9:16 또는 1:1 또는 16:9 중 하나"
}
\`\`\`

- imagePrompt: 실제 이미지 생성에 사용할 영어 프롬프트만 포함 (선택된 모티프나 디자인 컨셉 설명 없이 프롬프트만)
- aspectRatio: "9:16", "1:1", "16:9" 중 하나만 사용

지금 바로 1개의 **독창적인** 괴수 디자인을 생성하고 JSON 형식으로 응답해 주세요.`;
  }

  // ============================================================
  // V2 프롬프트 생성
  // ============================================================

  protected buildPromptBodyV2(
    sectionResults: SectionCreatureResult[],
    allowVariant: boolean,
    selectedElements: DesignElement[]
  ): string {
    const elementsList = this.formatDesignElements(selectedElements);
    const sectionsText = this.formatSectionResults(sectionResults);
    const variantText = allowVariant ? '\n\n**변종 허용:** 선택된 요소들의 변형 및 돌연변이가 가능합니다. 더 자유롭게 창의적인 해석을 해주세요.' : '';
    const humanInstructions = this.formatHumanInstructions(sectionResults);

    return `당신은 '다크 판타지 크리처 컨셉 아티스트'이자 '전문 프롬프트 엔지니어'입니다.
아래에 **신체 섹션별로 지정된 요소들**을 사용하여 괴수 디자인을 생성하세요:

**신체 섹션별 구성:**
${sectionsText}${variantText}${humanInstructions}

지정된 요소들의 특징을 창의적으로 결합하여, 정교한 흑백 펜화 일러스트를 생성하기 위한 **영어 이미지 프롬프트**를 작성해 주세요.

### 작성 규칙:
1. **화풍:** 정교한 펜 선, **라인드로잉(line drawing)만 사용**, 톤(tone)이나 해칭(hatching) 없음, 압도적인 디테일, 흑백(Monochrome), 글씨 금지(Textless). 선의 굵기 변화와 선의 밀도로 명암과 디테일을 표현하되, 크로스 해칭이나 톤 작업은 절대 사용하지 말 것.

2. **섹션별 적용:**
   - 각 신체 섹션에 지정된 요소를 반영하되, 자연스럽게 융합할 것
   - 인체가 지정된 섹션은 해당 부위에 인간의 특징이 나타나야 함
   - 생물이 지정된 섹션은 해당 생물의 특징이 그 부위에 반영되어야 함

3. **표현:** '단순한 결합'을 넘어 생물학적으로 불쾌한 변형(Body Horror)을 묘사할 것. 모든 디테일은 선으로만 표현.

4. **이번에 강조할 기괴함 유형:**
${elementsList}

5. **구도:**
   - **배경 없음:** 단색 배경(흰색 또는 검은색)만 사용, 배경 디테일 없음
   - **전신 표시:** 괴수의 머리부터 발끝까지 전체가 보이도록 전신 샷(full body shot)
   - **중앙 배치:** 괴수가 이미지 중앙에 위치하도록 구성

6. **이미지 비율:** 괴수의 형태에 맞는 적절한 비율을 선택하세요:
   - 세로형(portrait): 9:16 - 키가 크거나 세로로 긴 괴수
   - 정사각형(square): 1:1 - 균형잡힌 형태의 괴수
   - 가로형(landscape): 16:9 - 넓게 퍼진 형태나 다리가 많은 괴수

**중요:** 응답은 반드시 유효한 JSON 형식으로 작성해주세요:
\`\`\`json
{
  "imagePrompt": "실제 생성에 사용할 상세한 영어 프롬프트. 각 섹션별 요소가 반영된 괴수. 부정 프롬프트 파라미터 --no text, background, scenery 포함",
  "aspectRatio": "9:16 또는 1:1 또는 16:9 중 하나"
}
\`\`\`

지금 바로 1개의 **독창적인** 괴수 디자인을 생성하고 JSON 형식으로 응답해 주세요.`;
  }
}
