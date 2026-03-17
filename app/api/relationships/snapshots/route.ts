import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const webtoonId = searchParams.get('webtoon_id');
    const episodeId = searchParams.get('episode_id');
    const listEpisodes = searchParams.get('list_episodes');

    if (!webtoonId) {
      return NextResponse.json(
        { error: 'webtoon_id is required' },
        { status: 400 }
      );
    }

    // Return episodes list + which ones have changes
    if (listEpisodes) {
      const { data: episodes } = await supabase
        .from('episodes')
        .select('id, episode_number, title')
        .eq('webtoon_id', webtoonId)
        .order('episode_number', { ascending: true });

      const { data: snapshots } = await supabase
        .from('relationship_snapshots')
        .select('episode_id')
        .in('episode_id', (episodes || []).map(e => e.id));

      const changedEpisodeIds = [...new Set((snapshots || []).map(s => s.episode_id))];

      return NextResponse.json({
        episodes: episodes || [],
        changed_episode_ids: changedEpisodeIds,
      });
    }

    if (!episodeId) {
      return NextResponse.json(
        { error: 'episode_id is required' },
        { status: 400 }
      );
    }

    // Try to find snapshots for the exact episode
    const { data: snapshots, error } = await supabase
      .from('relationship_snapshots')
      .select('*')
      .eq('episode_id', episodeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If snapshots exist for this episode, return them
    if (snapshots && snapshots.length > 0) {
      return NextResponse.json(snapshots);
    }

    // Otherwise, find the nearest previous episode's snapshots
    // First, get the current episode's order info
    const { data: currentEpisode } = await supabase
      .from('episodes')
      .select('episode_number')
      .eq('id', episodeId)
      .single();

    if (!currentEpisode) {
      return NextResponse.json([]);
    }

    // Find the nearest previous episode that has snapshots
    const { data: previousEpisodes } = await supabase
      .from('episodes')
      .select('id, episode_number')
      .eq('webtoon_id', webtoonId)
      .lt('episode_number', currentEpisode.episode_number)
      .order('episode_number', { ascending: false });

    if (!previousEpisodes || previousEpisodes.length === 0) {
      return NextResponse.json([]);
    }

    // Check each previous episode for snapshots, starting from the nearest
    for (const episode of previousEpisodes) {
      const { data: prevSnapshots } = await supabase
        .from('relationship_snapshots')
        .select('*')
        .eq('episode_id', episode.id);

      if (prevSnapshots && prevSnapshots.length > 0) {
        return NextResponse.json(prevSnapshots);
      }
    }

    return NextResponse.json([]);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch relationship snapshots' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      relationship_id,
      episode_id,
      relationship_type,
      label,
      direction,
      intensity,
      tension,
      change_reason,
    } = body;

    if (!relationship_id || !episode_id || !relationship_type) {
      return NextResponse.json(
        { error: 'relationship_id, episode_id, and relationship_type are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('relationship_snapshots')
      .insert({
        relationship_id,
        episode_id,
        relationship_type,
        label: label ?? null,
        direction: direction ?? null,
        intensity: intensity ?? null,
        tension: tension ?? null,
        change_reason: change_reason ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create relationship snapshot' },
      { status: 500 }
    );
  }
}
