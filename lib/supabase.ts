import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 생성
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: true,
    detectSessionInUrl: typeof window !== 'undefined',
    // 세션 새로고침 간격 최적화
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  // 네트워크 요청 최적화
  global: {
    fetch: (url, options = {}) => {
      // AbortController로 타임아웃 구현 (브라우저 호환성)
      const controller = new AbortController();
      // 타임아웃 30초로 완화 (5초는 너무 짧아서 세션 불안정 유발)
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      return fetch(url, {
        ...options,
        // Keep-Alive로 연결 재사용
        keepalive: true,
        // 타임아웃 설정 (30초)
        signal: options.signal || controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId);
      });
    },
  },
});

// 타입 정의
export interface Webtoon {
  id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  status: string;
  unit_type?: 'cut' | 'page';
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
  thumbnail_url?: string | null;
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
  cut_id: string | null;
  process_id: string | null;
  file_name: string;
  file_path: string;
  storage_path: string;
  thumbnail_path?: string | null;
  file_size?: number;
  file_type?: string;
  mime_type?: string;
  description?: string;
  metadata?: Record<string, any>;
  prompt?: string | null;
  created_by?: string;
  source_file_id?: string;
  is_temp?: boolean;
  is_public?: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'staff' | 'viewer' | 'accountant';
  name?: string;
  default_ai_image_public?: boolean;
  created_at: string;
  updated_at: string;
}

// 관계형 타입
export interface WebtoonWithEpisodes extends Webtoon {
  episodes?: Episode[];
}

export interface EpisodeWithCuts extends Episode {
  cuts?: Cut[];
  webtoon?: Webtoon;
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
  created_by_user?: UserProfile;
  source_file?: File;
}

