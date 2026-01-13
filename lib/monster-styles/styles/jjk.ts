/**
 * 괴수 스타일 생성기 - 주술회전 스타일 (Jujutsu Kaisen)
 */

import { MonsterStyleGenerator } from '../base';
import { DesignElement, MonsterStyle, SelectedCreature, SectionCreatureResult } from '../types';
import { SECTION_DESCRIPTIONS, HUMAN_TYPES } from '../creatures';

// 베이스 플랫폼 (몸체 형태) 타입
type BodyPlatform =
  | 'humanoid'      // 인간형 2족보행
  | 'quadruped'     // 사족형 (네발)
  | 'hexapod'       // 6족형
  | 'octopod'       // 8족형 (거미/문어)
  | 'centipede'     // 지네형 (다족)
  | 'serpentine'    // 뱀형 (무족)
  | 'larval'        // 애벌레형
  | 'amorphous'     // 부정형 (슬라임/점액질)
  | 'amalgam';      // 합체형 (여러 신체 융합)

// 플랫폼 정보
interface PlatformInfo {
  id: BodyPlatform;
  name: string;
  description: string;
  examples: string;
  weight: number; // 선택 확률 가중치
}

/**
 * 주술회전 스타일 괴수 생성기
 * 아쿠타미 게게의 화풍을 재현한 특급 주령 디자인을 생성합니다.
 */
export class JJKStyleGenerator extends MonsterStyleGenerator {
  // 랜덤으로 선택된 베이스 플랫폼
  private selectedPlatform: PlatformInfo;

  // 플랫폼 목록과 가중치
  private static readonly PLATFORMS: PlatformInfo[] = [
    {
      id: 'humanoid',
      name: '인간형 (2족보행)',
      description: '인간의 형태를 기반으로 하는 2족보행 괴수',
      examples: 'humanoid cursed spirit, bipedal monster with human-like posture, standing upright on two legs',
      weight: 25
    },
    {
      id: 'quadruped',
      name: '사족형 (4족)',
      description: '네 발로 걷는 짐승 형태의 괴수',
      examples: 'four-legged beast, quadruped creature crawling on all fours, animal-like stance',
      weight: 15
    },
    {
      id: 'hexapod',
      name: '6족형',
      description: '여섯 개의 다리를 가진 곤충형 괴수',
      examples: 'six-legged insectoid, hexapod creature, insect-like body with six limbs',
      weight: 10
    },
    {
      id: 'octopod',
      name: '8족형 (거미/문어)',
      description: '여덟 개의 다리나 촉수를 가진 괴수',
      examples: 'spider-like eight legs, octopus tentacles, eight-limbed horror',
      weight: 10
    },
    {
      id: 'centipede',
      name: '지네형 (다족)',
      description: '수많은 다리가 달린 지네나 노래기 형태',
      examples: 'centipede-like body with countless legs, millipede form, segmented body with many limbs',
      weight: 10
    },
    {
      id: 'serpentine',
      name: '뱀형 (무족)',
      description: '다리 없이 긴 몸통으로 기어다니는 형태',
      examples: 'legless serpentine body, snake-like form, long coiling body without limbs, eel-like',
      weight: 10
    },
    {
      id: 'larval',
      name: '애벌레형',
      description: '통통하고 부드러운 애벌레나 유충 형태',
      examples: 'larva-like soft body, caterpillar form, grub-like creature, maggot-shaped',
      weight: 8
    },
    {
      id: 'amorphous',
      name: '부정형 (점액질)',
      description: '정해진 형태 없이 흐물흐물한 슬라임 같은 형태',
      examples: 'amorphous blob, shapeless mass, slime-like form, formless horror',
      weight: 7
    },
    {
      id: 'amalgam',
      name: '합체형 (융합체)',
      description: '여러 인간이나 생물의 신체가 융합된 형태',
      examples: 'multiple bodies fused together, amalgamation of limbs and torsos, merged creatures',
      weight: 5
    }
  ];

