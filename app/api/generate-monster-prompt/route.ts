import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 60000; // 60초

// 생물 목록 (카테고리별)
const CREATURE_CATEGORIES = {
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
const HUMAN_BODY_PARTS = [
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
const FACIAL_PARTS = [
  '머리 (Head)',
  '눈 (Eyes)',
  '입 (Mouth)',
  '이빨 (Teeth)',
];

// 인간 신체 요소 선택 함수 (얼굴 관련 요소에 가중치 부여)
function selectHumanBodyPart(): string {
  // 70% 확률로 얼굴 관련 요소 선택
  if (Math.random() < 0.7) {
    return getRandomItem(FACIAL_PARTS);
  }
  // 30% 확률로 나머지 요소 선택
  return getRandomItem(HUMAN_BODY_PARTS);
}

// 랜덤 선택 함수
function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// 서로 다른 카테고리에서 생물 선택
function selectRandomCreatures(): Array<{ category: string; creature: typeof CREATURE_CATEGORIES.arthropods[0] }> {
  const categories = Object.keys(CREATURE_CATEGORIES) as Array<keyof typeof CREATURE_CATEGORIES>;
  const selectedCategories: Array<keyof typeof CREATURE_CATEGORIES> = [];
  const selectedCreatures: Array<{ category: string; creature: typeof CREATURE_CATEGORIES.arthropods[0] }> = [];
  
  // 3~4개 선택
  const count = Math.floor(Math.random() * 2) + 3; // 3 또는 4
  
  while (selectedCategories.length < count && selectedCategories.length < categories.length) {
    const category = getRandomItem(categories);
    if (!selectedCategories.includes(category)) {
      selectedCategories.push(category);
      const creature = getRandomItem(CREATURE_CATEGORIES[category]);
      selectedCreatures.push({
        category: category === 'arthropods' ? '절지동물' : 
                  category === 'deepSea' ? '심해생물' :
                  category === 'reptiles' ? '파충류' :
                  category === 'birdsMammals' ? '조류/포유류' :
                  category === 'parasites' ? '기생충' : category,
        creature,
      });
    }
  }
  
  return selectedCreatures;
}

// 괴수 프롬프트 생성 프롬프트 (선택된 생물 포함)
function createMonsterPromptGenerator(selectedCreatures: Array<{ category: string; creature: typeof CREATURE_CATEGORIES.arthropods[0] }>, includeHuman: boolean, humanPart?: string): string {
  const creaturesList = selectedCreatures.map((sc, idx) => 
    `${idx + 1}. **${sc.category}:** ${sc.creature.name} - ${sc.creature.description}`
  ).join('\n');
  
  const humanPartText = includeHuman && humanPart ? `\n${selectedCreatures.length + 1}. **인간의 신체 요소:** ${humanPart}` : '';
  
  return `당신은 '다크 판타지 크리처 컨셉 아티스트'이자 '전문 프롬프트 엔지니어'입니다.
아래에 **이미 선택된 생물들**을 사용하여 괴수 디자인을 생성하세요:

**선택된 생물:**
${creaturesList}${humanPartText}

선택된 생물들의 특징(턱, 다리, 피부 질감, 눈, 기생 여부 등)을 가장 기괴하고 공포스러운 방식으로 결합하여, 정교한 흑백 펜화 일러스트를 생성하기 위한 **영어 이미지 프롬프트**를 작성해 주세요.

### 작성 규칙:
1. **화풍:** 정교한 펜 선, **라인드로잉(line drawing)만 사용**, 톤(tone)이나 해칭(hatching) 없음, 압도적인 디테일, 흑백(Monochrome), 글씨 금지(Textless). 선의 굵기 변화와 선의 밀도로 명암과 디테일을 표현하되, 크로스 해칭이나 톤 작업은 절대 사용하지 말 것.
2. **표현:** '단순한 결합'을 넘어 생물학적으로 불쾌한 변형(Body Horror), 점액, 근육 조직의 노출, 기생 등을 묘사할 것. 모든 디테일은 선으로만 표현.
3. **비정상적인 기괴함 강조 (매우 중요):**
   - **다중 신체 부위:** 머리, 눈, 손, 발, 팔, 다리 등이 여러 개 있는 비정상적인 형태를 적극적으로 포함하세요. 예: "multiple heads", "extra eyes", "too many hands", "multiple limbs", "extra arms", "too many fingers", "multiple mouths" 등.
   - **예상치 못한 위치의 신체 부위 배치 (극도로 중요):** 신체 부위가 완전히 잘못된 위치에 있는 비정상적인 조합을 적극적으로 포함하세요. 예를 들어:
     * 배나 가슴, 등, 어깨, 무릎 등에 얼굴이나 눈이 있음 ("face on stomach", "eyes on back", "mouth on chest", "face on knee")
     * 손바닥이나 손가락에 눈이나 입이 있음 ("eyes on palms", "mouth on fingers", "eyes on fingertips")
     * 팔이나 다리에 얼굴이 있음 ("face on arm", "face on leg")
     * 등이나 꼬리에 손이나 팔이 있음 ("hands on back", "arms growing from spine")
     * 머리나 목에 손이나 발이 있음 ("hands on head", "feet on neck")
     * 이런 비정상적인 배치는 기괴함의 핵심이므로 반드시 포함하세요.
   - **비대칭성:** 신체 부위가 비대칭적으로 배치되거나, 예상치 못한 위치에 추가 부위가 있는 형태를 강조하세요.
   - **인간 신체 요소의 변형:** 인간의 얼굴, 눈, 입, 손 등이 비정상적으로 많거나, 잘못된 위치에 있거나, 크기가 비정상적인 형태를 포함하세요.
3. **구도:**
   - **배경 없음:** 단색 배경(흰색 또는 검은색)만 사용, 배경 디테일 없음
   - **전신 표시:** 괴수의 머리부터 발끝까지 전체가 보이도록 전신 샷(full body shot)
   - **중앙 배치:** 괴수가 이미지 중앙에 위치하도록 구성
4. **이미지 비율:** 괴수의 형태에 맞는 적절한 비율을 선택하세요:
   - 세로형(portrait): 9:16 또는 2:3 - 키가 크거나 세로로 긴 괴수
   - 정사각형(square): 1:1 - 균형잡힌 형태의 괴수
   - 가로형(landscape): 16:9 또는 3:2 - 넓게 퍼진 형태의 괴수

**중요:** 응답은 반드시 유효한 JSON 형식으로 작성해주세요:
\`\`\`json
{
  "imagePrompt": "실제 생성에 사용할 상세한 영어 프롬프트. 부정 프롬프트 파라미터 --no text, background, scenery 포함",
  "aspectRatio": "9:16 또는 1:1 또는 16:9 중 하나"
}
\`\`\`

- imagePrompt: 실제 이미지 생성에 사용할 영어 프롬프트만 포함 (선택된 모티프나 디자인 컨셉 설명 없이 프롬프트만)
- aspectRatio: "9:16", "1:1", "16:9" 중 하나만 사용

지금 바로 1개의 괴수 디자인을 생성하고 JSON 형식으로 응답해 주세요.`;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[괴수 프롬프트 생성] 요청 시작');

  try {
    if (!GEMINI_API_KEY) {
      console.error('[괴수 프롬프트 생성] GEMINI_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 생물 랜덤 선택
    const selectedCreatures = selectRandomCreatures();
    const includeHuman = Math.random() < 0.85; // 85% 확률로 인간 신체 요소 포함
    const humanPart = includeHuman ? selectHumanBodyPart() : undefined;
    
    console.log('[괴수 프롬프트 생성] 선택된 생물:', {
      creatures: selectedCreatures.map(sc => `${sc.category}: ${sc.creature.name}`),
      includeHuman,
      humanPart,
    });

    // 프롬프트 생성
    const promptText = createMonsterPromptGenerator(selectedCreatures, includeHuman, humanPart);

    console.log('[괴수 프롬프트 생성] Gemini API 호출 시작...');
    const geminiRequestStart = Date.now();

    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    const config = {
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    };

    const model = 'gemini-3-pro-preview';

    const contents = [
      {
        role: 'user' as const,
        parts: [
          {
            text: promptText,
          },
        ],
      },
    ];

    // 재시도 로직
    const maxRetries = 3;
    let lastError: unknown = null;
    let response: Awaited<ReturnType<typeof ai.models.generateContentStream>> | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`[괴수 프롬프트 생성] Gemini API 재시도 ${attempt}/${maxRetries} (${delay}ms 대기 후)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log('[괴수 프롬프트 생성] Gemini API 호출:', {
          model,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
        });

        // 타임아웃 설정
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Gemini API 타임아웃: ${GEMINI_API_TIMEOUT}ms 초과`));
          }, GEMINI_API_TIMEOUT);
        });

        const apiPromise = ai.models.generateContentStream({
          model,
          config,
          contents,
        });

        response = await Promise.race([apiPromise, timeoutPromise]);
        break;
      } catch (error: unknown) {
        lastError = error;
        console.error(`[괴수 프롬프트 생성] Gemini API 호출 실패 (시도 ${attempt + 1}/${maxRetries + 1}):`, {
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt >= maxRetries) {
          throw error;
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Gemini API 응답을 받을 수 없습니다.');
    }

    // 스트림에서 텍스트 수집
    let generatedText = '';
    for await (const chunk of response) {
      if (!chunk.candidates || !chunk.candidates[0]?.content?.parts) {
        continue;
      }

      const parts = chunk.candidates[0].content.parts;

      for (const part of parts) {
        if (part.text) {
          generatedText += part.text;
        }
      }
    }

    const geminiRequestTime = Date.now() - geminiRequestStart;
    console.log('[괴수 프롬프트 생성] Gemini API 응답:', {
      requestTime: `${geminiRequestTime}ms`,
      textLength: generatedText.length,
    });

    if (!generatedText || generatedText.trim().length === 0) {
      console.error('[괴수 프롬프트 생성] 생성된 텍스트가 없음');
      return NextResponse.json(
        { error: '프롬프트 생성에 실패했습니다. 다시 시도해주세요.' },
        { status: 500 }
      );
    }

    // JSON 파싱 시도
    let imagePrompt = '';
    let aspectRatio: string = '1:1';
    const fullText = generatedText.trim();
    
    try {
      // 마크다운 코드 블록에서 JSON 추출 시도
      let jsonText = fullText;
      
      // ```json ... ``` 형식인 경우 추출
      const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/i);
      if (jsonBlockMatch) {
        jsonText = jsonBlockMatch[1].trim();
      } else {
        // ``` ... ``` 형식인 경우 추출
        const codeBlockMatch = fullText.match(/```\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
        }
      }
      
      // JSON 파싱
      const parsed = JSON.parse(jsonText);
      
      if (parsed.imagePrompt && typeof parsed.imagePrompt === 'string') {
        imagePrompt = parsed.imagePrompt.trim();
      }
      
      if (parsed.aspectRatio && typeof parsed.aspectRatio === 'string') {
        const ratio = parsed.aspectRatio.trim();
        // 유효한 비율인지 확인
        if (['9:16', '1:1', '16:9', '2:3', '3:2'].includes(ratio)) {
          aspectRatio = ratio;
        } else {
          console.warn('[괴수 프롬프트 생성] 유효하지 않은 비율:', ratio);
        }
      }
      
      console.log('[괴수 프롬프트 생성] JSON 파싱 성공:', {
        imagePromptLength: imagePrompt.length,
        aspectRatio,
      });
    } catch (jsonError) {
      console.warn('[괴수 프롬프트 생성] JSON 파싱 실패, 텍스트 파싱 시도:', jsonError);
      
      // JSON 파싱 실패 시 기존 텍스트 파싱 방식으로 폴백
      const aspectRatioMatch = fullText.match(/\[이미지 비율\]:?\s*(\d+:\d+)/i);
      if (aspectRatioMatch) {
        aspectRatio = aspectRatioMatch[1];
      }
      
      const imagePromptMatch = fullText.match(/\[Image Prompt\]:?\s*([\s\S]*?)(?=\n\n|\n\[|$)/i);
      if (imagePromptMatch) {
        imagePrompt = imagePromptMatch[1].trim();
        imagePrompt = imagePrompt.replace(/```markdown\s*/g, '').replace(/```\s*/g, '').trim();
        imagePrompt = imagePrompt.replace(/^\/imagine\s+prompt:\s*/i, '').trim();
      } else {
        imagePrompt = fullText;
      }
    }
    
    if (!imagePrompt) {
      console.error('[괴수 프롬프트 생성] Image Prompt를 찾을 수 없음');
      return NextResponse.json(
        { error: '프롬프트 생성에 실패했습니다. Image Prompt를 찾을 수 없습니다.' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[괴수 프롬프트 생성] 생성 완료:', {
      totalTime: `${totalTime}ms`,
      textLength: generatedText.length,
      imagePromptLength: imagePrompt.length,
    });

    return NextResponse.json({
      prompt: fullText,
      imagePrompt: imagePrompt,
      aspectRatio: aspectRatio,
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[괴수 프롬프트 생성] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`,
    });
    const errorMessage = error instanceof Error ? error.message : '프롬프트 생성 중 오류가 발생했습니다.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

