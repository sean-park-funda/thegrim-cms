import { notFound } from 'next/navigation';
import { getWebtoonWithEpisodes } from '@/lib/api/webtoons';
import { EpisodeList } from '@/components/EpisodeList';

interface PageProps {
  params: Promise<{ webtoonId: string }>;
}

export default async function WebtoonDetailPage({ params }: PageProps) {
  const { webtoonId } = await params;
  const webtoon = await getWebtoonWithEpisodes(webtoonId);

  if (!webtoon) {
    notFound();
  }

  return (
    <EpisodeList webtoon={webtoon} />
  );
}

