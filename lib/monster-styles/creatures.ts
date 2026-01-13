/**
 * 괴수 스타일 생성기 - 생물 데이터
 */

import { Creature, CreatureCategories, CreatureCategory, SelectedCreature, CATEGORY_NAMES, HumanType, BodySection } from './types';

// ============================================================
// V2 괴수 생성기 - 인체 타입 및 섹션 정보
// ============================================================

// 인체 타입 정보
export const HUMAN_TYPES: Record<HumanType, { name: string; nameEn: string; description: string }> = {
  man: { name: '남자', nameEn: 'Man', description: 'adult male human body' },
  woman: { name: '여자', nameEn: 'Woman', description: 'adult female human body' },
  child: { name: '아이', nameEn: 'Child', description: 'child human body' },
};

// 섹션별 설명
export const SECTION_DESCRIPTIONS: Record<BodySection, { name: string; description: string; promptHint: string }> = {
  face: { name: '얼굴', description: '얼굴/머리 부분', promptHint: 'face and head' },
  torso: { name: '몸통', description: '몸통/상체 부분', promptHint: 'torso and body' },
  limbs: { name: '팔다리', description: '팔/다리 부분', promptHint: 'arms and legs' },
  other: { name: '기타', description: '기타(꼬리, 날개, 촉수 등)', promptHint: 'additional features like tail, wings, or tentacles' },
};

// ID가 포함된 생물 정보
export interface CreatureWithId extends Creature {
  id: string;
  category: CreatureCategory;
  categoryName: string;
}

// 플랫 생물 목록 생성 (UI 검색용)
let _flatCreatureList: CreatureWithId[] | null = null;

export function getFlatCreatureList(): CreatureWithId[] {
  if (_flatCreatureList) return _flatCreatureList;
  
  const list: CreatureWithId[] = [];
  const categories = Object.keys(CREATURE_CATEGORIES) as CreatureCategory[];
  
  for (const category of categories) {
    const creatures = CREATURE_CATEGORIES[category];
    creatures.forEach((creature, index) => {
      list.push({
        id: `${category}:${index}`,
        name: creature.name,
        description: creature.description,
        category,
        categoryName: CATEGORY_NAMES[category],
      });
    });
  }
  
  _flatCreatureList = list;
  return list;
}

// ID로 생물 찾기
export function getCreatureById(id: string): CreatureWithId | null {
  const [category, indexStr] = id.split(':');
  const index = parseInt(indexStr, 10);
  
  if (!category || isNaN(index)) return null;
  
  const creatures = CREATURE_CATEGORIES[category as CreatureCategory];
  if (!creatures || index < 0 || index >= creatures.length) return null;
  
  const creature = creatures[index];
  return {
    id,
    name: creature.name,
    description: creature.description,
    category: category as CreatureCategory,
    categoryName: CATEGORY_NAMES[category as CreatureCategory],
  };
}

// 카테고리별 그룹화된 생물 목록 (UI 드롭다운용)
export interface CreatureGroup {
  category: CreatureCategory;
  categoryName: string;
  creatures: CreatureWithId[];
}

export function getGroupedCreatureList(): CreatureGroup[] {
  const categories = Object.keys(CREATURE_CATEGORIES) as CreatureCategory[];
  
  return categories.map(category => ({
    category,
    categoryName: CATEGORY_NAMES[category],
    creatures: CREATURE_CATEGORIES[category].map((creature, index) => ({
      id: `${category}:${index}`,
      name: creature.name,
      description: creature.description,
      category,
      categoryName: CATEGORY_NAMES[category],
    })),
  }));
}

