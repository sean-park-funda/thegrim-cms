# 중기작가 스타일 프롬프트 실험 결과

생성일: 2026-04-07 02:32

## 실험 개요
- 모델: `gemini-3-pro-image-preview` (pro), `gemini-3.1-flash-image-preview` (flash)
- 레퍼런스: jungkistyle.png / 스케치: sketch.jpg
- 라인드로잉 20종 × 2모델 = 40장
- 완성된 만화 20종 × 2모델 = 40장

---


## 라인드로잉

### LINE-01. 프롬프트 #1

```
You are a master manga inker. Image 1 is the style reference; extract ONLY the ink line technique. Image 2 is the sketch to ink.
STYLE: Extreme dynamic line weight — thick confident outer contours, whisper-thin interior details. Tapered strokes ending in needle-sharp points.
RULES: Pure line art only. NO hatching, NO shading, NO solid black fills. White background, black ink only. Do NOT copy any figures or objects from Image 1.
```

| pro | flash |
|-----|-------|
| ![line_01_pro.png](jungki-experiments/images/line_01_pro.png) | ![line_01_flash.png](jungki-experiments/images/line_01_flash.png) |

### LINE-02. 프롬프트 #2

```
You are a legendary manga line-art craftsman. Image 1 = style reference (extract line aesthetics only). Image 2 = form base.
Focus on: Traditional dip-pen ink feel — slight organic variation in line weight, as if drawn with a G-pen on Bristol board. Strokes taper naturally like brushed ink.
RULES: Clean line art only. No shading, no tones, no solid fills. Reproduce ONLY the forms in Image 2. White background.
```

| pro | flash |
|-----|-------|
| ![line_02_pro.png](jungki-experiments/images/line_02_pro.png) | ![line_02_flash.png](jungki-experiments/images/line_02_flash.png) |

### LINE-03. 프롬프트 #3

```
Master inker task: Image 1 provides the line style DNA. Image 2 provides the composition.
Key focus: SPEED LINES — every stroke conveys momentum. Wrist-snap tapering on all line ends. Major contours bold and decisive, interior lines disappear into needle points.
FORBIDDEN: uniform thickness, hatching, grey tones, solid fills, any forms from Image 1. Output: pure black line art on white.
```

| pro | flash |
|-----|-------|
| ![line_03_pro.png](jungki-experiments/images/line_03_pro.png) | ![line_03_flash.png](jungki-experiments/images/line_03_flash.png) |

### LINE-04. 프롬프트 #4

```
Inking specialist. Image 1: reference for technique only. Image 2: the only source of form.
Priority: Ultra-fine interior mapping lines (hair strands, fabric micro-folds, facial features) contrasted against strong outer contours. Think mapping pen + G-pen combination.
NO shading, NO hatching, NO solid blacks. Only line thickness variation creates depth. White background, black ink.
```

| pro | flash |
|-----|-------|
| ![line_04_pro.png](jungki-experiments/images/line_04_pro.png) | ![line_04_flash.png](jungki-experiments/images/line_04_flash.png) |

### LINE-05. 프롬프트 #5

```
You ink in the style shown in Image 1. Image 2 is your sketch.
The signature: bold, anchoring outer silhouette lines paired with airy, barely-there interior detail strokes. Negative space breathes.
Output: crisp monochrome line art. No fills, no shading. Forms from Image 2 only.
```

| pro | flash |
|-----|-------|
| ![line_05_pro.png](jungki-experiments/images/line_05_pro.png) | ![line_05_flash.png](jungki-experiments/images/line_05_flash.png) |

### LINE-06. 프롬프트 #6

```
Image 1 = inking style. Image 2 = composition to reproduce.
This artist uses angular, straight-ish strokes — fabric folds rendered as sharp geometric planes, not soft curves. Lines are economical and architectural.
Create clean line art: no grey, no shading, no solid fills. Strict adherence to Image 2 forms.
```

| pro | flash |
|-----|-------|
| ![line_06_pro.png](jungki-experiments/images/line_06_pro.png) | ![line_06_flash.png](jungki-experiments/images/line_06_flash.png) |

### LINE-07. 프롬프트 #7

```
Reproduce the inking approach of Image 1 artist onto Image 2's sketch.
Obsessive focus on: every single line ending tapers to an invisibly fine point. No blunt or rounded terminations anywhere. Contours fluctuate from 0.1mm to 0.8mm within a single stroke.
No hatching, no shading, no solid fills. Pure outline art.
```

