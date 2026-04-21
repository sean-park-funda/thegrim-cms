# 쇼츠툰 렌더링 — 5090 PC 방식 설계

## 왜 Vercel에서 안 되는가

| 제약 | 내용 |
|------|------|
| FFmpeg 없음 | Vercel 런타임에 FFmpeg 미포함. ffmpeg-static 번들 시 함수 크기 ~70MB |
| 타임아웃 | Serverless 함수 최대 60초 (Pro) — 고해상도 영상은 초과 |
| 비용 | 인코딩 시간만큼 함수 실행 시간 과금 |

---

## 목표 구조

```
클라이언트 (브라우저)
  │
  ├─► POST /api/shortstoon/render   (Vercel)
  │     ├─ DB status → 'rendering'
  │     └─► POST https://api.rewardpang.com/thegrim-cms/ffmpeg/render-cut
  │               (Lightsail, 비동기 처리 시작)
  │               └─► FFmpeg 실행 (Lightsail 또는 5090 선택)
  │                     └─► Supabase Storage 업로드
  │                           └─► DB status → 'completed' + video_url
  │
  └─► 2초마다 GET /api/shortstoon/blocks/{blockId} 폴링
        └─ status = 'completed' 되면 video_url로 영상 표시
```

---

## FFmpeg 실행 위치 — 2가지 옵션

### Option A: Lightsail에서 실행 (CPU)

```
Lightsail (Ubuntu)
  └─ apt install ffmpeg 으로 설치
  └─ CPU로 libx264 인코딩
  └─ 예상 시간: 5초 영상 기준 약 10~20초
```

**장점**: 구현 간단, 추가 인프라 불필요
**단점**: CPU 인코딩 느림, Lightsail 자원 소모

---

### Option B: 5090 PC에서 실행 (NVENC GPU)

```
Lightsail (Ubuntu)
  └─► SSH → 5090 PC (Windows, 100.79.136.74)
              └─ ffmpeg.exe -hwaccel cuda -c:v h264_nvenc
              └─ 예상 시간: 5초 영상 기준 약 1~3초
```

**장점**: RTX 5090 NVENC 하드웨어 가속, 압도적 속도
**단점**: SSH 경유 구조, Windows 경로 처리 필요

**추천: Option A로 먼저 구현, 속도 이슈 생기면 B로 전환**

---

## Lightsail 신규 엔드포인트 설계

### `POST /thegrim-cms/ffmpeg/render-cut`

Lightsail의 FastAPI 서버에 새 라우터 추가.

**요청 (JSON)**
```json
{
  "block_id": "uuid",
  "image_url": "https://...supabase.../input.jpg",
  "viewport": { "scale": 1.2, "offset_x": 0.5, "offset_y": 0.5 },
  "effect_type": "scroll_v",
  "effect_params": { "direction": "up", "amount": 0.5 },
  "duration_ms": 3000,
  "project_id": "uuid",
  "supabase_url": "https://xxx.supabase.co",
  "supabase_key": "service_role_key"
}
```

**응답 (즉시)**
```json
{ "accepted": true, "block_id": "uuid" }
```

→ Lightsail은 백그라운드 태스크(`BackgroundTasks`)로 처리 후 즉시 202 응답
→ 완료 시 Lightsail이 직접 DB 업데이트

---

## Vercel 쪽 변경

### `/api/shortstoon/render/route.ts`

기존의 FFmpeg 직접 실행 로직 → Lightsail 릴레이 호출로 교체

```typescript
export async function POST(request: NextRequest) {
  const { blockId } = await request.json();

  // 블록 조회
  const { data: block } = await supabase
    .from('shortstoon_blocks').select('*').eq('id', blockId).single();

  // DB status → rendering
  await supabase.from('shortstoon_blocks')
    .update({ status: 'rendering', updated_at: new Date().toISOString() })
    .eq('id', blockId);

  // Lightsail에 렌더링 위임 (fire & forget)
  const relayUrl = process.env.COMFYUI_RELAY_URL; // 기존 환경변수 재사용
  fetch(`${relayUrl}/ffmpeg/render-cut`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      block_id: blockId,
      image_url: block.image_url,
      viewport: block.viewport,
      effect_type: block.effect_type,
      effect_params: block.effect_params,
      duration_ms: block.duration_ms,
      project_id: block.shortstoon_project_id,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabase_key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }),
  }); // await 없음 — 즉시 반환

  // 현재 블록 상태(rendering) 반환
  return NextResponse.json({ ...block, status: 'rendering' });
}
```

### 폴링 API 추가: `/api/shortstoon/blocks/[id]/route.ts`

```typescript
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data: block } = await supabase
    .from('shortstoon_blocks').select('*').eq('id', params.id).single();
  return NextResponse.json(block);
}
```

