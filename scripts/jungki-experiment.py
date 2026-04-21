#!/usr/bin/env python3
"""
중기작가 스타일 프롬프트 실험 스크립트
- 모델: gemini-3-pro-image-preview, gemini-3.1-flash-image-preview
- 라인드로잉 20개 프롬프트 × 2모델 = 40
- 완성된 만화 20개 프롬프트 × 2모델 = 40
- 총 80회 생성
"""

import asyncio
import base64
import os
import time
from pathlib import Path
from datetime import datetime
from google import genai
from google.genai import types

# ── 설정 ──────────────────────────────────────────────────────────────────────
API_KEY = "AIzaSyCUeW4iBnpinMfy9kubfFOryah02e-2Dus"
MODELS = [
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
]
ROOT = Path(__file__).parent.parent
REF_IMG  = ROOT / "public" / "jungkistyle.png"
SKT_IMG  = ROOT / "docs"   / "sketch.jpg"
OUT_DIR  = ROOT / "docs"   / "jungki-experiments"
OUT_DIR.mkdir(parents=True, exist_ok=True)
(OUT_DIR / "images").mkdir(exist_ok=True)

CONCURRENCY = 3          # 동시 실행 수
RETRY_DELAY  = 10        # 실패 시 재시도 대기(초)
MAX_RETRIES  = 2

# ── 이미지 로드 ───────────────────────────────────────────────────────────────
def load_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()

REF_B64 = load_b64(REF_IMG)
SKT_B64 = load_b64(SKT_IMG)