  constructor(
    creatures: SelectedCreature[],
    humanPart?: string
  ) {
    super(creatures, humanPart);
    this.selectedPlatform = this.selectRandomPlatform();
  }

  // ============================================================
  // 스타일 메타데이터
  // ============================================================

  get styleId(): MonsterStyle {
    return 'jjk';
  }

  get styleName(): string {
    return '주술회전 스타일';
  }

  get styleDescription(): string {
    return '특급 주령 디자인';
  }

  get styleIcon(): string {
    return '👹';
  }

  get includeHumanProbability(): number {
    // 인간형/합체형일 때만 인간 요소 포함
    if (this.selectedPlatform.id === 'humanoid' || this.selectedPlatform.id === 'amalgam') {
      return 1.0;
    }
    return 0.5; // 다른 플랫폼에서는 50% 확률
  }

  getValidAspectRatios(): string[] {
    return ['9:16', '1:1', '16:9'];
  }

  // ============================================================
  // 베이스 플랫폼 선택 로직
  // ============================================================

  /**
   * 가중치 기반 랜덤 플랫폼 선택
   */
  private selectRandomPlatform(): PlatformInfo {
    const totalWeight = JJKStyleGenerator.PLATFORMS.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const platform of JJKStyleGenerator.PLATFORMS) {
      random -= platform.weight;
      if (random <= 0) {
        return platform;
      }
    }

