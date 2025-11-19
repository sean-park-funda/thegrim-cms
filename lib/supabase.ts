import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 생성
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// 타입 정의
export interface Webtoon {
  id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Episode {
  id: string;
  webtoon_id: string;
  episode_number: number;
  title: string;
  description?: string;
  status: string;
  created_at: string;
  updated_at: string;
  files_count?: number;
}

export interface Cut {
  id: string;
  episode_id: string;
  cut_number: number;
  title?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  files_count?: number;
}

export interface Process {
  id: string;
  name: string;
  description?: string;
  order_index: number;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface File {
  id: string;
  cut_id: string;
  process_id: string;
  file_name: string;
  file_path: string;
  storage_path: string;
  thumbnail_path?: string | null;
  file_size?: number;
  file_type?: string;
  mime_type?: string;
  description?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// 관계형 타입
export interface WebtoonWithEpisodes extends Webtoon {
  episodes?: Episode[];
}

export interface EpisodeWithCuts extends Episode {
  cuts?: Cut[];
}

export interface CutWithFiles extends Cut {
  files?: (File & { process?: Process })[];
}

export interface FileWithRelations extends File {
  cut?: Cut & {
    episode?: Episode & {
      webtoon?: Webtoon;
    };
  };
  process?: Process;
}