| pro | flash |
|-----|-------|
| ![line_07_pro.png](jungki-experiments/images/line_07_pro.png) | ![line_07_flash.png](jungki-experiments/images/line_07_flash.png) |

### LINE-08. 프롬프트 #8

```
Image 1: style only. Image 2: form only.
Inking philosophy: fewer lines, each one perfect. Avoid redundant strokes. Each line is intentional — contour OR detail, never both simultaneously.
Result: elegant, sparse yet expressive monochrome line art. No shading. White bg.
```

| pro | flash |
|-----|-------|
| ![line_08_pro.png](jungki-experiments/images/line_08_pro.png) | ![line_08_flash.png](jungki-experiments/images/line_08_flash.png) |

### LINE-09. 프롬프트 #9

```
Translate Image 1's pressure-sensitive inking technique onto Image 2's sketch.
Simulate heavy stylus pressure on shadow-side contours (thick, ink-saturated), feather-light on highlight sides (thin, almost fading). Dramatic within-stroke weight shifts.
No fills, no tones. Pure line art in black on white.
```

| pro | flash |
|-----|-------|
| ![line_09_pro.png](jungki-experiments/images/line_09_pro.png) | ![line_09_flash.png](jungki-experiments/images/line_09_flash.png) |

### LINE-10. 프롬프트 #10

```
Master manga inker: extract textile and hair rendering from Image 1's style. Apply to Image 2.
Hair: bundles of parallel ultra-fine curved lines that taper at both ends. Fabric: crisp angular fold lines with decisive direction changes.
Pure line art. No shading. No Image 1 forms in output.
```

| pro | flash |
|-----|-------|
| ![line_10_pro.png](jungki-experiments/images/line_10_pro.png) | ![line_10_flash.png](jungki-experiments/images/line_10_flash.png) |

### LINE-11. 프롬프트 #11

```
Image 1 style + Image 2 form = your task.
Produce an immaculately clean, high-resolution line art. Every stroke is deliberate: no wobble, no sketch residue, no hesitation marks. The result should look like it was drawn in one confident, unbroken motion per stroke.
No grey, no fills, no shading. Black ink on white.
```

| pro | flash |
|-----|-------|
| ![line_11_pro.png](jungki-experiments/images/line_11_pro.png) | ![line_11_flash.png](jungki-experiments/images/line_11_flash.png) |

### LINE-12. 프롬프트 #12

```
Inking challenge: create the illusion of 3D volume using ONLY line weight variation — no shading allowed.
Image 1 = technique reference. Image 2 = the form.
Method: thicker lines where surfaces curve away from light, thinner on surfaces facing the viewer. Edges in shadow get double weight.
No hatching, no solid fills, no grey. White background.
```

| pro | flash |
|-----|-------|
| ![line_12_pro.png](jungki-experiments/images/line_12_pro.png) | ![line_12_flash.png](jungki-experiments/images/line_12_flash.png) |

### LINE-13. 프롬프트 #13

```
Image 1 reference (style only) + Image 2 (form only).
Amplify the dynamism: every line should feel like it's moving. Curved action lines, fast tapering, contours that flare at stress points (joints, muscles) and whisper thin at relaxed areas.
Pure line art — no tones, no fills. Black on white.
```

| pro | flash |
|-----|-------|
| ![line_13_pro.png](jungki-experiments/images/line_13_pro.png) | ![line_13_flash.png](jungki-experiments/images/line_13_flash.png) |

### LINE-14. 프롬프트 #14

```
Extreme contrast inking: Image 1 technique on Image 2 forms.
Push line weight to the absolute maximum range: the thinnest lines should be near-invisible hairlines, the thickest should be 10× heavier. Maximum expressiveness through pure weight contrast.
No grey tones, no fills, no hatching. Clean white background.
```

| pro | flash |
|-----|-------|
| ![line_14_pro.png](jungki-experiments/images/line_14_pro.png) | ![line_14_flash.png](jungki-experiments/images/line_14_flash.png) |

### LINE-15. 프롬프트 #15

```
Image 1 inking style applied to Image 2 sketch.
Special emphasis: render clothing folds as sharp, angular, straight-segment lines — not soft curves. Each fold has a decisive direction. Fabric feels stiff and architectural.
Line art only. No shading. Only Image 2 content.
```

| pro | flash |
|-----|-------|
| ![line_15_pro.png](jungki-experiments/images/line_15_pro.png) | ![line_15_flash.png](jungki-experiments/images/line_15_flash.png) |

### LINE-16. 프롬프트 #16