# ── 라인드로잉 프롬프트 20종 ──────────────────────────────────────────────────
LINE_PROMPTS = [
    # L01 — 기본 강약 조절 중심
    """You are a master manga inker. Image 1 is the style reference; extract ONLY the ink line technique. Image 2 is the sketch to ink.
STYLE: Extreme dynamic line weight — thick confident outer contours, whisper-thin interior details. Tapered strokes ending in needle-sharp points.
RULES: Pure line art only. NO hatching, NO shading, NO solid black fills. White background, black ink only. Do NOT copy any figures or objects from Image 1.""",

    # L02 — 아날로그 질감 강조
    """You are a legendary manga line-art craftsman. Image 1 = style reference (extract line aesthetics only). Image 2 = form base.
Focus on: Traditional dip-pen ink feel — slight organic variation in line weight, as if drawn with a G-pen on Bristol board. Strokes taper naturally like brushed ink.
RULES: Clean line art only. No shading, no tones, no solid fills. Reproduce ONLY the forms in Image 2. White background.""",

    # L03 — 속도감·테이퍼링 극대화
    """Master inker task: Image 1 provides the line style DNA. Image 2 provides the composition.
Key focus: SPEED LINES — every stroke conveys momentum. Wrist-snap tapering on all line ends. Major contours bold and decisive, interior lines disappear into needle points.
FORBIDDEN: uniform thickness, hatching, grey tones, solid fills, any forms from Image 1. Output: pure black line art on white.""",

    # L04 — 내부 묘사 극세선
    """Inking specialist. Image 1: reference for technique only. Image 2: the only source of form.
Priority: Ultra-fine interior mapping lines (hair strands, fabric micro-folds, facial features) contrasted against strong outer contours. Think mapping pen + G-pen combination.
NO shading, NO hatching, NO solid blacks. Only line thickness variation creates depth. White background, black ink.""",

    # L05 — 외곽선 단단함 + 내부 공기감
    """You ink in the style shown in Image 1. Image 2 is your sketch.
The signature: bold, anchoring outer silhouette lines paired with airy, barely-there interior detail strokes. Negative space breathes.
Output: crisp monochrome line art. No fills, no shading. Forms from Image 2 only.""",

    # L06 — 직선+각진 스트로크
    """Image 1 = inking style. Image 2 = composition to reproduce.
This artist uses angular, straight-ish strokes — fabric folds rendered as sharp geometric planes, not soft curves. Lines are economical and architectural.
Create clean line art: no grey, no shading, no solid fills. Strict adherence to Image 2 forms.""",

    # L07 — 선 끝 예리함에 집중
    """Reproduce the inking approach of Image 1 artist onto Image 2's sketch.
Obsessive focus on: every single line ending tapers to an invisibly fine point. No blunt or rounded terminations anywhere. Contours fluctuate from 0.1mm to 0.8mm within a single stroke.
No hatching, no shading, no solid fills. Pure outline art.""",

    # L08 — 미니멀 선 수
    """Image 1: style only. Image 2: form only.
Inking philosophy: fewer lines, each one perfect. Avoid redundant strokes. Each line is intentional — contour OR detail, never both simultaneously.
Result: elegant, sparse yet expressive monochrome line art. No shading. White bg.""",

    # L09 — 힘찬 압력 변화
    """Translate Image 1's pressure-sensitive inking technique onto Image 2's sketch.
Simulate heavy stylus pressure on shadow-side contours (thick, ink-saturated), feather-light on highlight sides (thin, almost fading). Dramatic within-stroke weight shifts.
No fills, no tones. Pure line art in black on white.""",

    # L10 — 헤어·직물 질감 특화
    """Master manga inker: extract textile and hair rendering from Image 1's style. Apply to Image 2.
Hair: bundles of parallel ultra-fine curved lines that taper at both ends. Fabric: crisp angular fold lines with decisive direction changes.
Pure line art. No shading. No Image 1 forms in output.""",

    # L11 — 손 떨림 느낌 제거 (완전 클린)
    """Image 1 style + Image 2 form = your task.
Produce an immaculately clean, high-resolution line art. Every stroke is deliberate: no wobble, no sketch residue, no hesitation marks. The result should look like it was drawn in one confident, unbroken motion per stroke.
No grey, no fills, no shading. Black ink on white.""",

    # L12 — 3D 볼륨감을 선으로만
    """Inking challenge: create the illusion of 3D volume using ONLY line weight variation — no shading allowed.
Image 1 = technique reference. Image 2 = the form.
Method: thicker lines where surfaces curve away from light, thinner on surfaces facing the viewer. Edges in shadow get double weight.
No hatching, no solid fills, no grey. White background.""",

    # L13 — 액션/다이나믹 포즈 강조
    """Image 1 reference (style only) + Image 2 (form only).
Amplify the dynamism: every line should feel like it's moving. Curved action lines, fast tapering, contours that flare at stress points (joints, muscles) and whisper thin at relaxed areas.
Pure line art — no tones, no fills. Black on white.""",

    # L14 — 드라마틱한 굵기 대비 (가장 얇은 선 vs 가장 굵은 선)
    """Extreme contrast inking: Image 1 technique on Image 2 forms.
Push line weight to the absolute maximum range: the thinnest lines should be near-invisible hairlines, the thickest should be 10× heavier. Maximum expressiveness through pure weight contrast.
No grey tones, no fills, no hatching. Clean white background.""",

    # L15 — 옷주름 직선적 처리
    """Image 1 inking style applied to Image 2 sketch.
Special emphasis: render clothing folds as sharp, angular, straight-segment lines — not soft curves. Each fold has a decisive direction. Fabric feels stiff and architectural.
Line art only. No shading. Only Image 2 content.""",

    # L16 — 눈·표정 극세밀
    """Image 1 = style DNA. Image 2 = composition.
Ultra-detailed facial inking focus: eyes, nose, and mouth rendered with obsessive micro-detail using mapping-pen-thin lines. Eyelashes as individual ultra-fine strokes. Lips defined by precise contour variation.
No fills, no hatching. Pure clean line art.""",

    # L17 — 배경선 vs 인물선 위계
    """Inking hierarchy technique from Image 1, applied to Image 2.
Rule: foreground character = thicker, more assertive lines. Background elements = lighter, shorter, less pressured lines. This depth layering using only line weight, no shading.
White background, black ink only. No grey fills.""",

    # L18 — 선의 리듬감 (equal-interval repeating fine lines for texture)
    """Image 1 style extraction + Image 2 form reproduction.
Focus on rhythmic line texture: repeated parallel fine lines at consistent intervals create fabric, skin, and shadow texture. These lines have uniform ultra-thin weight but create optical tone through spacing.
No solid fills, no grey. Pure line art.""",

    # L19 — 고압 윤곽 + 무압 내부
    """Inking technique: Image 1's approach applied to Image 2.
Define silhouettes with maximum pen pressure — bold, authoritative outer contours. Then fill interior details with near-zero pressure, creating an airy, delicate inner world. The contrast of bold/delicate is the signature.
No tones, no fills. Line art only.""",

    # L20 — 종합 최상급 선화
    """You are a supreme manga line-art master. Image 1 provides the complete stylistic blueprint. Image 2 is your canvas.
Synthesize everything: dynamic weight, tapered strokes, angular fabric, ultra-fine interior details, confident contours, analog ink feel, zero residual sketch lines.
Final output: a museum-quality black-on-white manga line art showcasing all the techniques above simultaneously. No shading, no fills.""",
]

