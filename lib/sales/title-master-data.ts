export interface TitleCreator {
  role: '글' | '그림' | '원작' | '컬러' | '각색' | '기타';
  name: string;
}

export type CountryCode = 'kr' | 'jp' | 'us';

export const COUNTRIES: { code: CountryCode; label: string; flag: string }[] = [
  { code: 'kr', label: 'KR', flag: '🇰🇷' },
  { code: 'jp', label: 'JP', flag: '🇯🇵' },
  { code: 'us', label: 'US', flag: '🇺🇸' },
];

export interface CountryPublishing {
  platform?: string;
  title?: string;
  status: '연재중' | '완결' | '미진출' | '계약중' | '준비중';
  startDate?: string;
  endDate?: string;
  episodeCount?: number;
  note?: string;
}

export interface TitleMasterInfo {
  slug: string;
  workId?: string;
  title: string;
  creators: TitleCreator[];
  platform: string;
  dayOfWeek?: string;
  status: '연재중' | '완결' | '휴재';
  startDate: string;
  endDate?: string;
  nonExclusiveDate?: string;
  episodeCount: number;
  ageRating: string;
  mainGenre: string;
  subGenre?: string;
  keywords: string[];
  element: string;
  logline: string;
  thumbnailUrl?: string;
  countryInfo: Record<CountryCode, CountryPublishing>;
  secondaryBiz?: {
    type: '출판' | '드라마' | '영화' | '애니메이션' | '라이선스' | '기타';
    title?: string;
    status: string;
    partner?: string;
    note?: string;
  }[];
  notes?: string;
}

export const TITLE_MASTER_DATA: TitleMasterInfo[] = [
  {
    slug: 'life-or-death',
    title: '인생존망',
    creators: [
      { role: '글', name: '박태준' },
      { role: '그림', name: '전선욱' },
    ],
    platform: '네이버 요일웹툰',
    dayOfWeek: '일요일',
    status: '완결',
    startDate: '2019-11-08',
    endDate: '2020-11-08',
    nonExclusiveDate: '2023-11-08',
    episodeCount: 57,
    ageRating: '15+',
    mainGenre: '드라마',
    subGenre: '액션',
    keywords: ['드라마', '시간여행', '속죄', '성장', '우정'],
    element:
      '왕년에 일진이었던 장안철, 찐따 김진우의 고등학교 시절 몸에서 깨어나면서, 인생을 리셋하기 위한 싸움이 시작된다.',
    logline:
      '학교 폭력으로 깊은 상처를 입은 김진우는 말더듬이가 되고 자존감도 무너진 채 살아간다. 그는 성공과 복수의 꿈만을 붙잡고 버틴다. 하지만 아르바이트하는 가게의 주인이 과거 자신을 괴롭힌 최악의 양아치 안철 장이라는 사실을 알게 되면서, 그들의 조롱에 분개해 무모하게 추락하고 만다.\n\n그 순간, 기묘한 일이 벌어진다. 스물한 살의 안철의 영혼이 과거 고등학교 2학년, 열여덟 살 진우의 몸 속으로 들어온 것이다. 진우의 저주에 묶인 그는, 진우의 미래를 망쳐놓은 네 가지 사건을 되돌리고 동시에 자신이었던 괴물 같은 소년을 갱생시켜야만 한다.',
    countryInfo: {
      kr: {
        platform: '네이버 웹툰',
        title: '인생존망',
        status: '완결',
        startDate: '2019-11-08',
        endDate: '2020-11-08',
        episodeCount: 57,
      },
      jp: { status: '미진출' },
      us: { status: '미진출' },
    },
    secondaryBiz: [],
    notes: '',
  },
];

export function getTitleBySlug(slug: string): TitleMasterInfo | undefined {
  return TITLE_MASTER_DATA.find((t) => t.slug === slug);
}
