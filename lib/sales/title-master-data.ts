export interface TitleCreator {
  role: '글/그림' | '글' | '그림' | '원작';
  name: string;
}

export type GlobalCountryCode = 'us' | 'jp' | 'id' | 'fr' | 'tw' | 'th' | 'de' | 'es' | 'cn';

export const GLOBAL_COUNTRIES: { code: GlobalCountryCode; label: string; flag: string }[] = [
  { code: 'us', label: '북미', flag: '🇺🇸' },
  { code: 'jp', label: '일본', flag: '🇯🇵' },
  { code: 'id', label: '인도네시아', flag: '🇮🇩' },
  { code: 'fr', label: '프랑스', flag: '🇫🇷' },
  { code: 'tw', label: '대만', flag: '🇹🇼' },
  { code: 'th', label: '태국', flag: '🇹🇭' },
  { code: 'de', label: '독일', flag: '🇩🇪' },
  { code: 'es', label: '스페인', flag: '🇪🇸' },
  { code: 'cn', label: '중국', flag: '🇨🇳' },
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

export type TitleStatus = '연재중' | '완결' | '휴재' | '준비중';
export type SerialType = '요일웹툰' | '매일+' | '기타';
export type DayOfWeek = '월요일' | '화요일' | '수요일' | '목요일' | '금요일' | '토요일' | '일요일';
export type TeamLabel = '팀 박태준' | '팀 병장' | '팀 유호빈' | 'MUTE' | 'MAJOR' | '팀 꿀빨' | '팀 숭늉' | '전략기획팀' | '그 외';
export const TEAM_LABELS: TeamLabel[] = ['팀 박태준', '팀 병장', '팀 유호빈', 'MUTE', 'MAJOR', '팀 꿀빨', '팀 숭늉', '전략기획팀', '그 외'];

export type SecondaryBizCategory = '출판' | '드라마' | '영화' | '애니메이션' | '그 외';

export interface SecondaryBizItem {
  category: SecondaryBizCategory;
  title?: string;
  status: string;
  partner?: string;
  note?: string;
}

export interface TitleMasterInfo {
  slug: string;
  workId?: string;
  title: string;
  titleUrl?: string;
  teamLabel?: TeamLabel;
  status: TitleStatus;
  creators: TitleCreator[];
  platform: string;
  serialType: SerialType;
  dayOfWeek?: DayOfWeek;
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
  globalInfo: Partial<Record<GlobalCountryCode, CountryPublishing>>;
  secondaryBiz: SecondaryBizItem[];
  notes: string;
}

// ─── DB 캐시 기반 동기 함수 ───

let _titlesCache: TitleMasterInfo[] = [];

export function getAllTitles(): TitleMasterInfo[] {
  return _titlesCache;
}

export function getTitleBySlug(slug: string): TitleMasterInfo | undefined {
  return _titlesCache.find((t) => t.slug === slug);
}

export function getAllTitleBySlug(slug: string): TitleMasterInfo | undefined {
  return _titlesCache.find((t) => t.slug === slug);
}

function normalize(s: string): string {
  return s.replace(/[\s\-_:!?·.,()（）\[\]【】]/g, '').toLowerCase();
}

const slugByNameCache: Record<string, string | null> = {};

export function getSlugByWorkName(workName: string): string | null {
  if (workName in slugByNameCache) return slugByNameCache[workName];

  const allTitles = getAllTitles();
  const norm = normalize(workName);
  for (const t of allTitles) {
    if (normalize(t.title) === norm) {
      slugByNameCache[workName] = t.slug;
      return t.slug;
    }
  }
  for (const t of allTitles) {
    if (normalize(t.title).includes(norm) || norm.includes(normalize(t.title))) {
      slugByNameCache[workName] = t.slug;
      return t.slug;
    }
  }
  slugByNameCache[workName] = null;
  return null;
}

// ─── API 기반 함수 ───
import { settlementFetch } from '@/lib/settlement/api';

const API_BASE = '/api/accounting/sales/master/titles';

function dbToFrontend(row: Record<string, unknown>): TitleMasterInfo {
  return {
    slug: row.slug as string,
    title: row.title as string,
    status: row.status as TitleStatus,
    creators: (row.creators || []) as TitleCreator[],
    platform: (row.platform || '') as string,
    teamLabel: row.team_label as TeamLabel | undefined,
    serialType: (row.serial_type || '기타') as SerialType,
    dayOfWeek: row.day_of_week as DayOfWeek | undefined,
    startDate: (row.start_date || '') as string,
    endDate: row.end_date as string | undefined,
    nonExclusiveDate: row.non_exclusive_date as string | undefined,
    episodeCount: (row.episode_count || 0) as number,
    ageRating: (row.age_rating || '전체') as string,
    mainGenre: (row.main_genre || '기타') as string,
    subGenre: row.sub_genre as string | undefined,
    keywords: (row.keywords || []) as string[],
    element: (row.element || '') as string,
    logline: (row.logline || '') as string,
    thumbnailUrl: row.thumbnail_url as string | undefined,
    titleUrl: row.title_url as string | undefined,
    globalInfo: (row.global_info || {}) as Record<string, CountryPublishing>,
    secondaryBiz: (row.secondary_biz || []) as SecondaryBizItem[],
    notes: (row.notes || '') as string,
    workId: row.work_id as string | undefined,
  };
}

function frontendToDb(data: Partial<TitleMasterInfo>): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  if (data.slug !== undefined) map.slug = data.slug;
  if (data.title !== undefined) map.title = data.title;
  if (data.status !== undefined) map.status = data.status;
  if (data.creators !== undefined) map.creators = data.creators;
  if (data.platform !== undefined) map.platform = data.platform;
  if (data.teamLabel !== undefined) map.teamLabel = data.teamLabel;
  if (data.serialType !== undefined) map.serialType = data.serialType;
  if (data.dayOfWeek !== undefined) map.dayOfWeek = data.dayOfWeek;
  if (data.startDate !== undefined) map.startDate = data.startDate || null;
  if (data.endDate !== undefined) map.endDate = data.endDate || null;
  if (data.nonExclusiveDate !== undefined) map.nonExclusiveDate = data.nonExclusiveDate || null;
  if (data.episodeCount !== undefined) map.episodeCount = data.episodeCount;
  if (data.ageRating !== undefined) map.ageRating = data.ageRating;
  if (data.mainGenre !== undefined) map.mainGenre = data.mainGenre;
  if (data.subGenre !== undefined) map.subGenre = data.subGenre;
  if (data.keywords !== undefined) map.keywords = data.keywords;
  if (data.element !== undefined) map.element = data.element;
  if (data.logline !== undefined) map.logline = data.logline;
  if (data.thumbnailUrl !== undefined) map.thumbnailUrl = data.thumbnailUrl;
  if (data.titleUrl !== undefined) map.titleUrl = data.titleUrl;
  if (data.globalInfo !== undefined) map.globalInfo = data.globalInfo;
  if (data.secondaryBiz !== undefined) map.secondaryBiz = data.secondaryBiz;
  if (data.notes !== undefined) map.notes = data.notes;
  return map;
}

