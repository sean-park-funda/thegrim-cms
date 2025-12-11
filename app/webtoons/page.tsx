import { getWebtoons } from '@/lib/api/webtoons';
import { WebtoonList } from '@/components/WebtoonList';

export default async function WebtoonsPage() {
  const webtoons = await getWebtoons();

  return <WebtoonList initialWebtoons={webtoons} />;
}