```
Image 1 = style DNA. Image 2 = composition.
Ultra-detailed facial inking focus: eyes, nose, and mouth rendered with obsessive micro-detail using mapping-pen-thin lines. Eyelashes as individual ultra-fine strokes. Lips defined by precise contour variation.
No fills, no hatching. Pure clean line art.
```

| pro | flash |
|-----|-------|
| ![line_16_pro.png](jungki-experiments/images/line_16_pro.png) | ![line_16_flash.png](jungki-experiments/images/line_16_flash.png) |

### LINE-17. 프롬프트 #17

```
Inking hierarchy technique from Image 1, applied to Image 2.
Rule: foreground character = thicker, more assertive lines. Background elements = lighter, shorter, less pressured lines. This depth layering using only line weight, no shading.
White background, black ink only. No grey fills.
```

| pro | flash |
|-----|-------|
| ![line_17_pro.png](jungki-experiments/images/line_17_pro.png) | ![line_17_flash.png](jungki-experiments/images/line_17_flash.png) |

### LINE-18. 프롬프트 #18

```
Image 1 style extraction + Image 2 form reproduction.
Focus on rhythmic line texture: repeated parallel fine lines at consistent intervals create fabric, skin, and shadow texture. These lines have uniform ultra-thin weight but create optical tone through spacing.
No solid fills, no grey. Pure line art.
```

| pro | flash |
|-----|-------|
| ![line_18_pro.png](jungki-experiments/images/line_18_pro.png) | ![line_18_flash.png](jungki-experiments/images/line_18_flash.png) |

### LINE-19. 프롬프트 #19

```
Inking technique: Image 1's approach applied to Image 2.
Define silhouettes with maximum pen pressure — bold, authoritative outer contours. Then fill interior details with near-zero pressure, creating an airy, delicate inner world. The contrast of bold/delicate is the signature.
No tones, no fills. Line art only.
```

| pro | flash |
|-----|-------|
| ![line_19_pro.png](jungki-experiments/images/line_19_pro.png) | ![line_19_flash.png](jungki-experiments/images/line_19_flash.png) |

### LINE-20. 프롬프트 #20

```
You are a supreme manga line-art master. Image 1 provides the complete stylistic blueprint. Image 2 is your canvas.
Synthesize everything: dynamic weight, tapered strokes, angular fabric, ultra-fine interior details, confident contours, analog ink feel, zero residual sketch lines.
Final output: a museum-quality black-on-white manga line art showcasing all the techniques above simultaneously. No shading, no fills.
```

| pro | flash |
|-----|-------|
| ![line_20_pro.png](jungki-experiments/images/line_20_pro.png) | ![line_20_flash.png](jungki-experiments/images/line_20_flash.png) |


## 완성된 만화

### MANGA-01. 프롬프트 #1

```
Master manga inker. Image 1 = inking style reference. Image 2 = sketch to finish.
Balance: bold outer lines, solid black hair shadows, selective hatching on deep creases only. Bright areas left as clean white negative space.
No grey gradients. Black ink + white only. Do not import any figures from Image 1.
```

| pro | flash |
|-----|-------|
| ![manga_01_pro.png](jungki-experiments/images/manga_01_pro.png) | ![manga_01_flash.png](jungki-experiments/images/manga_01_flash.png) |

### MANGA-02. 프롬프트 #2

```
Image 1 (technique) + Image 2 (form). Your goal: maximum dramatic impact.
Use aggressive solid black fills — dark hair masses, cast shadows, deep fabric folds all become pure black. The white areas are islands of light. High contrast is everything.
No grey tones. Black and white only. Forms from Image 2 exclusively.
```

| pro | flash |
|-----|-------|
| ![manga_02_pro.png](jungki-experiments/images/manga_02_pro.png) | ![manga_02_flash.png](jungki-experiments/images/manga_02_flash.png) |

### MANGA-03. 프롬프트 #3

```
Inking philosophy: negative space is the hero. Image 1 style, Image 2 form.
Leave skin, bright fabric, and lit surfaces as pure white. Only the deepest shadows get solid black. A few precise hatching lines hint at mid-tones in shadow areas.
Minimalist approach — less ink, more air. No grey gradients.
```

| pro | flash |
|-----|-------|
| ![manga_03_pro.png](jungki-experiments/images/manga_03_pro.png) | ![manga_03_flash.png](jungki-experiments/images/manga_03_flash.png) |

### MANGA-04. 프롬프트 #4

```
Precision hatching specialist. Image 1 = cross-hatching style reference. Image 2 = form.
Build tonal range exclusively through hatching density: single lines for light shadow, crossed pairs for mid-shadow, dense crosshatch for deep shadow. No solid black fills.
No grey tones. Only hatching lines on white. Clean, ruler-straight hatching strokes.
```