# ── 완성된 만화 프롬프트 20종 ─────────────────────────────────────────────────
MANGA_PROMPTS = [
    # M01 — 기본 먹칠+선화 균형
    """Master manga inker. Image 1 = inking style reference. Image 2 = sketch to finish.
Balance: bold outer lines, solid black hair shadows, selective hatching on deep creases only. Bright areas left as clean white negative space.
No grey gradients. Black ink + white only. Do not import any figures from Image 1.""",

    # M02 — 먹칠 극대화
    """Image 1 (technique) + Image 2 (form). Your goal: maximum dramatic impact.
Use aggressive solid black fills — dark hair masses, cast shadows, deep fabric folds all become pure black. The white areas are islands of light. High contrast is everything.
No grey tones. Black and white only. Forms from Image 2 exclusively.""",

    # M03 — 여백 극대화 (먹칠 최소화)
    """Inking philosophy: negative space is the hero. Image 1 style, Image 2 form.
Leave skin, bright fabric, and lit surfaces as pure white. Only the deepest shadows get solid black. A few precise hatching lines hint at mid-tones in shadow areas.
Minimalist approach — less ink, more air. No grey gradients.""",

    # M04 — 해칭 전문 (크로스해칭 세밀)
    """Precision hatching specialist. Image 1 = cross-hatching style reference. Image 2 = form.
Build tonal range exclusively through hatching density: single lines for light shadow, crossed pairs for mid-shadow, dense crosshatch for deep shadow. No solid black fills.
No grey tones. Only hatching lines on white. Clean, ruler-straight hatching strokes.""",

    # M05 — 병렬 해칭만 (크로스 없이)
    """Image 1 technique + Image 2 form. Use only parallel hatching (no crosshatching).
Direction of hatching follows the form — curves get curved hatching, planes get straight parallel lines. Density varies with shadow depth.
No solid fills. No grey. Pure line art with directional hatching.""",

    # M06 — 선 굵기 + 먹칠 이분법
    """Two-weapon inking: Image 1 style on Image 2.
Weapon 1: ultra-thin precise lines for all contours and details. Weapon 2: bold solid black fills for darkest shadow areas. Nothing in between — no hatching, no mid-grey.
Extreme binary contrast: hairline-thin lines vs. jet-black masses.""",

    # M07 — 털 질감 특화 해칭
    """Furry/textile texture specialist. Image 1 style, Image 2 forms.
Render all surfaces with directional micro-hatching that follows the surface geometry. Cloth folds = hatching that curves with the fold. Hair = hatching that follows hair flow direction.
No solid fills (except deepest shadow). No grey tones.""",

    # M08 — 스포팅 블랙 집중
    """Spotting blacks master. Image 1 technique, Image 2 form.
Strategic placement of solid black: hair undersides, shadow cast areas, interior of garment folds. Each black mass is a visual anchor. Contour lines are razor-thin to contrast with the bold fills.
No grey, no gradients. Pure black-white manga inking.""",

    # M09 — 부분 해칭 (강조 영역만)
    """Selective hatching technique from Image 1, applied to Image 2.
Only 20% of the image surface gets hatching — concentrated in the most dramatic shadow areas. The rest is clean line art with negative space. This restraint makes hatched areas more powerful.
No grey tones. Crisp lines and fills only.""",

    # M10 — 농담 3단계 (white/hatching/black)
    """Image 1 inking style on Image 2. Create 3-tone manga finish:
Tone 1 = pure white (lit surfaces). Tone 2 = fine hatching (mid-shadow). Tone 3 = solid black (deep shadow/hair).
Smooth transition between zones through hatching density. No actual grey pixels — only the optical illusion of grey through line spacing.""",

    # M11 — 질감 없는 단순 먹칠 만화 (Simple)
    """Clean, simple manga finish. Image 1 = style. Image 2 = form.
No hatching at all. Only two elements: crisp ink lines and solid black fills. Hair = black. Deep shadows = black. Everything else = white with clean outlines.
Simple, graphic, high-impact. No tones, no hatching.""",

    # M12 — 드라마틱 명암 (역광 효과)
    """Backlit drama inking. Image 1 technique, Image 2 form.
Simulate rim-lighting: outer edges of figures have a thin bright halo (leave unlinked), while the main body mass becomes deeply shadowed with solid black and dense hatching.
Strong chiaroscuro effect using only lines and black fills. No grey.""",

    # M13 — 옷 질감 집중 해칭
    """Fabric rendering specialist. Image 1 style, Image 2 composition.
Every textile surface gets intensive treatment: sharp fold lines, parallel hatching along fabric grain, crumple texture at stress points. Skin areas left mostly clean.
No grey tones. Fabric detail = hatching. Shadows = solid black.""",

    # M14 — 속도감 먹칠 (brushstroke feel)
    """Speed-inking finish. Image 1 = technique blueprint. Image 2 = form.
Apply solid blacks and hatching with visible directionality and speed — fills have slightly irregular edges suggesting a fast brush. Lines taper aggressively. Energy is everything.
No grey gradients. Dynamic black-white contrast.""",

    # M15 — 모피/헤어 질감 전문
    """Hair and texture master. Image 1 style on Image 2.
Hair rendering: base solid black fill with white highlight lines scratched through it (feathering technique). Fine parallel strand lines emerge from the dark mass at edges.
No grey. Black fills + fine white highlight lines + ink contours.""",

    # M16 — 세밀한 의복 주름 먹칠
    """Garment shadow mapping. Image 1 technique, Image 2 forms.
Map every clothing shadow with solid black fills bounded by precise contour lines. Create the illusion of 3D fabric volume purely through black/white distribution. Shadow shapes are clean and deliberate.
No grey, no hatching. Pure graphic black-white.""",

    # M17 — 극도로 세밀한 해칭 (동판화 스타일)
    """Engraving-style inking. Image 1 reference, Image 2 form.
Apply very dense, micro-fine parallel hatching across all shadow areas, building up optical density like a copper engraving. Lines are thin, straight, evenly spaced.
No solid fills except absolute darkness. No grey — pure line art creating tonal illusion.""",

    # M18 — 만화책 클래식 (bold outlines + spot blacks)
    """Classic Western comic-book inking feel with manga line sensibility. Image 1 style, Image 2 form.
Bold, confident outlines. Spot blacks for shadows. Minimal hatching only for key texture areas. Clean and punchy.
No grey tones. Strong black-white graphic style.""",

    # M19 — 여백+먹칠 모노크롬 (추상적 배경 처리)
    """Image 1 technique + Image 2 form. Dramatic composition approach:
Foreground characters: full detail inking with solid blacks and selective hatching. Background: reduce to abstract suggestion — simple lines or left as white negative space.
Focus all visual complexity on the figures. No grey.""",

    # M20 — 종합 최상급 만화 원고
    """Supreme manga finishing master. Image 1 = complete technical reference. Image 2 = your canvas.
Synthesize all techniques: dynamic line weight, strategic solid blacks, selective precision hatching, bold negative space, dramatic tonal contrast.
Produce a professional-grade, print-ready black-and-white manga page that demonstrates mastery of every inking technique. No grey gradients, pure black-white only.""",
]

