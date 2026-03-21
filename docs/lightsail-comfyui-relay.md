# Lightsail → ComfyUI 릴레이 구조

## 개요

Vercel(클라우드)에서는 Tailscale 네트워크에 접근 불가. Lightsail 서버가 이미 Tailscale에 연결되어 있어 5090 PC의 ComfyUI를 대신 호출하는 프록시 역할을 한다.

```
Vercel (thegrim-cms)
  └─► POST https://api.rewardpang.com/thegrim-cms/comfyui/generate-video
         (Lightsail, Tailscale 연결됨)
           └─► http://100.79.136.74:8188  (5090 PC ComfyUI)
```

SSH/SCP 없이 ComfyUI HTTP API만 사용.

---

## Lightsail 서버 정보

| 항목 | 값 |
|------|-----|
| 공개 IP | 43.203.34.211 |
| Tailscale IP | 100.111.208.1 |
| 공개 도메인 | api.rewardpang.com |
| SSH 유저 | ubuntu |
| SSH 키 | `~/.ssh/lightsail-ap-northeast-2.pem` (로컬 저장) |
| 서비스 코드 경로 | `/home/ubuntu/gigsquare-backend/services/thegrim-cms-api/` |
| 서비스 포트 | 8002 |

### SSH 접속
```bash
ssh -i ~/.ssh/lightsail-ap-northeast-2.pem ubuntu@43.203.34.211
# 또는 Tailscale로
ssh -i ~/.ssh/lightsail-ap-northeast-2.pem ubuntu@100.111.208.1
```

---

## Lightsail 코드 구조

```
gigsquare-backend/services/thegrim-cms-api/
├── main.py                         # FastAPI 앱, 라우터 등록
├── app/
│   ├── routers/
│   │   ├── comfyui.py              # ComfyUI 프록시 라우터
│   │   └── sam3d.py                # SAM3D 프록시 라우터 (참고용)
│   └── services/
│       ├── comfyui_service.py      # ComfyUI HTTP 클라이언트
│       └── sam3d_service.py
└── workflows/                      # 워크플로우 JSON 파일들
```

### main.py 라우터 등록 방식
```python
app.include_router(comfyui.router, prefix="/thegrim-cms")
app.include_router(sam3d.router, prefix="/thegrim-cms")
```

---

## ComfyUI 릴레이 엔드포인트

### `POST /thegrim-cms/comfyui/generate-video`

**요청 (JSON)**
```json
{
  "start_url": "https://...supabase.../start_frame.png",
  "end_url": "https://...supabase.../end_frame.png",
  "prompt": "영상 프롬프트 텍스트",
  "seed": 123456789,
  "prefix": "cut_abc12345_123456789",
  "storage_path": "webtoonanimation/{project_id}/{cut_id}/comfyui_{seed}.mp4",
  "supabase_url": "https://xxx.supabase.co",
  "supabase_key": "service_role_key"
}
```

**응답**
```json
{
  "video_url": "https://xxx.supabase.co/storage/v1/object/public/webtoonanimation/...",
  "seed": 123456789,
  "prompt_id": "comfyui-prompt-id"
}
```

**처리 흐름**
1. `start_url`, `end_url`에서 이미지 다운로드
2. `POST http://100.79.136.74:8188/upload/image` — ComfyUI에 이미지 업로드
3. `POST http://100.79.136.74:8188/prompt` — Wan 2.2 FLF2V 워크플로우 제출
4. `GET http://100.79.136.74:8188/history/{prompt_id}` — 8초 간격 폴링 (최대 5분)
5. `GET http://100.79.136.74:8188/view?filename=...&type=output` — 영상 다운로드
6. Supabase Storage에 업로드 → 공개 URL 반환

---

## Wan 2.2 FLF2V 워크플로우

`comfyui.py`의 `_build_wan22_workflow()` 함수가 동적으로 생성.

| 노드 | 역할 |
|------|------|
| 1, 2 | LoadImage (start, end) |
| 3, 4 | WanVideoModelLoader (high_noise, low_noise) |
| 5 | WanVideoVAELoader |
| 6 | LoadWanVideoT5TextEncoder |
| 7 | WanVideoTextEncode (프롬프트) |
| 8 | WanVideoImageToVideoEncode (832×480, 113프레임) |
| 9, 10 | WanVideoSampler (4스텝, 2단계 분리) |
| 11 | WanVideoDecode |
| 12 | VHS_VideoCombine → MP4 출력 |

**필요 모델 (5090 PC `C:\AI\ComfyUI\models\`)**
- `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors`
- `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors`
- `wan2.2_i2v_A14b_high_noise_lora_rank64_lightx2v_4step_1022.safetensors`
- `wan2.2_i2v_A14b_low_noise_lora_rank64_lightx2v_4step_1022.safetensors`
- `Wan2_1_VAE_bf16.safetensors`
- `umt5-xxl-enc-bf16.safetensors`

---

## Vercel 환경변수

| 변수 | 값 |
|------|-----|
| `COMFYUI_RELAY_URL` | `https://api.rewardpang.com/thegrim-cms` |

`generate-comfyui-video/route.ts`에서 `${COMFYUI_RELAY_URL}/comfyui/generate-video`로 호출.

---

## Lightsail 서비스 관리

```bash
# 서비스 재시작 (코드 변경 후)
ssh -i ~/.ssh/lightsail-ap-northeast-2.pem ubuntu@43.203.34.211 \
  "sudo systemctl restart thegrim-cms.service"

# 상태 확인
curl https://api.rewardpang.com/health

# ComfyUI 연결 확인 (Tailscale 통해)
ssh -i ~/.ssh/lightsail-ap-northeast-2.pem ubuntu@43.203.34.211 \
  "curl -s http://100.79.136.74:8188/system_stats | python3 -m json.tool | head -10"
```

---

## ComfyUI HTTP API 레퍼런스

| 엔드포인트 | 메서드 | 용도 |
|-----------|--------|------|
| `/upload/image` | POST | 이미지 업로드 (multipart) → `{"name": "filename.png"}` |
| `/prompt` | POST | 워크플로우 제출 → `{"prompt_id": "..."}` |
| `/history/{prompt_id}` | GET | 완료 상태 폴링 |
| `/view` | GET | 결과 파일 다운로드 (`?filename=...&type=output`) |
| `/system_stats` | GET | GPU/메모리 상태 |
| `/queue` | GET | 현재 큐 상태 |

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| 504 타임아웃 | 렌더링 5분 초과 | 5090 PC 상태 확인, 큐 과부하 여부 |
| 500 ComfyUI 연결 실패 | Tailscale 끊김 | Lightsail에서 `ping 100.79.136.74` |
| 이미지 업로드 실패 | Supabase URL 만료 | signed URL 대신 public URL 사용 |
| 모델 로딩 오류 | VRAM 부족 | 다른 ComfyUI 작업 종료 후 재시도 |