export interface ReferenceFile {
  id: string;
  webtoon_id: string;
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
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReferenceFileWithProcess extends ReferenceFile {
  process?: Process;
}

// 캐릭터 폴더 타입
export interface CharacterFolder {
  id: string;
  webtoon_id: string;
  name: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

// 캐릭터 폴더와 캐릭터 수 포함 타입
export interface CharacterFolderWithCount extends CharacterFolder {
  character_count: number;
}

// 캐릭터 타입
export interface Character {
  id: string;
  webtoon_id: string;
  folder_id?: string | null;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// 캐릭터 시트 타입
export interface CharacterSheet {
  id: string;
  character_id: string;
  file_name: string;
  file_path: string;
  storage_path: string;
  thumbnail_path?: string | null;
  file_size?: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

// 캐릭터와 시트 포함 타입
export interface CharacterWithSheets extends Character {
  character_sheets?: CharacterSheet[];
}

export interface AiRegenerationPrompt {
  id: string;
  style_id: string;
  prompt_text: string;
  prompt_name: string;
  created_by?: string | null;
  is_shared: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// API 제공자 타입
export type ApiProvider = 'gemini' | 'seedream' | 'auto';

// AI 재생성 스타일 타입
export interface AiRegenerationStyle {
  id: string;
  name: string;
  style_key: string;
  prompt: string;
  default_count: number;
  allow_multiple: boolean;
  api_provider: ApiProvider;
  requires_reference: 'required' | 'optional' | null;
  group_name: string | null;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 스타일 생성/수정용 입력 타입
export interface AiRegenerationStyleInput {
  name: string;
  style_key: string;
  prompt: string;
  default_count?: number;
  allow_multiple?: boolean;
  api_provider?: ApiProvider;
  requires_reference?: 'required' | 'optional' | null;
  group_name?: string | null;
  order_index?: number;
  is_active?: boolean;
}

// 자유창작 세션 타입
export interface FreeCreationSession {
  id: string;
  webtoon_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// 자유창작 세션 (통계 정보 포함)
export interface FreeCreationSessionWithStats extends FreeCreationSession {
  owner_name?: string;
  message_count?: number;
  latest_thumbnails?: string[];
}

// 자유창작 메시지 상태
export type FreeCreationMessageStatus = 'pending' | 'generating' | 'completed' | 'error';

// 자유창작 메시지 타입
export interface FreeCreationMessage {
  id: string;
  session_id: string;
  prompt: string;
  reference_file_ids: string[];
  generated_file_id: string | null;
  api_provider: ApiProvider;
  aspect_ratio: string;
  status: FreeCreationMessageStatus;
  error_message: string | null;
  created_by?: string | null;
  created_at: string;
}

// 자유창작 메시지 (관계 포함)
export interface FreeCreationMessageWithFile extends FreeCreationMessage {
  generated_file?: File;
  reference_files?: ReferenceFile[];
}

// 자유창작 최근 레퍼런스 타입
export interface FreeCreationRecentReference {
  id: string;
  session_id: string;
  reference_file_id: string;
  created_by?: string | null;
  used_at: string;
}

// 자유창작 최근 레퍼런스 (관계 포함)
export interface FreeCreationRecentReferenceWithFile extends FreeCreationRecentReference {
  reference_file?: ReferenceFile;
}

// 웹툰 애니메이션 타입
export interface WebtoonAnimationProject {
  id: string;
  title: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  character_settings?: Record<string, string> | null;
  character_ref_url?: string | null;
}

export interface WebtoonAnimationCut {
  id: string;
  project_id: string;
  order_index: number;
  file_name: string;
  file_path: string;
  storage_path: string;
  created_at: string;
  cut_synopsis?: string | null;
  frame_strategy?: string | null;
  gemini_colorize_prompt?: string | null;
  gemini_colorize_prompt_ko?: string | null;
  gemini_expand_prompt?: string | null;
  gemini_expand_prompt_ko?: string | null;
  gemini_start_frame_prompt?: string | null;
  gemini_other_frame_prompt_ko?: string | null;
  video_prompt?: string | null;
  video_prompt_ko?: string | null;
  frame_role?: 'start' | 'end' | 'middle' | null;
  use_colorize?: boolean | null;
  aspect_ratio?: string | null;
  color_image_url?: string | null;
  end_frame_url?: string | null;
  start_frame_url?: string | null;
  comfyui_video_url?: string | null;
}

export interface WebtoonAnimationPromptGroup {
  id: string;
  project_id: string;
  range_start: number;
  range_end: number;
  storyboard_image_path?: string | null;
  aspect_ratio: string;
  seedance_prompt?: string | null;
  video_duration?: number | null;
  created_at: string;
}

export interface WebtoonAnimationCutPrompt {
  id: string;
  group_id: string;
  cut_index: number;
  prompt: string;
  camera?: string | null;
  continuity: string;
  duration: number; // 초 단위 (0.5 ~ 12)
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebtoonAnimationPromptGroupWithCuts extends WebtoonAnimationPromptGroup {
  cut_prompts?: WebtoonAnimationCutPrompt[];
}

export interface WebtoonAnimationVideoTest {
  id: string;
  project_id: string;
  provider: string;
  input_mode: string;
  prompt: string;
  input_cut_indices: number[];
  duration_seconds: number;
  aspect_ratio: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  video_path: string | null;
  video_url: string | null;
  error_message: string | null;
  elapsed_ms: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WebtoonAnimationVideoSegment {
  id: string;
  group_id: string;
  segment_index: number;
  start_cut_index: number;
  end_cut_index: number | null;
  prompt: string;
  api_provider: string;
  duration_seconds: number;
  aspect_ratio: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  video_path: string | null;
  video_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// 무빙웹툰 타입
export type MovingWebtoonMotionType = 'lip_sync' | 'blink' | 'breathing' | 'hair' | 'custom';

export interface MovingWebtoonProject {
  id: string;
  project_id: string;
  default_provider: string;
  default_motion_type: MovingWebtoonMotionType;
  default_prompt_preset: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovingWebtoonCut {
  id: string;
  moving_project_id: string;
  cut_id: string | null;
  order_index: number;
  motion_type: MovingWebtoonMotionType;
  prompt: string | null;
  provider: string | null;
  duration_seconds: number;
  aspect_ratio: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  video_path: string | null;
  video_url: string | null;
  error_message: string | null;
  elapsed_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface MovingWebtoonCutWithImage extends MovingWebtoonCut {
  cut?: WebtoonAnimationCut;
}

export const MOTION_TYPE_PRESETS: Record<MovingWebtoonMotionType, { label: string; prompt: string }> = {
  lip_sync: {
    label: '입 움직임',
    prompt: 'A still webtoon panel that barely moves. The character keeps his exact facial expression and eye shape — do NOT change the eyes at all. The ONLY motion is lips parting very slightly open and closed as if saying a few quiet words. No eye movement, no blink, no head turn, no camera shift. Preserve the original manhwa illustration style perfectly.',
  },
  blink: {
    label: '눈 깜빡임',
    prompt: 'A still webtoon panel with almost zero movement. The ONLY animation is a single slow eye blink — eyes close gently then reopen to the exact same expression. No head movement, no body movement, no mouth movement, no camera shift. Preserve the original manhwa illustration style perfectly.',
  },
  breathing: {
    label: '호흡',
    prompt: 'A still webtoon panel with the character showing very subtle breathing motion — gentle chest rise and fall. Everything else is completely frozen: no eye movement, no head turn, no mouth movement, no camera shift. Preserve the original manhwa illustration style perfectly.',
  },
  hair: {
    label: '머리카락 흔들림',
    prompt: 'A still webtoon panel where only the character hair sways very gently as if from a light breeze. Face, body, eyes, mouth are all completely frozen. No camera movement, no background change. Preserve the original manhwa illustration style perfectly.',
  },
  custom: {
    label: '커스텀',
    prompt: '',
  },
};
