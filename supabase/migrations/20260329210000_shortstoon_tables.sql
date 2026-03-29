-- shortstoon: 독립 운영 (webtoonanimation과 별개)

CREATE TABLE shortstoon_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  aspect_ratio TEXT DEFAULT '9:16',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE shortstoon_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shortstoon_project_id UUID REFERENCES shortstoon_projects(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,

  -- 원본 이미지 (직접 업로드)
  image_path TEXT NOT NULL,
  image_url  TEXT NOT NULL,
  file_name  TEXT NOT NULL,

  -- 뷰포트: 9:16 출력 기준 어떤 영역을 보여줄지
  -- scale 1.0 = 이미지가 1080x1920을 cover하는 최소 배율
  -- offset_x/y: 0~1, 0.5 = 중앙
  viewport JSONB NOT NULL DEFAULT '{"scale":1.0,"offset_x":0.5,"offset_y":0.5}',

  -- 효과
  effect_type TEXT NOT NULL DEFAULT 'none',
  -- none | scroll_h | scroll_v | zoom_in | zoom_out | shake | flash | ai_motion
  effect_params JSONB NOT NULL DEFAULT '{}',

  duration_ms INTEGER NOT NULL DEFAULT 3000,

  -- 트랜지션 (이 블록 → 다음 블록)
  transition_type TEXT NOT NULL DEFAULT 'none',
  -- none | fade | fadeblack | fadewhite | slideleft | slidedown | zoom
  transition_duration_ms INTEGER NOT NULL DEFAULT 500,

  -- 렌더링 결과
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | rendering | completed | failed
  video_url  TEXT,
  video_path TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shortstoon_blocks_project ON shortstoon_blocks(shortstoon_project_id, order_index);