| pro | flash |
|-----|-------|
| ![manga_04_pro.png](jungki-experiments/images/manga_04_pro.png) | ![manga_04_flash.png](jungki-experiments/images/manga_04_flash.png) |

### MANGA-05. 프롬프트 #5

```
Image 1 technique + Image 2 form. Use only parallel hatching (no crosshatching).
Direction of hatching follows the form — curves get curved hatching, planes get straight parallel lines. Density varies with shadow depth.
No solid fills. No grey. Pure line art with directional hatching.
```

| pro | flash |
|-----|-------|
| ![manga_05_pro.png](jungki-experiments/images/manga_05_pro.png) | ![manga_05_flash.png](jungki-experiments/images/manga_05_flash.png) |

### MANGA-06. 프롬프트 #6

```
Two-weapon inking: Image 1 style on Image 2.
Weapon 1: ultra-thin precise lines for all contours and details. Weapon 2: bold solid black fills for darkest shadow areas. Nothing in between — no hatching, no mid-grey.
Extreme binary contrast: hairline-thin lines vs. jet-black masses.
```

| pro | flash |
|-----|-------|
| ![manga_06_pro.png](jungki-experiments/images/manga_06_pro.png) | ![manga_06_flash.png](jungki-experiments/images/manga_06_flash.png) |

### MANGA-07. 프롬프트 #7

```
Furry/textile texture specialist. Image 1 style, Image 2 forms.
Render all surfaces with directional micro-hatching that follows the surface geometry. Cloth folds = hatching that curves with the fold. Hair = hatching that follows hair flow direction.
No solid fills (except deepest shadow). No grey tones.
```

| pro | flash |
|-----|-------|
| ![manga_07_pro.png](jungki-experiments/images/manga_07_pro.png) | ![manga_07_flash.png](jungki-experiments/images/manga_07_flash.png) |

### MANGA-08. 프롬프트 #8

```
Spotting blacks master. Image 1 technique, Image 2 form.
Strategic placement of solid black: hair undersides, shadow cast areas, interior of garment folds. Each black mass is a visual anchor. Contour lines are razor-thin to contrast with the bold fills.
No grey, no gradients. Pure black-white manga inking.
```

| pro | flash |
|-----|-------|
| ![manga_08_pro.png](jungki-experiments/images/manga_08_pro.png) | ![manga_08_flash.png](jungki-experiments/images/manga_08_flash.png) |

### MANGA-09. 프롬프트 #9

```
Selective hatching technique from Image 1, applied to Image 2.
Only 20% of the image surface gets hatching — concentrated in the most dramatic shadow areas. The rest is clean line art with negative space. This restraint makes hatched areas more powerful.
No grey tones. Crisp lines and fills only.
```

| pro | flash |
|-----|-------|
| ![manga_09_pro.png](jungki-experiments/images/manga_09_pro.png) | ![manga_09_flash.png](jungki-experiments/images/manga_09_flash.png) |

### MANGA-10. 프롬프트 #10

```
Image 1 inking style on Image 2. Create 3-tone manga finish:
Tone 1 = pure white (lit surfaces). Tone 2 = fine hatching (mid-shadow). Tone 3 = solid black (deep shadow/hair).
Smooth transition between zones through hatching density. No actual grey pixels — only the optical illusion of grey through line spacing.
```

| pro | flash |
|-----|-------|
| ![manga_10_pro.png](jungki-experiments/images/manga_10_pro.png) | ![manga_10_flash.png](jungki-experiments/images/manga_10_flash.png) |

### MANGA-11. 프롬프트 #11

```
Clean, simple manga finish. Image 1 = style. Image 2 = form.
No hatching at all. Only two elements: crisp ink lines and solid black fills. Hair = black. Deep shadows = black. Everything else = white with clean outlines.
Simple, graphic, high-impact. No tones, no hatching.
```

| pro | flash |
|-----|-------|
| ![manga_11_pro.png](jungki-experiments/images/manga_11_pro.png) | ![manga_11_flash.png](jungki-experiments/images/manga_11_flash.png) |

### MANGA-12. 프롬프트 #12

```
Backlit drama inking. Image 1 technique, Image 2 form.
Simulate rim-lighting: outer edges of figures have a thin bright halo (leave unlinked), while the main body mass becomes deeply shadowed with solid black and dense hatching.
Strong chiaroscuro effect using only lines and black fills. No grey.
```

