/**
 * 괴수 스타일 생성기 - 피안도 스타일 (Higanjima)
 */

import { MonsterStyleGenerator } from '../base';
import { DesignElement, MonsterStyle, SelectedCreature } from '../types';

// 성별 타입
type BodyGender = 'male' | 'female' | 'ambiguous';

// 얼굴 유형 타입
type FaceType = 'human' | 'creature' | 'hybrid' | 'faceless';

/**
 * 피안도 스타일 괴수 생성기
 * 마츠모토 코지 화풍의 악귀/Amalgam 디자인을 생성합니다.
 */
export class HiganjimaStyleGenerator extends MonsterStyleGenerator {
  // 랜덤으로 선택된 성별과 얼굴 유형
  private selectedGender: BodyGender;
  private selectedFaceType: FaceType;

  constructor(
    creatures: SelectedCreature[],
    humanPart?: string
  ) {
    super(creatures, humanPart);
    this.selectedGender = this.selectRandomGender();
    this.selectedFaceType = this.selectRandomFaceType();
  }

  // ============================================================
  // 스타일 메타데이터
  // ============================================================

  get styleId(): MonsterStyle {
    return 'higanjima';
  }

  get styleName(): string {
    return '피안도 스타일';
  }

  get styleDescription(): string {
    return '악귀/Amalgam 디자인';
  }

  get styleIcon(): string {
    return '🧛';
  }

  get includeHumanProbability(): number {
    return 1.0; // 100% - 인간 기반 변형이 핵심
  }

  getValidAspectRatios(): string[] {
    return ['9:16', '1:1', '16:9'];
  }

  // ============================================================
  // 성별/얼굴 다양성 선택 로직
  // ============================================================

  /**
   * 성별을 랜덤으로 선택 (여성 40%, 남성 40%, 모호함 20%)
   */
  private selectRandomGender(): BodyGender {
    const rand = Math.random();
    if (rand < 0.4) return 'female';
    if (rand < 0.8) return 'male';
    return 'ambiguous';
  }

  /**
   * 얼굴 유형을 랜덤으로 선택 (인간 60%, 생물 20%, 혼합 15%, 없음 5%)
   */
  private selectRandomFaceType(): FaceType {
    const rand = Math.random();
    if (rand < 0.6) return 'human';
    if (rand < 0.8) return 'creature';
    if (rand < 0.95) return 'hybrid';
    return 'faceless';
  }

  /**
   * 선택된 성별에 따른 신체 설명 생성
   */
  private getGenderBodyDescription(): string {
    switch (this.selectedGender) {
      case 'female':
        return '**아름다운 여성의 신체** - 글래머러스하고 매력적인 여성의 몸매(풍만한 유방, 잘록한 허리, 섹시한 곡선미, 긴 다리, 흑발의 긴 머리카락)가 기괴하게 변형됨. 아름다움과 공포의 대비가 핵심.';
      case 'male':
        return '**남성의 신체** - 근육질의 몸통, 넓은 어깨 등 남성적 특징이 남아있으나 기괴하게 변형됨';
      case 'ambiguous':
        return '**모호한 성별** - 성별을 특정할 수 없는 기괴한 인체, 여성적/남성적 특징이 혼재되거나 완전히 변형됨';
    }
  }

  /**
   * 선택된 얼굴 유형에 따른 설명 생성
   */
  private getFaceTypeDescription(): string {
    switch (this.selectedFaceType) {
      case 'human':
        return '**인간의 얼굴** - 퇴화된 표정의 인간 얼굴이 남아있음 (풀린 눈, 기분 나쁜 웃음, 광기 어린 표정)';
      case 'creature':
        return '**생물의 얼굴** - 인간의 얼굴이 완전히 선택된 생물의 특징으로 대체됨 (칠성장어의 입, 갯가재의 복안 등)';
      case 'hybrid':
        return '**혼합된 얼굴** - 인간의 얼굴과 생물의 특징이 섞임 (한쪽은 인간, 한쪽은 생물 / 인간 얼굴에서 생물이 돋아남)';
      case 'faceless':
        return '**얼굴 없음** - 얼굴이 없거나, 살덩이로 덮여있거나, 구멍만 있는 형태';
    }
  }