    // 폴백: 첫 번째 플랫폼 반환
    return JJKStyleGenerator.PLATFORMS[0];
  }

  /**
   * 플랫폼에 따른 추천 이미지 비율
   */
  private getRecommendedAspectRatio(): string {
    switch (this.selectedPlatform.id) {
      case 'humanoid':
        return '9:16'; // 세로형 - 키가 큰 인간형
      case 'serpentine':
      case 'centipede':
        return '16:9'; // 가로형 - 길게 늘어진 형태
      case 'larval':
      case 'amorphous':
        return '1:1'; // 정사각형 - 덩어리 형태
      default:
        return '1:1'; // 기본값
    }
  }

  // ============================================================
  // 디자인 요소 (저주 디자인)
  // ============================================================

  protected getDesignElements(): DesignElement[] {
    // 공통 저주 디자인 요소
    const commonElements: DesignElement[] = [
      // 신체 부위 변형
      {
        name: '다중 입',
        description: '몸통이나 관절, 예상치 못한 곳에 입이 달려있음',
        examples: 'mouths appearing on torso, joints, segments, or back'
      },
      {
        name: '불규칙한 눈',
        description: '얼굴이 아닌 곳에 불규칙하게 박힌 여러 개의 눈',
        examples: 'multiple eyes scattered across body irregularly'
      },
      {
        name: '이빨 과잉',
        description: '입 안에 이빨이 과도하게 많거나, 입 밖으로 삐져나온 이빨',
        examples: 'too many teeth, teeth growing outside, shark-like rows'
      },
      {
        name: '피부 질감 변이',
        description: '부분적으로 갑각화, 비늘화, 또는 살이 뒤집힌 것 같은 질감',
        examples: 'partial exoskeleton, scales, or inside-out flesh texture'
      },
      {
        name: '저주 에너지 방출',
        description: '몸에서 검은 연기나 오라, 또는 저주의 기운이 뿜어져 나옴',
        examples: 'black smoke emanating, cursed aura visible, dark energy radiating'
      },
      {
        name: '기괴한 문양',
        description: '피부에 저주 문양이나 기하학적 패턴이 새겨짐',
        examples: 'curse marks on skin, geometric patterns, ritual symbols embedded'
      },
    ];

    // 플랫폼별 특화 요소
    const platformElements: Record<BodyPlatform, DesignElement[]> = {
      humanoid: [
        {
          name: '빈 얼굴/마스크',
          description: '얼굴이 없거나 가면처럼 비어있는 표정',
          examples: 'faceless head, mask-like empty expression, face replaced by mouth'
        },
        {
          name: '기형적 팔다리',
          description: '비정상적으로 늘어나거나 잘못된 방향으로 꺾인 팔다리',
          examples: 'elongated limbs, too many joints, limbs bending wrong'
        },
        {
          name: '왜곡된 비율',
          description: '머리가 너무 작거나 크거나 하는 비율 왜곡',
          examples: 'tiny head on massive body, arms longer than legs'
        },
        {
          name: '비대칭 성장',
          description: '한쪽만 비정상적으로 발달하거나 변형됨',
          examples: 'one arm massively enlarged, half-body mutation'
        },
      ],
      quadruped: [
        {
          name: '뒤틀린 사지',
          description: '네 다리가 각각 다른 방향으로 꺾이거나 길이가 다름',
          examples: 'legs bending in different directions, uneven leg lengths'
        },
        {
          name: '등에서 솟아난 것',
          description: '등에서 팔, 얼굴, 또는 다른 기관이 솟아남',
          examples: 'arms or faces sprouting from back, organs growing on spine'
        },
        {
          name: '인간 얼굴의 짐승',
          description: '짐승의 몸에 인간의 얼굴이 달려있음',
          examples: 'human face on beast body, disturbing human expression on animal'
        },
      ],
      hexapod: [
        {
          name: '곤충 복합눈',
          description: '거대한 복합눈이나 여러 개의 눈이 머리를 덮음',
          examples: 'compound insect eyes, multiple eyes covering head'
        },
        {
          name: '절지 관절',
          description: '다리마다 수많은 관절이 있어 기괴하게 움직임',
          examples: 'too many joints in each leg, unnatural articulation'
        },
        {
          name: '인간 상체',
          description: '곤충 하체에 인간의 상체가 붙어있음',
          examples: 'human torso on insect body, human-insect chimera'
        },
      ],
      octopod: [
        {
          name: '촉수 끝의 얼굴',
          description: '각 촉수 끝에 인간의 얼굴이나 입이 달려있음',
          examples: 'faces at tentacle tips, mouths on each arm end'
        },
        {
          name: '빨판의 눈',
          description: '빨판 대신 눈이 촉수를 따라 줄지어 있음',
          examples: 'eyes instead of suckers, eyes lining tentacles'
        },
        {
          name: '중앙의 거대한 입',
          description: '몸 중앙에 거대한 이빨 가득한 입이 있음',
          examples: 'giant central maw, teeth-filled mouth in body center'
        },
      ],
      centipede: [
        {
          name: '인간 팔다리 다리',
          description: '각 마디마다 인간의 팔이나 다리가 다리로 붙어있음',
          examples: 'human arms as legs on each segment, hands walking'
        },
        {
          name: '분절된 인간 얼굴',
          description: '각 마디에 다른 인간의 얼굴이 달려있음',
          examples: 'different human faces on each body segment'
        },
        {
          name: '끝없이 이어지는 몸',
          description: '머리와 꼬리가 이어진 것처럼 끝이 보이지 않음',
          examples: 'seemingly endless body, head and tail connect'
        },
      ],
      serpentine: [
        {
          name: '인간 상체',
          description: '뱀의 몸에서 인간의 상체가 솟아남 (라미아형)',
          examples: 'human upper body emerging from snake, lamia-like'
        },
        {
          name: '몸통의 얼굴들',
          description: '긴 몸통을 따라 여러 인간 얼굴이 박혀있음',
          examples: 'human faces embedded along body length'
        },
        {
          name: '비늘 사이의 입',
          description: '비늘 사이사이에 작은 입들이 열림',
          examples: 'small mouths between scales, teeth in gaps'
        },
      ],
      larval: [
        {
          name: '거대한 아기 얼굴',
          description: '애벌레 몸에 거대한 아기나 인간 얼굴',
          examples: 'giant baby face on grub body, infant features'
        },
        {
          name: '투명 껍질',
          description: '반투명한 껍질 안에 내장이나 인간 형체가 보임',
          examples: 'translucent skin showing organs or human shape inside'
        },
        {
          name: '분비물 흘리기',
          description: '끈적한 점액이나 체액을 끊임없이 분비',
          examples: 'constantly dripping slime, secreting fluids'
        },
      ],
      amorphous: [
        {
          name: '떠다니는 얼굴들',
          description: '점액질 안에 여러 인간 얼굴이 떠다님',
          examples: 'human faces floating in slime mass'
        },
        {
          name: '손 뻗어나오기',
          description: '부정형 덩어리에서 인간의 손들이 뻗어나옴',
          examples: 'human hands reaching out from blob'
        },
        {
          name: '핵 또는 눈',
          description: '점액질 중앙에 거대한 눈이나 기관이 있음',
          examples: 'giant eye or core organ in center of mass'
        },
      ],
      amalgam: [
        {
          name: '엉킨 신체',
          description: '여러 인간의 몸이 서로 엉켜 하나의 괴물을 이룸',
          examples: 'tangled human bodies, limbs intertwined'
        },
        {
          name: '불협화음 얼굴',
          description: '여러 얼굴이 한 머리에서 서로 다른 방향을 봄',
          examples: 'multiple faces looking different directions'
        },
        {
          name: '공유된 팔다리',
          description: '여러 몸통이 같은 팔다리를 공유함',
          examples: 'shared limbs between multiple torsos'
        },
      ],
    };

    // 현재 플랫폼의 요소와 공통 요소 결합
    const currentPlatformElements = platformElements[this.selectedPlatform.id] || [];
    return [...commonElements, ...currentPlatformElements];
  }

  // ============================================================
  // 추가 헬퍼 메서드
  // ============================================================

  /**
   * 선택된 생물별 적용 가이드 생성 (플랫폼에 맞춤)
   */
  private formatCreatureApplicationGuide(): string {
    const platformContext = this.getPlatformApplicationContext();
    return this.creatures.map((sc: SelectedCreature) => {
      const creatureName = sc.creature.name.split(' (')[0]; // 한글 이름만 추출
      const feature = sc.creature.description;
      return `- **${creatureName}:** ${feature}을(를) ${platformContext}에 적용`;
    }).join('\n');
  }

  /**
   * 플랫폼에 따른 적용 컨텍스트 반환
   */
  private getPlatformApplicationContext(): string {
    switch (this.selectedPlatform.id) {
      case 'humanoid':
        return '인간형 몸체의 얼굴, 손바닥, 등, 관절 등';
      case 'quadruped':
        return '네발 짐승의 등, 머리, 다리 관절 등';
      case 'hexapod':
        return '6족 곤충형 몸체의 머리, 복부, 다리 등';
      case 'octopod':
        return '8족 촉수형 몸체의 촉수 끝, 중앙부, 빨판 등';
      case 'centipede':
        return '지네형 몸체의 각 마디, 머리, 다리 등';
      case 'serpentine':
        return '뱀형 몸체의 머리, 몸통 전체, 비늘 사이 등';
      case 'larval':
        return '애벌레형 몸체의 머리, 부드러운 몸통, 마디 등';
      case 'amorphous':
        return '부정형 점액질 덩어리의 표면, 내부 등';
      case 'amalgam':
        return '융합된 여러 신체의 연결부, 겹친 부분 등';
      default:
        return '몸체의 여러 부분';
    }
  }

  /**
   * 인간 요소 포맷팅 (JJK 스타일용 - 플랫폼에 맞춤)
   */
  protected formatHumanPart(): string {
    if (!this.humanPart) return '';

    // 인간형이 아닌 플랫폼에서는 인간 요소를 다르게 표현
    if (this.selectedPlatform.id === 'humanoid') {
      return `\n${this.creatures.length + 1}. **인간의 신체 요소:** ${this.humanPart} - 기괴하게 비틀린 인간의 ${this.humanPart}`;
    } else {
      return `\n${this.creatures.length + 1}. **인간의 신체 요소:** ${this.humanPart} - ${this.selectedPlatform.name} 몸체에 기생하거나 튀어나온 인간의 ${this.humanPart}`;
    }
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
    const recommendedRatio = this.getRecommendedAspectRatio();

    return `당신은 일본 만화 '주술회전(Jujutsu Kaisen)' 스타일의 **특급 주령(Special Grade Cursed Spirit)** 전문 컨셉 아티스트이자 프롬프트 엔지니어입니다.
아래에 **이미 선택된 생물들**을 사용하여, **아쿠타미 게게(Gege Akutami)의 화풍**을 완벽하게 재현한 괴수 디자인 프롬프트를 작성하세요.

**선택된 생물:**
${creaturesList}${humanPartText}

---

### 작성 규칙 (JJK Cursed Spirit Style):

**1. 화풍 (Art Style):**
- **Rough & Sketchy:** 깔끔한 선이 아닌, 거칠고 역동적인 붓펜(Brush pen) 터치와 스케치 스타일을 강조할 것.
- **Manga Aesthetics:** 일본 흑백 만화 스타일(Japanese Manga Style). 진한 먹칠(Heavy Black Ink), 스크린톤(Screentones), 먹물 튐 효과(Ink Splatters)를 포함할 것.
- **Atmosphere:** 사악하고 불길한 오라(Ominous aura), 저주받은 에너지(Cursed Energy)가 느껴지는 연출.

**2. 🎯 이번 괴수의 베이스 플랫폼 (반드시 적용!):**
- **${this.selectedPlatform.name}**
- 설명: ${this.selectedPlatform.description}
- 형태 키워드: ${this.selectedPlatform.examples}

**⚠️ 중요:** 이번 괴수는 **${this.selectedPlatform.name}** 형태입니다. 인간형 2족보행이 아닌, 위에서 지정된 플랫폼 형태를 반드시 따라야 합니다!

**3. 디자인 철학 (Curse Design):**
- **단순 결합 금지:** 동물을 그대로 그리는 것이 아니라, **${this.selectedPlatform.name}** 형태에 선택된 생물의 특징이 '저주'로서 발현된 것처럼 디자인할 것.
- **불쾌한 골짜기 (Uncanny Valley):** ${this.selectedPlatform.id === 'humanoid' ? '근육질의 인간 신체에 동물의 특징이 침식해 들어가거나' : `${this.selectedPlatform.name} 몸체에 인간의 신체 일부(얼굴, 손, 팔 등)가 기생하거나 융합된`} 디자인.
- **강조 포인트:** 주술회전 특유의 디자인 요소를 적극 활용.

**4. 이번에 적용할 저주 디자인 요소:**
${elementsList}

**5. 선택된 생물의 적용 가이드:**
${creatureApplicationGuide}

**6. 구도:**
- **배경:** 단순한 흰색 배경(White background) 또는 그라데이션. **효과선(Action lines), 속도선(Speed lines), 집중선 없음.**
- **전신 샷:** 괴수의 전체적인 실루엣이 보이도록.
- **중앙 배치:** 괴수가 이미지 중앙에 위치하도록 구성.

**7. 🚫 절대 포함하지 말 것 (매우 중요!):**
- **텍스트 금지:** 어떤 글자, 대사, 말풍선(speech bubble), 효과음(onomatopoeia), 사운드 이펙트 텍스트도 포함하지 말 것
- **만화 효과 금지:** 액션 라인, 스피드 라인, 집중선, 폭발 효과선 등 만화 특유의 배경 효과 없음
- **괴수만 그릴 것:** 오직 괴수 캐릭터만 단독으로 그릴 것. 배경 효과나 텍스트 없이 깔끔하게.

**8. 이미지 비율 (권장: ${recommendedRatio}):**
- 세로형(portrait): 9:16 - 키가 크거나 세로로 긴 괴수
- 정사각형(square): 1:1 - 균형잡힌 형태의 괴수
- 가로형(landscape): 16:9 - 넓게 퍼진 형태나 다리가 많은 괴수 (지네형, 뱀형 등)

---

**중요:** 응답은 반드시 유효한 JSON 형식으로 작성해주세요:
\`\`\`json
{
  "imagePrompt": "실제 생성에 사용할 상세한 영어 프롬프트. ${this.selectedPlatform.name} 형태의 괴수를 반드시 포함. Jujutsu Kaisen manga style, rough brush strokes, heavy black ink 등의 스타일 키워드 포함. '${this.selectedPlatform.examples}' 형태를 반드시 반영. 반드시 'no text, no speech bubbles, creature only, clean background' 포함",
  "negativePrompt": "photorealistic, 3d render, clean line art, color, western comic style, anime, smooth shading, digital art, text, speech bubble, dialogue, word balloon, sound effects, onomatopoeia, manga text, Japanese text, Korean text, letters, captions, action lines, speed lines, motion blur, impact lines${this.selectedPlatform.id !== 'humanoid' ? ', bipedal, standing upright, humanoid stance' : ''}",
  "aspectRatio": "${recommendedRatio} (권장) 또는 괴수 형태에 맞게 조정"
}
\`\`\`

- **imagePrompt:** **${this.selectedPlatform.name}** 형태를 기반으로 한 주령 디자인. 거친 붓터치, 먹칠, 저주받은 에너지 등의 분위기 포함.
- **negativePrompt:** 만화적 느낌을 해치는 요소 + 텍스트/말풍선/효과선 관련 키워드 필수 포함${this.selectedPlatform.id !== 'humanoid' ? ' + bipedal/humanoid 배제' : ''}
- **aspectRatio:** "9:16", "1:1", "16:9" 중 하나 (${this.selectedPlatform.name}에는 ${recommendedRatio} 권장)

지금 바로 1개의 **독창적인 ${this.selectedPlatform.name} 형태의 특급 주령 디자인**을 생성하고 JSON 형식으로 응답해 주세요.`;
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
    const sectionsText = this.formatSectionResultsV2(sectionResults);
    const variantText = allowVariant ? '\n\n**변종 허용:** 선택된 요소들의 변형 및 돌연변이가 가능합니다. 저주 에너지로 인한 더 극단적인 변형을 적용해도 됩니다.' : '';
    const humanInstructions = this.formatHumanInstructions(sectionResults);
    
    // v2에서는 인체 선택 여부에 따라 형태 결정
    const hasHuman = sectionResults.some(r => r.type === 'human');
    const baseFormText = hasHuman 
      ? '인체가 포함된 섹션은 해당 인간의 신체 특징을 기반으로 하되, 다른 섹션의 생물 특징과 기괴하게 융합된 형태로 디자인하세요.'
      : '순수하게 생물들의 특징만 조합된 괴수입니다. 인간형(humanoid)이나 이족보행이 아닌, 선택된 생물들의 신체 구조를 기반으로 디자인하세요.';

    return `당신은 일본 만화 '주술회전(Jujutsu Kaisen)' 스타일의 **특급 주령(Special Grade Cursed Spirit)** 전문 컨셉 아티스트이자 프롬프트 엔지니어입니다.
아래에 **신체 섹션별로 지정된 요소들**을 사용하여, **아쿠타미 게게(Gege Akutami)의 화풍**을 완벽하게 재현한 괴수 디자인 프롬프트를 작성하세요.

**⚠️ 핵심 규칙: 각 섹션에서 선택된 생물이 해당 부위의 기본 구조입니다!**
${sectionsText}${variantText}${humanInstructions}

---

### 작성 규칙 (JJK Cursed Spirit Style):

**1. 화풍 (Art Style):**
- **Rough & Sketchy:** 깔끔한 선이 아닌, 거칠고 역동적인 붓펜(Brush pen) 터치와 스케치 스타일을 강조할 것.
- **Manga Aesthetics:** 일본 흑백 만화 스타일(Japanese Manga Style). 진한 먹칠(Heavy Black Ink), 스크린톤(Screentones), 먹물 튐 효과(Ink Splatters)를 포함할 것.
- **Atmosphere:** 사악하고 불길한 오라(Ominous aura), 저주받은 에너지(Cursed Energy)가 느껴지는 연출.

**2. 🎯 섹션별 구조 규칙 (가장 중요!):**
${baseFormText}

**⚠️ 주의: 각 섹션에서 선택된 요소가 해당 부위의 "기본 형태/구조"가 되어야 합니다.**
- 예: "몸통 = 갯가재"이면, 몸통은 **갯가재의 몸체 구조 자체**가 기본이 됩니다. (인간 몸통에 갯가재를 붙이는 것이 아님!)
- 예: "얼굴 = 집게벌레"이면, 머리는 **집게벌레의 머리 구조 자체**가 기본이 됩니다.
- 인체가 선택된 섹션에서만 인간의 신체가 기본 구조로 사용됩니다.

**3. 섹션별 적용:**
- 각 섹션에 지정된 생물의 **실제 해부학적 구조**를 정확히 반영하세요.
- 지정되지 않은 섹션은 다른 섹션의 요소가 자연스럽게 확장되거나 연결되도록 디자인하세요.

**4. 이번에 적용할 저주 디자인 요소:**
${elementsList}

**5. 구도:**
- **배경:** 단순한 흰색 배경(White background). **효과선, 속도선, 집중선 없음.**
- **전신 샷:** 괴수의 전체적인 실루엣이 보이도록.
- **중앙 배치:** 괴수가 이미지 중앙에 위치하도록 구성.

**6. 🚫 절대 포함하지 말 것:**
- **텍스트 금지:** 어떤 글자, 대사, 말풍선, 효과음 텍스트도 포함하지 말 것
- **만화 효과 금지:** 액션 라인, 스피드 라인, 집중선 등 없음
- **괴수만 그릴 것:** 오직 괴수 캐릭터만 단독으로 그릴 것

**7. 이미지 비율:**
- 세로형(portrait): 9:16
- 정사각형(square): 1:1
- 가로형(landscape): 16:9

---

**중요:** 응답은 반드시 유효한 JSON 형식으로 작성해주세요:
\`\`\`json
{
  "imagePrompt": "실제 생성에 사용할 상세한 영어 프롬프트. 각 섹션에서 선택된 생물이 해당 부위의 기본 구조가 되도록. Jujutsu Kaisen manga style 포함. 'no text, no speech bubbles, creature only, clean background' 포함",
  "negativePrompt": "photorealistic, 3d render, clean line art, color, text, speech bubble, action lines, speed lines",
  "aspectRatio": "9:16 또는 1:1 또는 16:9 중 괴수 형태에 맞게 선택"
}
\`\`\`

지금 바로 1개의 **독창적인 특급 주령 디자인**을 생성하고 JSON 형식으로 응답해 주세요.`;
  }

  /**
   * V2용 섹션 결과 포맷팅 (더 명확하게)
   */
  private formatSectionResultsV2(results: SectionCreatureResult[]): string {
    if (results.length === 0) {
      return '(지정된 요소 없음)';
    }

    return results.map((result) => {
      const sectionInfo = SECTION_DESCRIPTIONS[result.section];
      
      if (result.type === 'human' && result.humanType) {
        const humanInfo = HUMAN_TYPES[result.humanType];
        return `- **${sectionInfo.name}**: 인체 - ${humanInfo.name} (${humanInfo.nameEn})`;
      } else {
        // 생물 이름에서 한글과 영어 분리
        const nameParts = result.name.match(/^(.+?)\s*\((.+)\)$/);
        if (nameParts) {
          const koreanName = nameParts[1];
          const englishName = nameParts[2];
          return `- **${sectionInfo.name}**: 생물 - ${koreanName} (영어: ${englishName}) - 특징: ${result.description}`;
        }
        return `- **${sectionInfo.name}**: 생물 - ${result.name} - 특징: ${result.description}`;
      }
    }).join('\n');
  }
}