| pro | flash |
|-----|-------|
| ![manga_12_pro.png](jungki-experiments/images/manga_12_pro.png) | ![manga_12_flash.png](jungki-experiments/images/manga_12_flash.png) |

### MANGA-13. 프롬프트 #13

```
Fabric rendering specialist. Image 1 style, Image 2 composition.
Every textile surface gets intensive treatment: sharp fold lines, parallel hatching along fabric grain, crumple texture at stress points. Skin areas left mostly clean.
No grey tones. Fabric detail = hatching. Shadows = solid black.
```

| pro | flash |
|-----|-------|
| ![manga_13_pro.png](jungki-experiments/images/manga_13_pro.png) | ![manga_13_flash.png](jungki-experiments/images/manga_13_flash.png) |

### MANGA-14. 프롬프트 #14

```
Speed-inking finish. Image 1 = technique blueprint. Image 2 = form.
Apply solid blacks and hatching with visible directionality and speed — fills have slightly irregular edges suggesting a fast brush. Lines taper aggressively. Energy is everything.
No grey gradients. Dynamic black-white contrast.
```

| pro | flash |
|-----|-------|
| ![manga_14_pro.png](jungki-experiments/images/manga_14_pro.png) | ![manga_14_flash.png](jungki-experiments/images/manga_14_flash.png) |

### MANGA-15. 프롬프트 #15

```
Hair and texture master. Image 1 style on Image 2.
Hair rendering: base solid black fill with white highlight lines scratched through it (feathering technique). Fine parallel strand lines emerge from the dark mass at edges.
No grey. Black fills + fine white highlight lines + ink contours.
```

| pro | flash |
|-----|-------|
| ![manga_15_pro.png](jungki-experiments/images/manga_15_pro.png) | ![manga_15_flash.png](jungki-experiments/images/manga_15_flash.png) |

### MANGA-16. 프롬프트 #16

```
Garment shadow mapping. Image 1 technique, Image 2 forms.
Map every clothing shadow with solid black fills bounded by precise contour lines. Create the illusion of 3D fabric volume purely through black/white distribution. Shadow shapes are clean and deliberate.
No grey, no hatching. Pure graphic black-white.
```

| pro | flash |
|-----|-------|
| ![manga_16_pro.png](jungki-experiments/images/manga_16_pro.png) | ![manga_16_flash.png](jungki-experiments/images/manga_16_flash.png) |

### MANGA-17. 프롬프트 #17

```
Engraving-style inking. Image 1 reference, Image 2 form.
Apply very dense, micro-fine parallel hatching across all shadow areas, building up optical density like a copper engraving. Lines are thin, straight, evenly spaced.
No solid fills except absolute darkness. No grey — pure line art creating tonal illusion.
```

| pro | flash |
|-----|-------|
| ![manga_17_pro.png](jungki-experiments/images/manga_17_pro.png) | ![manga_17_flash.png](jungki-experiments/images/manga_17_flash.png) |

### MANGA-18. 프롬프트 #18

```
Classic Western comic-book inking feel with manga line sensibility. Image 1 style, Image 2 form.
Bold, confident outlines. Spot blacks for shadows. Minimal hatching only for key texture areas. Clean and punchy.
No grey tones. Strong black-white graphic style.
```

| pro | flash |
|-----|-------|
| ![manga_18_pro.png](jungki-experiments/images/manga_18_pro.png) | ![manga_18_flash.png](jungki-experiments/images/manga_18_flash.png) |

### MANGA-19. 프롬프트 #19

```
Image 1 technique + Image 2 form. Dramatic composition approach:
Foreground characters: full detail inking with solid blacks and selective hatching. Background: reduce to abstract suggestion — simple lines or left as white negative space.
Focus all visual complexity on the figures. No grey.
```

| pro | flash |
|-----|-------|
| ![manga_19_pro.png](jungki-experiments/images/manga_19_pro.png) | ![manga_19_flash.png](jungki-experiments/images/manga_19_flash.png) |

### MANGA-20. 프롬프트 #20

```
Supreme manga finishing master. Image 1 = complete technical reference. Image 2 = your canvas.
Synthesize all techniques: dynamic line weight, strategic solid blacks, selective precision hatching, bold negative space, dramatic tonal contrast.
Produce a professional-grade, print-ready black-and-white manga page that demonstrates mastery of every inking technique. No grey gradients, pure black-white only.
```

| pro | flash |
|-----|-------|
| ![manga_20_pro.png](jungki-experiments/images/manga_20_pro.png) | ![manga_20_flash.png](jungki-experiments/images/manga_20_flash.png) |