function generateSlug(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const suffix = Date.now().toString(36);
  return ascii ? `${ascii}-${suffix}` : `title-${suffix}`;
}

export async function fetchAllTitlesFromDB(): Promise<TitleMasterInfo[]> {
  const res = await settlementFetch(API_BASE);
  if (!res.ok) return _titlesCache;
  const json = await res.json();
  const rows = json.titles || json;
  const titles = (Array.isArray(rows) ? rows : []).map(dbToFrontend);
  _titlesCache = titles;
  Object.keys(slugByNameCache).forEach((k) => delete slugByNameCache[k]);
  return titles;
}

export async function fetchTitleBySlug(slug: string): Promise<TitleMasterInfo | null> {
  const res = await settlementFetch(`${API_BASE}/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return dbToFrontend(json.title || json);
}

export async function createTitleInDB(partial: {
  title: string;
  creators: TitleCreator[];
  status: TitleStatus;
  platform: string;
  teamLabel?: TeamLabel;
  serialType?: SerialType;
  dayOfWeek?: DayOfWeek;
  mainGenre?: string;
  ageRating?: string;
}): Promise<TitleMasterInfo> {
  const slug = generateSlug(partial.title);
  const body = frontendToDb({
    slug,
    title: partial.title,
    status: partial.status,
    creators: partial.creators,
    platform: partial.platform,
    teamLabel: partial.teamLabel,
    serialType: partial.serialType || '기타',
    dayOfWeek: partial.dayOfWeek,
    startDate: new Date().toISOString().slice(0, 10),
    episodeCount: 0,
    ageRating: partial.ageRating || '전체',
    mainGenre: partial.mainGenre || '기타',
  });
  const res = await settlementFetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `등록 실패 (${res.status})`);
  }
  const json = await res.json();
  Object.keys(slugByNameCache).forEach((k) => delete slugByNameCache[k]);
  return dbToFrontend(json.title || json);
}

export async function updateTitleInDB(slug: string, data: Partial<TitleMasterInfo>): Promise<TitleMasterInfo> {
  const body = frontendToDb(data);
  const res = await settlementFetch(`${API_BASE}/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to update title: ${res.status}`);
  const json = await res.json();
  Object.keys(slugByNameCache).forEach((k) => delete slugByNameCache[k]);
  return dbToFrontend(json.title || json);
}

export async function upsertTitleToDB(slug: string, data: TitleMasterInfo): Promise<TitleMasterInfo> {
  const body = frontendToDb(data);
  const putRes = await settlementFetch(`${API_BASE}/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (putRes.ok) {
    const json = await putRes.json();
    Object.keys(slugByNameCache).forEach((k) => delete slugByNameCache[k]);
    return dbToFrontend(json.title || json);
  }
  const postBody = { ...body, slug };
  const postRes = await settlementFetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postBody),
  });
  if (!postRes.ok) throw new Error(`Failed to upsert title: ${postRes.status}`);
  const json = await postRes.json();
  Object.keys(slugByNameCache).forEach((k) => delete slugByNameCache[k]);
  return dbToFrontend(json.title || json);
}

export async function deleteTitleFromDB(slug: string): Promise<void> {
  const res = await settlementFetch(`${API_BASE}/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete title: ${res.status}`);
  Object.keys(slugByNameCache).forEach((k) => delete slugByNameCache[k]);
}