# ── 생성 함수 ─────────────────────────────────────────────────────────────────
client = genai.Client(api_key=API_KEY)

async def generate_one(
    sem: asyncio.Semaphore,
    model: str,
    mode: str,       # "line" | "manga"
    idx: int,
    prompt: str,
) -> dict:
    """단일 이미지 생성. 결과 dict 반환."""
    tag = f"{mode.upper()}-{idx+1:02d} [{model.split('-')[1]}]"
    short_model = "pro" if "pro" in model else "flash"
    filename = f"{mode}_{idx+1:02d}_{short_model}.png"
    out_path = OUT_DIR / "images" / filename

    # 이미 있으면 스킵
    if out_path.exists():
        print(f"  ⏭  SKIP {tag} (already exists)")
        return {"ok": True, "skipped": True, "filename": filename, "model": model, "mode": mode, "idx": idx, "prompt": prompt}

    async with sem:
        for attempt in range(MAX_RETRIES + 1):
            try:
                print(f"  ▶  START {tag} (attempt {attempt+1})")
                t0 = time.time()

                contents = [
                    types.Part.from_text(text=prompt),
                    types.Part.from_bytes(data=base64.b64decode(REF_B64), mime_type="image/png"),
                    types.Part.from_bytes(data=base64.b64decode(SKT_B64), mime_type="image/jpeg"),
                ]

                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: client.models.generate_content(
                        model=model,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            response_modalities=["IMAGE", "TEXT"],
                            temperature=1.0,
                            top_p=0.95,
                            top_k=40,
                            max_output_tokens=32768,
                        ),
                    )
                )

                # 이미지 파트 추출
                img_data = None
                for part in response.candidates[0].content.parts:
                    if hasattr(part, "inline_data") and part.inline_data:
                        img_data = part.inline_data.data
                        break

                if not img_data:
                    raise ValueError("No image in response")

                out_path.write_bytes(img_data if isinstance(img_data, bytes) else base64.b64decode(img_data))
                elapsed = time.time() - t0
                print(f"  ✅ DONE  {tag} ({elapsed:.1f}s) → {filename}")
                return {"ok": True, "filename": filename, "model": model, "mode": mode, "idx": idx, "prompt": prompt, "elapsed": elapsed}

            except Exception as e:
                print(f"  ❌ ERROR {tag}: {e}")
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                else:
                    return {"ok": False, "filename": filename, "model": model, "mode": mode, "idx": idx, "prompt": prompt, "error": str(e)}