  // ============================================================
  // 디자인 요소 (피안도 특유의 변형)
  // ============================================================

  protected getDesignElements(): DesignElement[] {
    // 공통 요소
    const commonElements: DesignElement[] = [
      // 거대화/비율 왜곡
      {
        name: '거대화된 인체',
        description: '인간의 신체 일부가 비정상적으로 거대해짐 (거대한 머리, 팽창한 몸통, 비대해진 손)',
        examples: 'giant baby-like head on small body, bloated torso, oversized hands'
      },
      {
        name: '늘어난 목/팔다리',
        description: '목이나 팔다리가 비정상적으로 길게 늘어남 (기린처럼 긴 목, 땅에 닿을 정도로 긴 팔)',
        examples: 'abnormally elongated neck, arms dragging on ground, stretched limbs'
      },
      {
        name: '부풀어 오른 신체',
        description: '몸 전체 또는 일부가 비정상적으로 부풀어 오름 (물에 불은 것 같은 팽창)',
        examples: 'bloated body like drowned corpse, swollen limbs, puffy flesh'
      },
      {
        name: '위축된 신체',
        description: '일부 신체가 극도로 작거나 위축됨 (쪼그라든 팔다리, 마른 몸통에 거대한 머리)',
        examples: 'shriveled limbs, emaciated torso with huge head, withered body parts'
      },
      // 피부/질감
      {
        name: '피부 질감 과장',
        description: '주름, 핏줄, 땀구멍을 과도하게 디테일하게 표현하여 징그러움 유발',
        examples: 'exaggerated wrinkles, visible veins, pores rendered in disgusting detail'
      },
      {
        name: '살덩이 돌출',
        description: '코나 입 주변에서 붉은 살덩이가 촉수처럼 징그럽게 돋아남',
        examples: 'fleshy tentacles sprouting from nose or mouth area, covering face'
      },
      {
        name: '피부 탈피',
        description: '피부가 벗겨지거나 탈피 중인 상태로 아래 조직이 드러남',
        examples: 'skin peeling off, shedding flesh, raw tissue visible underneath'
      },
      // 신체 변형
      {
        name: '다중 팔다리',
        description: '다리 대신 수십 개의 인간 팔이 엉켜 몸을 지탱하거나, 등에서 여러 팔이 솟아남',
        examples: 'dozens of human arms as legs, multiple arms sprouting from back like wings'
      },
      {
        name: '부분 갑각화',
        description: '인간 신체의 일부가 갑각류처럼 변형됨 (갑각화된 팔, 곤봉 같은 손)',
        examples: 'arms transformed into crustacean claws, shell-like armor on limbs'
      },
      {
        name: '엉킨 신체',
        description: '여러 인간의 몸이 서로 엉켜 하나의 괴물을 이룸',
        examples: 'tangled human bodies forming one creature, limbs intertwined, merged humans'
      },
      {
        name: '역전된 관절',
        description: '무릎이나 팔꿈치가 반대로 꺾임',
        examples: 'reversed knee joints, backwards bending elbows, inverted limb structure'
      },
      // 혐오 요소
      {
        name: '체액 과다',
        description: '침, 피, 고름 등이 끊임없이 흘러내림',
        examples: 'constant drooling, blood dripping, pus oozing, bodily fluids everywhere'
      },
      {
        name: '아기/노인 혼합',
        description: '아기의 몸에 노인의 얼굴, 또는 그 반대의 불쾌한 조합',
        examples: 'baby body with elderly face, infant features on aged body, age contradiction'
      },
    ];

    // 여성 신체 특화 요소 (아름다운 여성의 몸이 변형됨)
    const femaleElements: DesignElement[] = [
      {
        name: '아름다운 여체의 변형',
        description: '글래머러스하고 섹시한 여성의 아름다운 몸매(풍만한 가슴, 잘록한 허리, 긴 다리)가 부분적으로 기괴하게 변형됨. 아름다움은 유지하되 일부가 괴물화.',
        examples: 'beautiful voluptuous female body partially transformed, sexy figure with grotesque mutations, attractive woman with monstrous parts'
      },
      {
        name: '변형된 미인의 상체',
        description: '아름다운 여성의 풍만한 유방과 상체가 기괴하게 변형됨 (추가 유방, 위치 이상, 비대칭)',
        examples: 'beautiful female torso with multiple breasts, glamorous chest mutated, attractive upper body with grotesque additions'
      },
      {
        name: '매혹적 곡선의 왜곡',
        description: '섹시한 여성의 곡선미가 극단적으로 과장되거나 뒤틀림 (과장된 허리 곡선, 비정상적 골반, 늘어난 다리)',
        examples: 'exaggerated sexy curves twisted grotesquely, seductive hourglass figure warped, attractive feminine silhouette distorted'
      },
      {
        name: '긴 흑발의 변형',
        description: '아름다운 긴 검은 머리카락이 촉수나 손처럼 움직이거나, 피부와 융합되어 살아있는 것처럼',
        examples: 'beautiful long black hair moving like tentacles, gorgeous dark hair fused with skin, prehensile flowing hair'
      },
      {
        name: '미녀와 괴물의 대비',
        description: '상반신은 아름다운 여성이지만 하반신이 괴물이거나, 그 반대. 미와 추의 극단적 대비.',
        examples: 'beautiful woman upper body with monster lower half, attractive face on grotesque body, beauty and horror contrast'
      },
    ];

    // 남성 신체 특화 요소
    const maleElements: DesignElement[] = [
      {
        name: '변형된 근육질',
        description: '근육이 비정상적으로 발달하거나 뒤틀림 (한쪽만 비대, 근육이 피부 뚫고 돌출)',
        examples: 'grotesque muscular body with asymmetric development, muscles bursting through skin'
      },
      {
        name: '거대한 상체',
        description: '남성적 넓은 어깨와 상체가 비정상적으로 거대해짐',
        examples: 'massively oversized male torso, grotesquely broad shoulders, huge chest'
      },
    ];

    // 얼굴 유형에 따른 추가 요소
    const humanFaceElements: DesignElement[] = [
      {
        name: '퇴화된 표정',
        description: '초점 잃은 풀린 눈, 기분 나쁘게 웃는 입, 지능이 퇴화된 듯한 광기 어린 표정',
        examples: 'vacant stare, unsettling grin, drooling mouth, expression of lost intelligence'
      },
      {
        name: '세로로 쪼개진 얼굴',
        description: '인간의 얼굴이 세로로 쪼개지며 내부에서 다른 기관이나 이빨이 드러남',
        examples: 'face splitting vertically, revealing teeth or organs inside'
      },
      {
        name: '뒤집힌 얼굴',
        description: '얼굴이 뒤집히거나 180도 돌아가 있음 (거꾸로 된 입과 눈)',
        examples: 'upside-down face, rotated facial features, inverted expression'
      },
      {
        name: '다중 얼굴',
        description: '머리에 여러 개의 얼굴이 겹쳐 있거나 나란히 있음',
        examples: 'multiple faces overlapping, faces side by side on head, face within face'
      },
    ];

    const creatureFaceElements: DesignElement[] = [
      {
        name: '완전 생물화 얼굴',
        description: '인간의 얼굴이 완전히 사라지고 선택된 생물의 얼굴로 대체됨',
        examples: 'human head replaced with creature head, lamprey mouth for face, compound insect eyes'
      },
      {
        name: '얼굴 전체가 입',
        description: '얼굴 전체가 거대한 흡반형 입이나 이빨로 가득함',
        examples: 'entire face is a giant mouth, sucker mouth replacing face, teeth-covered head'
      },
    ];

    const facelessElements: DesignElement[] = [
      {
        name: '얼굴 없음',
        description: '얼굴이 매끈하게 없거나, 살덩이로 덮여 있음',
        examples: 'smooth faceless head, face covered by flesh, no features visible'
      },
      {
        name: '얼굴 대신 구멍',
        description: '얼굴에 구멍들만 뚫려 있음 (숨구멍, 기공 등)',
        examples: 'face with only holes, breathing pores instead of features, hollow eye sockets'
      },
    ];

    // 성별에 따라 요소 결합
    let genderElements: DesignElement[] = [];
    if (this.selectedGender === 'female') {
      genderElements = femaleElements;
    } else if (this.selectedGender === 'male') {
      genderElements = maleElements;
    } else {
      // 모호한 경우 양쪽에서 랜덤 선택
      genderElements = [...femaleElements, ...maleElements];
    }

    // 얼굴 유형에 따라 요소 결합
    let faceElements: DesignElement[] = [];
    switch (this.selectedFaceType) {
      case 'human':
        faceElements = humanFaceElements;
        break;
      case 'creature':
        faceElements = creatureFaceElements;
        break;
      case 'hybrid':
        faceElements = [...humanFaceElements.slice(0, 2), ...creatureFaceElements.slice(0, 1)];
        break;
      case 'faceless':
        faceElements = facelessElements;
        break;
    }

    return [...commonElements, ...genderElements, ...faceElements];
  }

