import { notFound, redirect } from 'next/navigation';
import { getEpisodeWithCuts } from '@/lib/api/episodes';
import { CutListPage } from '@/components/CutListPage';

interface PageProps {
  params: Promise<{ webtoonId: string; episodeId: string }>;
}

export default async function EpisodeDetailPage({ params }: PageProps) {
  const { webtoonId, episodeId } = await params;
  const episode = await getEpisodeWithCuts(episodeId);

  if (!episode) {
    notFound();
  }

  // 컷이 있으면 첫 번째 컷으로 리다이렉트
  if (episode.cuts && episode.cuts.length > 0) {
    const firstCut = episode.cuts[0];
    redirect(`/webtoons/${webtoonId}/episodes/${episodeId}/cuts/${firstCut.id}`);
  }

  // 컷이 없으면 컷 목록만 표시 (컷 생성 가능하도록)
  return <CutListPage episode={episode} />;
}