# ── 문서 생성 ─────────────────────────────────────────────────────────────────
def build_doc(results: list[dict]):
    lines = [
        "# 중기작가 스타일 프롬프트 실험 결과",
        f"\n생성일: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "\n## 실험 개요",
        "- 모델: `gemini-3-pro-image-preview` (pro), `gemini-3.1-flash-image-preview` (flash)",
        "- 레퍼런스: jungkistyle.png / 스케치: sketch.jpg",
        "- 라인드로잉 20종 × 2모델 = 40장",
        "- 완성된 만화 20종 × 2모델 = 40장",
        "\n---\n",
    ]

    for mode_label, mode_key, prompts in [
        ("라인드로잉", "line", LINE_PROMPTS),
        ("완성된 만화", "manga", MANGA_PROMPTS),
    ]:
        lines.append(f"\n## {mode_label}\n")
        for i, prompt in enumerate(prompts):
            lines.append(f"### {mode_key.upper()}-{i+1:02d}. 프롬프트 #{i+1}\n")
            lines.append(f"```\n{prompt.strip()}\n```\n")
            lines.append("| pro | flash |")
            lines.append("|-----|-------|")

            pro_r   = next((r for r in results if r["mode"]==mode_key and r["idx"]==i and "pro"   in r["model"]), None)
            flash_r = next((r for r in results if r["mode"]==mode_key and r["idx"]==i and "flash" in r["model"]), None)

            def cell(r):
                if r is None: return "생성 안 됨"
                if not r["ok"]: return f"❌ {r.get('error','error')[:40]}"
                return f"![{r['filename']}](jungki-experiments/images/{r['filename']})"

            lines.append(f"| {cell(pro_r)} | {cell(flash_r)} |")
            lines.append("")

    doc_path = OUT_DIR.parent / "jungki-experiments.md"
    doc_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n📄 문서 저장: {doc_path}")
    return doc_path

# ── 메인 ──────────────────────────────────────────────────────────────────────
async def main():
    print(f"🚀 실험 시작: {datetime.now().strftime('%H:%M:%S')}")
    print(f"   라인 {len(LINE_PROMPTS)}종 × 만화 {len(MANGA_PROMPTS)}종 × 2모델 = {(len(LINE_PROMPTS)+len(MANGA_PROMPTS))*2}장\n")

    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = []

    for model in MODELS:
        for i, prompt in enumerate(LINE_PROMPTS):
            tasks.append(generate_one(sem, model, "line", i, prompt))
        for i, prompt in enumerate(MANGA_PROMPTS):
            tasks.append(generate_one(sem, model, "manga", i, prompt))

    results = await asyncio.gather(*tasks)
    results = list(results)

    ok = sum(1 for r in results if r.get("ok") and not r.get("skipped"))
    skip = sum(1 for r in results if r.get("skipped"))
    fail = sum(1 for r in results if not r.get("ok"))
    print(f"\n📊 결과: 성공 {ok}장 / 스킵 {skip}장 / 실패 {fail}장")

    build_doc(results)
    print("✅ 완료!")

if __name__ == "__main__":
    asyncio.run(main())