  // ============================================================
  // 추가 헬퍼 메서드
  // ============================================================

  /**
   * 선택된 생물별 피안도식 적용 가이드 생성
   */
  private formatCreatureApplicationGuide(): string {
    return this.creatures.map((sc: SelectedCreature) => {
      const creatureName = sc.creature.name.split(' (')[0]; // 한글 이름만 추출
      const feature = sc.creature.description;

      // 피안도 스타일에 맞는 적용 예시 생성
      return `- **${creatureName}:** ${feature}을(를) 인간 신체에 기생하거나 융합된 형태로 변형 - 예: 인간의 목이 길게 늘어나 끝에 ${creatureName}의 특징이 나타나거나, 팔다리가 ${creatureName}처럼 변형`;
    }).join('\n');
  }

  /**
   * 인간 요소 포맷팅 (피안도 스타일용 - 인간 기반 강조)
   */
  protected formatHumanPart(): string {
    if (!this.humanPart) return '';
    return `\n${this.creatures.length + 1}. **인간의 신체 요소:** ${this.humanPart} - 기괴하게 늘어나거나 거대화된 인간의 ${this.humanPart}`;
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
    const creatureApplicationGuide = this.formatCreatureApplicationGuide();
    const genderDescription = this.getGenderBodyDescription();
    const faceDescription = this.getFaceTypeDescription();

    return `당신은 일본 만화 '피안도(Higanjima)' 스타일의 **크리처(악귀/Amalgam)** 전문 컨셉 아티스트이자 프롬프트 엔지니어입니다.
마츠모토 코지(Kōji Matsumoto) 작가 특유의 **'불쾌한 골짜기(Uncanny Valley)'와 '거대화된 인체 변형'**을 완벽하게 재현한 괴수 디자인 프롬프트를 작성하세요.

**선택된 생물:**
${creaturesList}${humanPartText}

---

### 작성 규칙 (Higanjima / Matsumoto Kōji Style):

**1. 화풍 (Art Style):**
- **G-Pen & Hatching:** 붓펜보다는 **날카로운 펜 선(G-pen)**과 집요한 해칭(Cross-hatching) 묘사가 특징입니다.
- **Realistic yet Grotesque:** 배경과 사물은 사실적으로 묘사하되, 괴수의 피부 질감(주름, 핏줄, 땀구멍)을 과도하게 디테일하게 표현하여 징그러움을 유발할 것.
- **High Contrast:** 흑백 만화 특유의 강렬한 대비. 피와 타액(침)의 묘사는 검은색 잉크로 끈적하게 표현.

**2. 디자인 철학 (The Human Base):**
- **인간 기반의 변형 (Human Vestige):** 피안도의 괴수들은 대부분 '감염된 인간'에서 시작합니다. 따라서 **반드시 인간의 형상(특히 나체에 가까운 몸통)이 남아있어야** 합니다.
- **거대화와 부조화 (Gigantism & Disproportion):** 거대한 아기 얼굴에 게의 다리가 달려있거나, 인간의 몸통에 칠성장어처럼 길게 늘어난 목 등, **비율을 완전히 무시한 거대화**가 필수입니다.

**3. 🎯 이번 괴수의 신체/얼굴 설정 (반드시 적용!):**
- ${genderDescription}
- ${faceDescription}

**중요:** 위에서 지정된 신체 성별과 얼굴 유형을 반드시 반영해야 합니다. 특히:
${this.selectedGender === 'female' ? `- **🔥 아름다운 여성 신체 필수**: 글래머러스하고 섹시한 여성의 아름다운 몸매(풍만한 가슴, 잘록한 허리, 긴 다리, 매혹적인 곡선미)를 기반으로 하되 일부가 기괴하게 변형됨. **아름다움과 공포의 대비**가 핵심! 단순한 괴물이 아닌 "아름다운 여성이 괴물화된" 느낌.` : ''}
${this.selectedFaceType !== 'human' ? `- **비인간 얼굴**: 인간의 얼굴이 아닌 형태로 표현할 것` : ''}

**4. 이번에 적용할 디자인 요소:**
${elementsList}

**5. 선택된 생물의 피안도식 적용 가이드:**
${creatureApplicationGuide}

**6. 구도:**
- **로우 앵글 (Low Angle):** 인간(생존자)의 시점에서 괴수를 올려다보는 구도로 거대함을 강조.
- **배경:** 단순한 흰색 또는 회색 배경. **효과선, 집중선, 만화 배경 효과 없음.**
- **전신 샷:** 괴수의 전체적인 실루엣과 거대함이 보이도록.

**7. 🚫 절대 포함하지 말 것 (매우 중요!):**
- **텍스트 금지:** 어떤 글자, 대사, 말풍선(speech bubble), 효과음(onomatopoeia), 사운드 이펙트 텍스트도 포함하지 말 것
- **만화 효과 금지:** 액션 라인, 스피드 라인, 집중선, 폭발 효과선 등 만화 특유의 배경 효과 없음
- **괴수만 그릴 것:** 오직 괴수 캐릭터만 단독으로 그릴 것. 배경 효과나 텍스트 없이 깔끔하게.

**8. 이미지 비율:** 괴수의 형태에 맞는 적절한 비율을 선택하세요:
- 세로형(portrait): 9:16 - 늘어난 목이나 거대한 상체를 가진 괴수
- 정사각형(square): 1:1 - 균형잡힌 형태의 괴수
- 가로형(landscape): 16:9 - 다리가 많거나 넓게 퍼진 괴수

---

**중요:** 응답은 반드시 유효한 JSON 형식으로 작성해주세요:
\`\`\`json
{
  "imagePrompt": "실제 생성에 사용할 상세한 영어 프롬프트. Higanjima manga style, G-pen linework, cross-hatching, grotesque human transformation 등의 스타일 키워드 포함. 지정된 성별(${this.selectedGender})과 얼굴 유형(${this.selectedFaceType})을 반드시 반영.${this.selectedGender === 'female' ? ' beautiful voluptuous female body, glamorous sexy curves, attractive woman partially transformed into monster, beauty and horror contrast.' : ''} 반드시 'no text, no speech bubbles, no sound effects, creature only, plain background' 포함",
  "negativePrompt": "cute, anime style, smooth skin, glowing, magical, clean, colorful, cartoon, chibi, text, speech bubble, dialogue, word balloon, sound effects, onomatopoeia, manga text, Japanese text, Korean text, letters, captions, action lines, speed lines, motion blur, impact lines, focus lines",
  "aspectRatio": "9:16 또는 1:1 또는 16:9 중 하나"
}
\`\`\`

- **imagePrompt:** 피안도 만화 스타일을 강조하는 영어 프롬프트. 지정된 성별과 얼굴 유형, 날카로운 펜선, 해칭, 인간 기반 변형, 거대화 등의 분위기 포함.${this.selectedGender === 'female' ? ' **여성일 경우 "beautiful voluptuous female body, sexy curves, attractive woman transformed" 등 아름다운 여성 키워드 필수.**' : ''} **반드시 "no text, no speech bubbles, creature only" 등의 지시 포함.**
- **negativePrompt:** 피안도의 처절하고 징그러운 분위기와 맞지 않는 요소 + **텍스트/말풍선/효과선 관련 키워드 필수 포함**
- **aspectRatio:** "9:16", "1:1", "16:9" 중 하나만 사용

지금 바로 1개의 **독창적인 피안도 스타일 악귀 디자인**을 생성하고 JSON 형식으로 응답해 주세요.`;
  }
}