### 클라이언트 폴링 (page.tsx)

```typescript
const handleRender = async (blockId: string) => {
  setRenderingIds(prev => new Set(prev).add(blockId));

  // 렌더링 시작 요청
  await fetch('/api/shortstoon/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockId }),
  });

  // 완료될 때까지 2초 간격 폴링
  const poll = setInterval(async () => {
    const res = await fetch(`/api/shortstoon/blocks/${blockId}`);
    const block: ShortstoonBlock = await res.json();
    if (block.status === 'completed' || block.status === 'failed') {
      setBlocks(prev => prev.map(b => b.id === blockId ? block : b));
      setRenderingIds(prev => { const s = new Set(prev); s.delete(blockId); return s; });
      clearInterval(poll);
    }
  }, 2000);

  // 최대 3분 대기 후 타임아웃
  setTimeout(() => clearInterval(poll), 180000);
};
```

---

## Lightsail 구현 — 신규 파일

### `app/routers/ffmpeg.py`

```python
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
import subprocess, tempfile, os, httpx

router = APIRouter()

class RenderRequest(BaseModel):
    block_id: str
    image_url: str
    viewport: dict
    effect_type: str
    effect_params: dict
    duration_ms: int
    project_id: str
    supabase_url: str
    supabase_key: str

@router.post("/ffmpeg/render-cut")
async def render_cut(req: RenderRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_do_render, req)
    return {"accepted": True, "block_id": req.block_id}

async def _do_render(req: RenderRequest):
    supabase = create_client(req.supabase_url, req.supabase_key)
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # 1. 이미지 다운로드
            input_path = os.path.join(tmpdir, "input.jpg")
            async with httpx.AsyncClient() as client:
                r = await client.get(req.image_url)
                with open(input_path, "wb") as f:
                    f.write(r.content)

            # 2. FFmpeg 실행 (효과별 인수 생성)
            output_path = os.path.join(tmpdir, "output.mp4")
            ffmpeg_args = build_ffmpeg_args(input_path, output_path, req)
            subprocess.run(["ffmpeg"] + ffmpeg_args, check=True, timeout=120)

            # 3. Supabase Storage 업로드
            with open(output_path, "rb") as f:
                video_bytes = f.read()
            video_path = f"shortstoon/{req.project_id}/blocks/{req.block_id}.mp4"
            supabase.storage.from_("webtoon-files").upload(
                video_path, video_bytes, {"content-type": "video/mp4", "upsert": "true"}
            )
            video_url = supabase.storage.from_("webtoon-files").get_public_url(video_path)

            # 4. DB 완료 처리
            supabase.table("shortstoon_blocks").update({
                "status": "completed",
                "video_url": video_url,
                "video_path": video_path,
            }).eq("id", req.block_id).execute()

    except Exception as e:
        supabase.table("shortstoon_blocks").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", req.block_id).execute()
```

---

## 구현 순서

1. **Lightsail에 FFmpeg 설치** (`apt install ffmpeg`)
2. **`app/routers/ffmpeg.py` 신규 작성** — 효과별 FFmpeg 인수 생성 + 비동기 처리
3. **`main.py`에 라우터 등록** (`app.include_router(ffmpeg.router, prefix="/thegrim-cms")`)
4. **Lightsail 서비스 재시작**
5. **Vercel `/api/shortstoon/render/route.ts` 교체** — FFmpeg 제거, Lightsail 호출로 변경
6. **Vercel `/api/shortstoon/blocks/[id]/route.ts` 신규 작성** — 폴링용
7. **클라이언트 폴링 로직 적용** (page.tsx handleRender)

---

## 현재 FFmpeg 버그 수정 (이전 코드 대비 함께 반영할 것)

| 버그 | 수정 내용 |
|------|----------|
| `amount` 미반영 (스크롤) | `scrollRange *= amount` 적용 |
| `delta` 미반영 (줌) | `from_z=1.0, to_z=1.0+delta` (zoom_in) / `from_z=1.0+delta, to_z=1.0` (zoom_out) |
| 스크롤 방향 반전 | 클라이언트와 동일하게: right→+1, left→-1, down→+1, up→-1 |
| 에러 시 DB 미갱신 | except에서 `status='failed', error_message=str(e)` 업데이트 |

---

## 파일 변경 요약

| 파일 | 변경 |
|------|------|
| `app/api/shortstoon/render/route.ts` | FFmpeg 제거 → Lightsail 위임 |
| `app/api/shortstoon/blocks/[id]/route.ts` | 신규 — 폴링용 블록 조회 |
| `app/shortstoon/[id]/page.tsx` | handleRender → 폴링 방식으로 교체 |
| Lightsail `app/routers/ffmpeg.py` | 신규 — 렌더링 처리 |
| Lightsail `main.py` | ffmpeg 라우터 등록 |