// 생물 목록 (카테고리별)
export const CREATURE_CATEGORIES: CreatureCategories = {
  arthropods: [
    { name: '낙타거미 (Camel Spider)', description: '거대한 턱' },
    { name: '채찍거미 (Whip Spider)', description: '과하게 긴 더듬이 다리' },
    { name: '심해 등각류 (Giant Isopod)', description: '거대한 쥐며느리 형태' },
    { name: '투구게 (Horseshoe Crab)', description: '뒤집었을 때의 다리 구조' },
    { name: '사마귀 (Praying Mantis)', description: '포식자의 팔, 역삼각형 머리' },
    { name: '지네 (Centipede)', description: '수많은 다리의 리듬감' },
    { name: '그리마 (House Centipede)', description: '흩날리는 듯한 다리' },
    { name: '물장군 (Giant Water Bug)', description: '강력한 앞다리' },
    { name: '장수하늘소 유충 (Grub)', description: '비대하고 주름진 몸' },
    { name: '쇠똥구리 (Dung Beetle)', description: '구체를 굴리는 형상' },
    { name: '개미지옥 (Antlion)', description: '모래 속의 턱' },
    { name: '소금쟁이 (Water Strider)', description: '수면 위의 얇은 다리' },
    { name: '말벌 (Hornet)', description: '독침, 잘록한 허리' },
    { name: '바구미 (Weevil)', description: '긴 주둥이' },
    { name: '대벌레 (Stick Insect)', description: '나뭇가지 위장' },
    { name: '매미 유충 (Cicada Nymph)', description: '땅속 굴착용 앞다리' },
    { name: '전갈 (Scorpion)', description: '독침 꼬리' },
    { name: '진드기 (Tick)', description: '피를 빨아 팽창한 몸' },
    { name: '따개비 (Barnacle)', description: '다닥다닥 붙은 군집성' },
    { name: '거미게 (Japanese Spider Crab)', description: '비현실적으로 긴 다리' },
    { name: '집게벌레 (Earwig)', description: '꼬리의 집게' },
    { name: '방아깨비 (Long-headed Grasshopper)', description: '뾰족한 머리' },
    { name: '장수풍뎅이 (Rhinoceros Beetle)', description: '뿔' },
    { name: '사슴벌레 (Stag Beetle)', description: '거대한 턱' },
    { name: '모기 (Mosquito)', description: '흡혈 침' },
    { name: '파리 (Fly)', description: '털 난 다리, 겹눈' },
    { name: '강도래 유충 (Stonefly Nymph)', description: '납작한 몸' },
    { name: '잠자리 유충 (Dragonfly Nymph)', description: '튀어나오는 턱(Mask)' },
    { name: '연가시 (Horsehair Worm)', description: '숙주 조종' },
    { name: '빈대 (Bedbug)', description: '납작하고 붉은 몸' },
    { name: '벼룩 (Flea)', description: '점프에 특화된 다리' },
    { name: '갯강구 (Sea Slater)', description: '바닷가 바퀴벌레' },
    { name: '코코넛크랩 (Coconut Crab)', description: '육상 거대 갑각류' },
    { name: '갯가재 (Mantis Shrimp)', description: '펀치, 복잡한 눈' },
    { name: '농발거미 (Huntsman Spider)', description: '속도감 있는 다리' },
    { name: '타란툴라 (Tarantula)', description: '털북숭이' },
    { name: '잎벌레 (Leaf Beetle)', description: '금속성 광택' },
    { name: '반딧불이 유충 (Firefly Larva)', description: '갑옷 같은 등' },
    { name: '물방개 (Diving Beetle)', description: '유선형 갑각' },
    { name: '송장헤엄치게 (Backswimmer)', description: '배영하는 자세' },
  ],
  deepSea: [
    { name: '아귀 (Anglerfish)', description: '발광체, 거대한 입' },
    { name: '마귀상어 (Goblin Shark)', description: '튀어나오는 턱' },
    { name: '블롭피쉬 (Blobfish)', description: '녹아내린 사람 얼굴' },
    { name: '칠성장어 (Lamprey)', description: '둥근 흡반형 입' },
    { name: '먹장어 (Hagfish)', description: '엄청난 점액' },
    { name: '바이퍼피쉬 (Viperfish)', description: '송곳니' },
    { name: '풍선장어 (Gulper Eel)', description: '몸보다 큰 입' },
    { name: '배럴아이 (Barreleye)', description: '투명한 머리 속의 눈' },
    { name: '산갈치 (Oarfish)', description: '끝없이 긴 몸' },
    { name: '개복치 (Sunfish)', description: '잘린 듯한 몸통' },
    { name: '성게 (Sea Urchin)', description: '가시 덩어리' },
    { name: '해삼 (Sea Cucumber)', description: '내장 배출' },
    { name: '멍게 (Sea Squirt)', description: '기괴한 덩어리' },
    { name: '불가사리 (Starfish)', description: '재생 능력, 중앙의 입' },
    { name: '거대오징어 (Giant Squid)', description: '거대 촉수' },
    { name: '문어 (Octopus)', description: '빨판, 흐물거림' },
    { name: '앵무조개 (Nautilus)', description: '고대 생물 느낌' },
    { name: '가오리 (Stingray)', description: '웃는 듯한 배면(얼굴)' },
    { name: '전기뱀장어 (Electric Eel)', description: '발전 기관' },
    { name: '쏠배감펭 (Lionfish)', description: '화려한 독가시' },
    { name: '곰치 (Moray Eel)', description: '이중 턱' },
    { name: '실러캔스 (Coelacanth)', description: '고대 물고기' },
    { name: '톱상어 (Sawshark)', description: '톱 같은 주둥이' },
    { name: '귀상어 (Hammerhead Shark)', description: '양옆으로 벌어진 머리' },
    { name: '해마 (Seahorse)', description: '말 머리, 꼬리' },
    { name: '나뭇잎해룡 (Leafy Seadragon)', description: '해초 위장' },
    { name: '갑오징어 (Cuttlefish)', description: '최면을 거는 피부 패턴' },
    { name: '늑대장어 (Wolf Eel)', description: '쭈글쭈글한 얼굴' },
    { name: '코끼리조개 (Geoduck)', description: '남근 형태의 수관' },
    { name: '피라니아 (Piranha)', description: '날카로운 이빨' },
    { name: '강거미불가사리 (Brittle Star)', description: '뱀 같은 팔' },
    { name: '갯민숭달팽이 (Nudibranch)', description: '화려한 독성' },
    { name: '청자고둥 (Cone Snail)', description: '독침' },
    { name: '해파리 (Jellyfish)', description: '투명함, 촉수' },
    { name: '고깔해파리 (Man o\' War)', description: '부레' },
    { name: '후악치 (Jawfish)', description: '입속에 알을 품음' },
    { name: '동굴물고기 (Cavefish)', description: '눈이 퇴화된 얼굴' },
    { name: '심해열수구 새우 (Rimicaris)', description: '눈 대신 감각기관' },
    { name: '쿠키커터상어 (Cookiecutter Shark)', description: '동그랗게 살을 파먹음' },
  ],
  reptiles: [
    { name: '마타마타 거북 (Mata Mata)', description: '낙엽 같은 납작한 머리' },
    { name: '악어거북 (Alligator Snapping Turtle)', description: '공룡 같은 등껍질' },
    { name: '뿔도마뱀 (Horned Lizard)', description: '눈에서 피 발사' },
    { name: '목도리도마뱀 (Frilled Lizard)', description: '펼쳐지는 목덜미' },
    { name: '코모도왕도마뱀 (Komodo Dragon)', description: '썩은 침, 거대함' },
    { name: '카멜레온 (Chameleon)', description: '따로 노는 눈, 혀' },
    { name: '가비알 (Gharial)', description: '매우 얇고 긴 주둥이' },
    { name: '아나콘다 (Anaconda)', description: '거대한 덩치' },
    { name: '가분 살무사 (Gaboon Viper)', description: '거대한 독니, 두꺼운 몸' },
    { name: '우파루파 (Axolotl)', description: '외부 아가미' },
    { name: '팩맨 개구리 (Pacman Frog)', description: '거대한 입' },
    { name: '피파개구리 (Surinam Toad)', description: '등 피부 (환공포증)' },
    { name: '독화살개구리 (Poison Dart Frog)', description: '경고색' },
    { name: '바실리스크 도마뱀 (Basilisk Lizard)', description: '물 위를 달림' },
    { name: '장수거북 (Leatherback Turtle)', description: '가죽 등껍질' },
    { name: '자라 (Softshell Turtle)', description: '돼지 코, 물렁한 등' },
    { name: '도롱뇽 (Salamander)', description: '점액질 피부' },
    { name: '무족영원 (Caecilian)', description: '눈 없는 지렁이 같은 양서류' },
    { name: '날개구리 (Flying Frog)', description: '거대한 물갈퀴' },
    { name: '뿔개구리 (Horned Frog)', description: '눈 위의 뿔' },
    { name: '산호뱀 (Coral Snake)', description: '화려한 줄무늬' },
    { name: '킹코브라 (King Cobra)', description: '후드' },
    { name: '방울뱀 (Rattlesnake)', description: '꼬리 소리' },
    { name: '가시꼬리도마뱀 (Thorny Devil)', description: '온몸의 가시' },
    { name: '블루텅 스킨크 (Blue-tongued Skink)', description: '파란 혀' },
    { name: '비어디드 드래곤 (Bearded Dragon)', description: '턱수염 가시' },
    { name: '토케이 게코 (Tokay Gecko)', description: '기괴한 울음소리, 빨판 발' },
    { name: '바다이구아나 (Marine Iguana)', description: '소금기 있는 거친 피부' },
    { name: '갈라파고스 거북 (Galapagos Tortoise)', description: '노인의 주름' },
    { name: '아르마딜로 도마뱀 (Armadillo Girdled Lizard)', description: '꼬리를 무는 방어' },
    { name: '나뭇잎 꼬리 도마뱀 (Leaf-tailed Gecko)', description: '완벽한 위장' },
    { name: '황소개구리 (Bullfrog)', description: '거대한 고막' },
    { name: '유리개구리 (Glass Frog)', description: '투명한 배 (내장 보임)' },
    { name: '투아타라 (Tuatara)', description: '제3의 눈 (정수리)' },
    { name: '늑대거북 (Snapping Turtle)', description: '' },
    { name: '검은 맘바 (Black Mamba)', description: '검은 입안' },
    { name: '바다뱀 (Sea Snake)', description: '납작한 꼬리' },
    { name: '사막 뿔바이퍼 (Horned Viper)', description: '눈 위의 뿔' },
  ],
  birdsMammals: [
    { name: '별코두더지 (Star-nosed Mole)', description: '코의 촉수 (매우 기괴함)' },
    { name: '벌거숭이이더지 (Naked Mole Rat)', description: '털 없는 주름진 피부, 이빨' },
    { name: '아이아이 원숭이 (Aye-aye)', description: '기형적으로 긴 가운뎃손가락' },
    { name: '주름상어 (Frilled Shark)', description: '' },
    { name: '바비루사 (Babirusa)', description: '살을 파고드는 뿔' },
    { name: '오리너구리 (Platypus)', description: '부리, 독침' },
    { name: '넓적부리황새 (Shoebill)', description: '거대한 부리, 무표정' },
    { name: '대머리독수리 (Vulture)', description: '털 없는 머리' },
    { name: '화식조 (Cassowary)', description: '공룡 발톱, 벼슬' },
    { name: '펠리컨 (Pelican)', description: '늘어나는 턱 주머니' },
    { name: '올빼미 (Owl)', description: '뒤로 돌아가는 목' },
    { name: '군함조 (Frigatebird)', description: '부풀어 오르는 붉은 목' },
    { name: '코주부원숭이 (Proboscis Monkey)', description: '늘어진 코' },
    { name: '맥 (Tapir)', description: '짧은 코' },
    { name: '개미핥기 (Anteater)', description: '긴 주둥이, 혀' },
    { name: '나무늘보 (Sloth)', description: '긴 발톱, 이끼 낀 털' },
    { name: '박쥐 (Bat)', description: '가죽 날개, 초음파 코' },
    { name: '스핑크스 고양이 (Sphynx)', description: '털 없는 피부 질감' },
    { name: '하이에나 (Hyena)', description: '구부정한 자세' },
    { name: '호저 (Porcupine)', description: '가시 털' },
    { name: '천산갑 (Pangolin)', description: '솔방울 같은 비늘' },
    { name: '아르마딜로 (Armadillo)', description: '갑옷' },
    { name: '오카피 (Okapi)', description: '기묘한 무늬 조합' },
    { name: '가시두더지 (Echidna)', description: '' },
    { name: '두더지 (Mole)', description: '거대한 땅파기 손' },
    { name: '물개 (Seal)', description: '매끈한 몸통, 지느러미 발' },
    { name: '코뿔소 (Rhinoceros)', description: '피부 각질 뿔' },
    { name: '기린 (Giraffe)', description: '긴 목, 뿔, 보라색 혀' },
    { name: '혹등고래 (Humpback Whale)', description: '따개비가 붙은 턱' },
    { name: '향유고래 (Sperm Whale)', description: '거대한 머리' },
    { name: '일각고래 (Narwhal)', description: '긴 뿔(이빨)' },
    { name: '바다코끼리 (Walrus)', description: '상아, 지방질' },
    { name: '듀공 (Dugong)', description: '인면어 느낌' },
    { name: '키위새 (Kiwi)', description: '날개 없음, 털 같은 깃털' },
    { name: '타조 (Ostrich)', description: '튼실한 다리' },
    { name: '비서새 (Secretarybird)', description: '긴 속눈썹, 뱀 잡는 발' },
    { name: '투칸 (Toucan)', description: '거대하고 화려한 부리' },
    { name: '플라밍고 (Flamingo)', description: '역관절 다리' },
    { name: '마라 (Mara)', description: '설치류인데 사슴 다리' },
    { name: '늑대 (Wolf)', description: '으르렁거리는 주둥이' },
  ],
  parasites: [
    { name: '촌충 (Tapeworm)', description: '마디마디 끊어지는 몸' },
    { name: '거머리 (Leech)', description: '흡반, 피' },
    { name: '지렁이 (Earthworm)', description: '링 구조, 재생' },
    { name: '플라나리아 (Planaria)', description: '재생, 단순한 눈' },
    { name: '곰벌레 (Tardigrade)', description: '6개의 다리, 진공청소기 입' },
    { name: '왕털갯지렁이 (Bobbit Worm)', description: '가위 같은 턱 (바닷속 함정)' },
    { name: '달팽이 (Snail)', description: '점액, 껍질, 더듬이' },
    { name: '민달팽이 (Slug)', description: '끈적임' },
    { name: '회충 (Roundworm)', description: '국수 같은 덩어리' },
    { name: '선모충 (Trichinella)', description: '근육 속 기생' },
    { name: '선충 (Nematode)', description: '' },
    { name: '진드기 알주머니', description: '빽빽함' },
    { name: '구더기 (Maggot)', description: '썩은 살, 군집' },
    { name: '나방파리 유충', description: '검고 작은 벌레' },
    { name: '집먼지진드기', description: '현미경 확대 비주얼' },
    { name: '이 (Louse)', description: '머리카락을 잡는 발' },
    { name: '사면발이 (Crab Louse)', description: '' },
    { name: '옴 진드기 (Scabies)', description: '피부 굴착' },
    { name: '심장사상충 (Heartworm)', description: '심장에 엉킨 실' },
    { name: '군부 (Chiton)', description: '딱지 같은 등' },
    { name: '조개 (Clam)', description: '벌어지는 입, 혀' },
    { name: '맛조개 (Razor Clam)', description: '긴 관' },
    { name: '개불 (Penis Fish)', description: '살색 덩어리' },
    { name: '산호 (Coral)', description: '구멍 숭숭 (폴립)' },
    { name: '해면 (Sponge)', description: '다공성 조직' },
    { name: '히드라 (Hydra)', description: '촉수 재생' },
    { name: '아메바 (Amoeba)', description: '정해지지 않은 형태' },
    { name: '점균류 (Slime Mold)', description: '뻗어나가는 혈관 형태' },
    { name: '동충하초 (Cordyceps)', description: '몸에서 자라나는 버섯' },
    { name: '파리지옥 (Venus Flytrap)', description: '식물이지만 이빨 같음' },
    { name: '끈끈이주걱 (Sundew)', description: '점액 방울' },
    { name: '벌레잡이통풀 (Pitcher Plant)', description: '소화액 통' },
    { name: '라플레시아 (Rafflesia)', description: '거대한 썩은 꽃' },
  ],
};

// 인간 신체 요소
export const HUMAN_BODY_PARTS = [
  '팔 (Arms)',
  '다리 (Legs)',
  '몸통 (Torso)',
  '머리 (Head)',
  '손 (Hands)',
  '발 (Feet)',
  '손가락 (Fingers)',
  '발가락 (Toes)',
  '눈 (Eyes)',
  '입 (Mouth)',
  '이빨 (Teeth)',
];

// 얼굴 관련 요소 (더 자주 선택되도록 가중치 부여)
export const FACIAL_PARTS = [
  '머리 (Head)',
  '눈 (Eyes)',
  '입 (Mouth)',
  '이빨 (Teeth)',
];

// 유틸리티 함수: 배열에서 랜덤 선택
export function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// 유틸리티 함수: 배열 셔플
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 인간 신체 요소 선택 함수 (다양성을 위해 가중치 완화)
export function selectHumanBodyPart(): string {
  // 40% 확률로 얼굴 관련 요소 선택
  if (Math.random() < 0.4) {
    return getRandomItem(FACIAL_PARTS);
  }
  // 60% 확률로 나머지 요소 선택
  return getRandomItem(HUMAN_BODY_PARTS);
}

// 서로 다른 카테고리에서 생물 선택
export function selectRandomCreatures(): SelectedCreature[] {
  const categories = Object.keys(CREATURE_CATEGORIES) as CreatureCategory[];
  const selectedCategories: CreatureCategory[] = [];
  const selectedCreatures: SelectedCreature[] = [];

  // 3~4개 선택
  const count = Math.floor(Math.random() * 2) + 3; // 3 또는 4

  while (selectedCategories.length < count && selectedCategories.length < categories.length) {
    const category = getRandomItem(categories);
    if (!selectedCategories.includes(category)) {
      selectedCategories.push(category);
      const creature = getRandomItem(CREATURE_CATEGORIES[category]);
      selectedCreatures.push({
        category: CATEGORY_NAMES[category],
        creature,
      });
    }
  }

  return selectedCreatures;
}
