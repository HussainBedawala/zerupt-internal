---
title: Zerupt Website — Photography Shot List + Framing Guide + AI Image Prompts
status: active
created: 2026-06-08
owner: Hussain
tldr: 16 shots covering every website section. Each shot has framing, lighting, color-grade notes, and a copy-paste JSON prompt for AI image generation. Documentary, dark-gradeable, warm-GCC-authentic. No stock tech.
---

# Zerupt Website Photography — Shot List & Prompt Reference

---

## Global Style Block

Append this fragment to **every** individual prompt. Treat it as the base layer.

### Shared style sentence
> Documentary editorial photography, 35mm equivalent lens, Kodak Portra 400 film emulation, shallow depth of field, natural warm afternoon light (golden hour or diffused window light), warm shadows pushed toward deep ink-black (#141310), warm highlights toward aged cream (#F9F7F5), slight film grain, no digital sharpening artifacts, no motion blur, no color grading toward blue or teal, no staged studio lighting, no catchlights from ring lights, real environment, candid moment, no text overlays, no visible logos or brand names, photojournalism quality

### Shared negative prompt fragment
> stock photography, corporate office, laptop with glowing screen, hologram, blue LED light, teal gradient, neon, ring light catchlights, perfect teeth smile direct at camera, model posing, diversity stock, pointing at whiteboard, smart city, data visualization on screen, fake food styling, filter-heavy Instagram aesthetics, oversaturated, HDR tone mapping, AI face artifacts, floating UI elements, visible digital screens unless intentional, text in frame, watermark, logo, brand name, plastic props

---

## Do / Don't

| DO | DON'T |
|----|-------|
| Warm afternoon window light (gold, amber, diffused) | Blue/teal studio key lights |
| Hands, forearms, backs of heads — identity-partial | Models staring straight at camera smiling |
| Regional product packaging: Arabic text on tins, date boxes, Laban cartons, Vimto, spice sacks | Generic Western grocery products |
| South Asian (Indian/Pakistani/Bangladeshi), Arab, Filipino faces — real retail workers | "Diverse corporate team" stock tropes |
| Worn counters, peeling label edges, handwritten tags, old receipt rolls | Pristine showroom interiors |
| A phone being actively used in a shop — fingers on screen, glance not pose | Phone held up to camera like an ad |
| Dust, grain, natural shadow, imperfect light | Heavy retouching, skin smoothing, HDR |
| Wide negative space on one side for text overlay | Busy full-frame compositions with no breathing room |
| Documentary crop: subjects slightly off-center, rule of thirds | Dead center portrait composition |
| Dark ink shadows that can hold reversed-out white type | Blown-out white backgrounds |

---

## Shot List

---

### SHOT 01 — Hero Ambient

**Site usage:** `/` homepage hero section, full-bleed background at 30–50% opacity behind headline. Also `/start` founder landing page.

**Framing:** Wide 16:9 or 3:2. Owner behind a baqala counter, shot from slight low angle across the counter surface. The counter edge forms a strong horizontal in the lower third. Owner is mid-action — reaching for something on the shelf, or counting change — NOT looking at camera. Leave top-left quadrant relatively open (cream/dark gradient) for headline text. Deep focus on counter goods (dates tin, Laban carton, SIM card rack) with owner softly sharp in the background.

**Lighting:** Late afternoon window light from camera-left. Warm amber spill across the counter surface. Owner's face half-lit, half in warm shadow. Push shadows deep toward ink-black. No fill light. The far side of the shop falls into shadow.

**Color grade:** Warm amber highlights → deep ink shadows. Slight Portra 400 color shift (slightly warm skin, slightly desaturated greens). This photo will be placed on cream canvas — it must hold contrast without fighting the cream.

```json
{
  "id": "shot-01-hero-ambient",
  "prompt": "Documentary editorial photograph of a South Asian male shopkeeper in his 40s behind a small baqala grocery counter in the Gulf, shot with a 35mm lens at f/2.8, Kodak Portra 400 film emulation, warm golden afternoon light entering from the left through a shop doorway, the shopkeeper is mid-action reaching toward shelves stocked with Arabic-packaged goods — date tins, Laban cartons, Vimto bottles, Indomie noodle packs — he is not looking at camera, slight low angle from across the worn formica counter surface, counter edge creates strong horizontal line in lower third of frame, top-left quadrant is relatively open and dark for text overlay, deep warm amber highlights on counter surface, shadows pushed deep toward near-black, film grain, candid moment, photojournalism quality, 16:9 aspect ratio",
  "negative_prompt": "stock photography, smiling at camera, posing, blue light, teal, neon, ring light, hologram, laptop, glowing screen, text, logo, studio lighting, HDR, oversaturated, Western grocery products, plastic props, AI face artifacts",
  "aspect_ratio": "16:9",
  "style": "documentary editorial, Kodak Portra 400 film, photojournalism",
  "lighting": "warm golden afternoon, window light from camera-left, no fill, deep ink shadows",
  "mood": "quiet authority, a man who knows every item in his shop",
  "usage_notes": "Primary hero background. Will be placed under cream/ink gradient overlay. Needs strong shadow areas in top-left for headline text legibility."
}
```

---

### SHOT 02 — Owner Environmental Portrait

**Site usage:** `/team` AI team page (human owner counter to AI team), `/start` founder letter trust section, `/[country]` pages.

**Framing:** Portrait 4:5 or 2:3. Subject in natural environment — leaning against the shop doorframe or sitting at the counter looking toward but not directly at camera, caught mid-thought. Lots of environmental context visible: shelves behind, goods in soft focus. Strong vertical composition. Face is sharp but slightly averted — 3/4 turn. Leave upper portion darker for optional text.

**Lighting:** Backlit from the shop doorway with diffused afternoon light wrapping around the subject. The shop interior is darker, creating separation. No harsh direct sun — slightly overcast or thin cloud.

**Color grade:** Skin tones warm, slightly pushed toward amber. Background falls into warm shadow. Film grain visible.

```json
{
  "id": "shot-02-owner-portrait",
  "prompt": "Documentary environmental portrait of an Arab male shopkeeper, mid-30s, leaning against the open doorframe of a small GCC grocery shop, 3/4 turn away from camera, looking slightly off into the distance with a calm contemplative expression, 35mm film portrait at f/2.0, Kodak Portra 400 emulation, soft diffused afternoon backlight from the doorway wraps around his face, the shop interior behind him shows shelves of Arabic-packaged goods in soft focus — spice packets, cleaning products, snack bags with Arabic script — the environment is worn and real, unpretentious, film grain, warm amber skin tones, shadow detail retained, no flash, no ring light, photojournalism editorial quality, 4:5 portrait aspect ratio",
  "negative_prompt": "stock photography, smiling directly at camera, posed studio portrait, blue light, teal, neon, ring light catchlights, corporate setting, suit, tie, clean modern office, text, logo, AI face artifacts, oversaturated, skin smoothing, retouching",
  "aspect_ratio": "4:5",
  "style": "documentary environmental portrait, Kodak Portra 400 film",
  "lighting": "soft diffused afternoon backlight from doorway, warm wrap light, no fill",
  "mood": "quiet dignity, trust, someone who has run this shop for years",
  "usage_notes": "Human counterpoint to the AI team. Represents real customers. Crop flexibly for portrait modules."
}
```

---

### SHOT 03 — Hands Scanning an Invoice

**Site usage:** `/` homepage — Sami (invoice scanner agent) feature section. `/team` Sami agent card. `/switch` migration page.

**Framing:** Tight macro or close-up, 1:1 or 4:5. The frame fills entirely with a pair of hands — male, South Asian, slightly worn — holding a paper invoice or delivery receipt against a shop counter. A phone is flat on the counter beside it with the camera app or Zerupt app visible as a blurred suggestion. Invoice has Arabic and English printed text, line items, a handwritten total. The receipt is slightly creased. Shallow DoF — invoice sharp, counter and phone softly blurred.

**Lighting:** Overhead or side-from-window natural light. Harsh enough to create shadow in the invoice folds, readable detail on the text. No fill flash.

**Color grade:** Slightly cooler than the warm shop shots — invoice paper should read as white/cream. Hands warm amber. Shadows toward ink.

```json
{
  "id": "shot-03-invoice-scan",
  "prompt": "Close-up macro documentary photograph of a pair of South Asian male hands, slightly worn with short nails, holding a slightly crumpled A4 paper invoice or delivery receipt over a worn shop counter, the invoice has printed Arabic and English text with line items and a handwritten total in blue ink, a smartphone lies flat on the counter just below the hands with its camera pointing at the invoice — phone slightly out of focus, 50mm macro lens equivalent, f/2.8, Kodak Portra 400 film emulation, natural overhead window light creating subtle shadow in the folds of the paper, hands are warm amber in tone, invoice paper reads as aged cream-white, background counter surface is worn formica with a few coins and a stapler blurred in background, film grain, photojournalism quality, 1:1 square crop",
  "negative_prompt": "stock photography, clean pristine invoice, glowing screen, blue light, neon, studio lighting, ring light, perfectly manicured hands, model hands, AI face artifacts, text readable as brand name, logo visible, hologram UI overlay",
  "aspect_ratio": "1:1",
  "style": "macro documentary, Kodak Portra 400 film",
  "lighting": "natural overhead window light, no fill, shadow in invoice folds",
  "mood": "everyday task elevated, the moment before Zerupt simplifies it",
  "usage_notes": "Sami agent feature illustration. Use as 1:1 in agent cards or crop to 16:9 for section background."
}
```

---

### SHOT 04 — Stocked Shelves Detail (Inventory)

**Site usage:** `/` homepage — Noor (dead-stock) and Arjun (stockout alerts) agent sections. `/[country]` background texture.

**Framing:** 3:2 or 16:9 horizontal. Shot straight-on or at a slight diagonal angle along a dense shelf, filling the frame with authentic regional products — Vimto, Nido powder, Indomie, Laban, canned lentils with Arabic packaging, ghee tins, sugar sacks. The shelf label tags are hand-written or printed on small strips. Some items are slightly misaligned (real). Composition: products fill 60% of frame, leaving 40% on one side in darker, out-of-focus shadow for text overlay potential.

**Lighting:** Ambient shop fluorescent mixed with a shaft of natural light from one side. The fluorescent gives a subtle warm-green cast that feels authentic, not clinical. Push shadows toward ink-black.

**Color grade:** Let the regional packaging colors (reds, golds, greens of Arabic packaging) be present but desaturated by 15–20% in grade so they harmonize with the cream/ink palette without fighting it.

```json
{
  "id": "shot-04-shelves-inventory",
  "prompt": "Documentary editorial photograph of dense grocery shelves in a small GCC baqala shop, shot at slight diagonal angle along the shelf, shelves packed with authentic regional products — Vimto cans, Nido powder tins, canned lentils and chickpeas with Arabic-language packaging, Laban Fresh cartons, Indomie noodle multipacks, ghee tins, small sugar sacks, handwritten price tags on torn paper strips, some products slightly misaligned as in a real shop, 35mm lens, f/3.5 for moderate depth of field, Kodak Portra 400 film emulation, ambient shop lighting mixed with a shaft of natural light from camera-right, warm-green fluorescent undertone authentic to small shops, right side of frame falls into deep warm shadow for text overlay, slightly desaturated packaging colors, film grain, photojournalism quality, 3:2 aspect ratio",
  "negative_prompt": "pristine supermarket, Western grocery brands, perfectly aligned products, studio lighting, blue cold light, hologram, digital price labels, text overlay, logo, stock imagery, overly clean, HDR, oversaturated",
  "aspect_ratio": "3:2",
  "style": "documentary editorial, Kodak Portra 400 film, slight warm-green fluorescent",
  "lighting": "ambient shop fluorescent + natural light shaft from right, warm-green cast, deep ink shadows",
  "mood": "abundance but human-scale, real inventory that an owner has built piece by piece",
  "usage_notes": "Noor/Arjun agent sections. Background texture at 20–30% opacity. Shadow side holds white text well."
}
```

---

### SHOT 05 — Phone in Hand, Running the Shop

**Site usage:** `/` homepage hero message ("run your shop from your pocket"), hero section variant. `/switch` page.

**Framing:** 9:16 or 4:5 portrait for mobile-native feel OR 3:2 landscape with phone as secondary element. BEST: owner standing near the counter, one hand resting on the counter, other hand holding the phone and actively looking at it — thumb scrolling or tapping. Partial face — we see jaw, ear, a sliver of expression. Background: the shop in soft focus. Phone screen is intentionally NOT shown — the back of the phone or a very blurred screen that reads as "in use."

**Lighting:** Natural window light, slightly warm. Phone hand is the brightest element. The shop behind falls off into warm shadow.

**Color grade:** Warm. The hand and phone form a warm bright island surrounded by darker shop tones.

```json
{
  "id": "shot-05-phone-in-hand",
  "prompt": "Documentary photograph of a Filipino male shopkeeper in his late 20s standing at the side of a baqala counter, shot at 3/4 from behind and to one side, one hand resting on the counter edge, the other hand holding a smartphone at waist height, thumb actively on screen, face not fully visible — we see jaw, ear, side of head — looking down at phone with focused attention, 35mm lens at f/2.2, Kodak Portra 400 film emulation, warm natural window light from behind-left illuminates the hand and phone, the shop shelves and counter in the background are soft-focused warm bokeh — Arabic product packaging blurred, phone screen is not visible (back of device only or blurred suggestion), candid mid-action moment, warm amber skin tones, deep ink shadows in shop background, film grain, photojournalism quality, 4:5 aspect ratio",
  "negative_prompt": "phone held up posing for camera, visible app UI overlay, glowing screen, blue screen light, ring light, stock photography, full face portrait, corporate suit, tablet, laptop, hologram, digital UI elements, text, logo, AI face artifacts, studio lighting",
  "aspect_ratio": "4:5",
  "style": "documentary, Kodak Portra 400 film, candid",
  "lighting": "warm natural window light from behind-left, hand/phone brightest element, ink shadows behind",
  "mood": "effortless control, pocket-scale power, unposed competence",
  "usage_notes": "Hero message support image. Works as mobile-native portrait crop. Phone screen intentionally absent — remove temptation to show UI."
}
```

---

### SHOT 06 — Supplier Delivery Moment

**Site usage:** `/` homepage — Tariq (purchase orders / supplier agent) section. `/switch` migration page.

**Framing:** 16:9 or 3:2 horizontal. A delivery van is partially visible outside an open shop door or loading dock. Two figures — one shop owner, one delivery driver — are transferring cardboard boxes or sacks from the van into the shop. Strong diagonal of boxes being passed across. The shop owner has a clipboard or phone, checking items. Shot from slightly inside the shop looking toward the bright open doorway — the outside is overexposed bright, the inside warm-dark.

**Lighting:** Backlit from the open doorway — bright exterior, dark warm interior. Strong silhouette on one figure, the other partially rim-lit. Documentary, harsh but beautiful contrast.

**Color grade:** High contrast. Bright doorway bleeds warm white, interior is deep ink. The boxes and hands are in the transitional mid-tones.

```json
{
  "id": "shot-06-supplier-delivery",
  "prompt": "Documentary editorial photograph of a supplier delivery moment at a small GCC baqala shop, shot from inside the shop looking toward the bright open doorway, an Arab delivery driver in a uniform is handing a cardboard box across the threshold to a South Asian male shopkeeper who holds a mobile phone checking a list, a white delivery van partially visible outside in brilliant warm afternoon light, several large cardboard boxes and sacks stacked near the entrance, the doorway creates strong backlight — exterior overexposed warm white, shop interior warm-dark ink, one figure silhouetted, the other rim-lit, 35mm lens f/4 for more depth, Kodak Portra 400 film emulation, strong high-contrast backlit scene, film grain, photojournalism editorial quality, 16:9 aspect ratio",
  "negative_prompt": "studio lighting, blue light, neon, glowing screen, stock photography, smiling at camera, corporate uniforms, supermarket loading dock, text visible, logo on boxes legible, HDR, oversaturated, AI face artifacts",
  "aspect_ratio": "16:9",
  "style": "documentary editorial, Kodak Portra 400, backlit high contrast",
  "lighting": "strong afternoon backlight from open doorway, silhouette/rim-lit, interior deep ink shadow",
  "mood": "the rhythm of supply, manual work, the cycle before automation",
  "usage_notes": "Tariq purchase-agent section. Strong silhouette works as section divider background at low opacity."
}
```

---

### SHOT 07 — The "Before Zerupt" Pain — Handwritten Ledger

**Site usage:** `/switch` migration page "before" state. `/` homepage pain section. `/compare/[competitor]` pages.

**Framing:** 1:1 or 4:5. Tight on a handwritten accounts ledger or notebook lying open on a shop counter or table. The ledger has columns of numbers in Arabic script and/or English, some crossed out, some smudged, a few ink blots. A cheap ballpoint pen lies across it. Out of focus in the background: a dusty old keyboard or the corner of an old monitor or an old Nokia phone. This is the "before" image — everything looks effortful and fragile.

**Lighting:** Overhead harsh direct fluorescent light or single bare incandescent bulb. Unpleasant but honest. The ledger paper is yellowed. Shadows are blue-cold (fluorescent), which intentionally reads as uncomfortable — the opposite of the warm, resolved "after" shots.

**Color grade:** EXCEPTION to the warm rule — this shot is intentionally cooler, slightly grey-green. It is the BEFORE. The palette discomfort is the point.

```json
{
  "id": "shot-07-ledger-before",
  "prompt": "Documentary close-up photograph of a handwritten accounts ledger lying open on a worn shop counter, the pages filled with columns of handwritten numbers in both Arabic script and English — some figures crossed out, some smudged, blue ink blots, slightly crumpled pages, a cheap Bic ballpoint pen lying diagonally across the open pages, in the soft background: the corner of a dusty old beige keyboard and a pile of receipts, 50mm lens f/2.8, Kodak Tri-X film emulation with slight warm-grey tone, harsh overhead fluorescent or bare incandescent light, slightly cool blue-green shadow cast — intentionally uncomfortable lighting, aged yellowed paper, film grain, photojournalism quality, 4:5 aspect ratio",
  "negative_prompt": "clean pristine notebook, luxury stationery, Moleskine, modern office desk, warm cozy lighting, blue neon, glowing screen, AI face artifacts, studio lighting, text that reads as brand name, logo, modern digital device as main element",
  "aspect_ratio": "4:5",
  "style": "documentary, Kodak Tri-X monochrome-adjacent film, intentionally cool/grey",
  "lighting": "harsh overhead fluorescent or bare incandescent, cool blue-green shadow — intentionally uncomfortable",
  "mood": "fragility, effort without leverage, the friction that Zerupt eliminates",
  "usage_notes": "BEFORE image. Intentionally cooler palette breaks the warm house style — that dissonance is the point. Pair with a warm 'after' shot. Use on /switch page."
}
```

---

### SHOT 08A — Texture: Weighing Scale

**Site usage:** Background texture tile for pricing section, section dividers, grain overlays. `/pricing` page.

**Framing:** 1:1 square or 4:5. Extreme close-up of a classic analog weighing scale — the kind with a circular dial face and a metal pan — sitting on a shop counter. Dial slightly worn. A small pile of loose cardamom pods or dried lentils on the pan. Shot from directly above (top-down flat-lay) OR at 45 degrees. Pure texture and geometry — no human element needed.

**Lighting:** Soft diffused side light. The dial face should be readable as a graphic element. Shadows warm.

```json
{
  "id": "shot-08a-texture-scale",
  "prompt": "Documentary close-up photograph of a well-worn analog weighing scale on a baqala counter, the circular dial face worn and slightly scratched, a small mound of dried cardamom pods resting in the metal weighing pan, shot from a 45-degree overhead angle, 85mm macro lens equivalent at f/5.6, Kodak Portra 400 film emulation, soft diffused natural side light, warm amber highlights on the metal pan, deep warm shadows around the base, strong geometric composition — the circular dial as the central graphic form, film grain, no human element, photojournalism texture study quality, 1:1 square crop",
  "negative_prompt": "digital scale, digital readout, modern kitchen scale, studio product photography on white, blue light, neon, hologram, text overlay, logo, AI artifacts, HDR",
  "aspect_ratio": "1:1",
  "style": "documentary texture study, Kodak Portra 400 film, graphic geometry",
  "lighting": "soft diffused natural side light, warm amber metal highlights, deep warm shadows",
  "mood": "material honesty, the physical weight of trade",
  "usage_notes": "Background texture at 10–20% opacity. Works in section dividers. The circular dial is a graphic anchor."
}
```

---

### SHOT 08B — Texture: Date Box / Spices

**Site usage:** Background texture, `/[country]` country pages, email header texture.

**Framing:** 3:2 horizontal or 1:1. Top-down flat-lay of a wooden or cardboard box of Medjool dates, lid open, with several dates loose outside the box. Around it: small cloth bags of turmeric and cumin, a metal scoop, a few star anise pods. Rich, warm, regional. No human element. Pure texture and color. Shot from directly above.

**Lighting:** Soft window light from camera-left. Long shadows from the spice bags and date box. Everything warm — golds, ochres, deep umbers. This shot is the most visually aligned with the citron/olive brand palette.

```json
{
  "id": "shot-08b-texture-dates-spices",
  "prompt": "Documentary flat-lay top-down photograph of an open cardboard box of Medjool dates, several dates loose on the counter surface beside it, surrounded by small burlap spice bags — one labeled in Arabic with turmeric, one with cumin — a small brass or aluminum scoop, a few star anise pods scattered, all on a worn wooden or worn formica counter surface, 50mm lens equivalent directly above at f/8 for full sharpness, Kodak Portra 400 film emulation, soft diffused natural window light from left creating long warm shadows, colors are warm golds ochres deep amber browns, no human element, photojournalism texture quality, 3:2 horizontal aspect ratio",
  "negative_prompt": "food styling, restaurant, white background, studio lighting, blue tones, modern grocery packaging, supermarket, text visible as brand name, AI artifacts, HDR, oversaturated",
  "aspect_ratio": "3:2",
  "style": "documentary flat-lay texture, Kodak Portra 400 film, warm palette",
  "lighting": "soft window light from left, long warm shadows, golds and ochres",
  "mood": "regional richness, the raw material of GCC trade",
  "usage_notes": "Most palette-aligned shot — golds match citron accent. Strong country-page background at 15–25% opacity."
}
```

---

### SHOT 08C — Texture: Cash Drawer + Coins

**Site usage:** `/pricing` page detail. Accounting / payment section backgrounds.

**Framing:** 1:1 or 3:2. Looking down into an open cash drawer — compartments with Gulf currency (Saudi riyals, UAE dirhams — coins with Arabic inscriptions visible), a few folded banknotes, a worn rubber band, a receipt roll stub. The drawer is slightly worn, not pristine. Shot from above or at 30-degree angle.

**Lighting:** Direct overhead light creates strong shadows in the compartment dividers. Coins catch the light with warm glints.

```json
{
  "id": "shot-08c-texture-cash-drawer",
  "prompt": "Documentary close-up photograph looking down into an open cash register drawer, compartments filled with Gulf currency — UAE dirham and Saudi riyal coins with Arabic inscriptions clearly visible, a few folded paper banknotes, a worn rubber band, stub of a receipt roll, some loose small coins scattered between compartments, the drawer liner is slightly worn and stained, 50mm lens at f/4, Kodak Portra 400 film emulation, direct overhead natural light creating strong shadows between the compartment dividers, coins catching warm glints of light, no human element, photojournalism quality, 1:1 square crop",
  "negative_prompt": "US dollars, euros, generic coins, pristine new cash register, studio lighting, blue light, credit card terminal as main focus, digital payment UI, AI artifacts, text readable as specific amount, stock photography",
  "aspect_ratio": "1:1",
  "style": "documentary texture, Kodak Portra 400 film",
  "lighting": "overhead natural light, strong compartment shadows, warm coin glints",
  "mood": "the physical reality of cash-first retail",
  "usage_notes": "Pricing page divider or background texture. Regional coins are a visual signature. Use at low opacity."
}
```

---

### SHOT 09 — Wide Storefront, Warm Hour

**Site usage:** `/[country]` country landing pages as hero image. `/` homepage establishing background. Social sharing card.

**Framing:** 16:9 wide. Exterior shot of a small baqala or grocery storefront at magic hour (just before sunset). The shop sign is in Arabic script (unreadable/generic). The doorway is open and warm orange-gold light spills out onto the pavement. A motorbike or handcart is parked nearby. Street life in soft background — slightly blurred pedestrians. The composition is wide enough that the shop sits in the left half of the frame, right half is pavement/street. A shopkeeper silhouette is visible just inside the doorway — half in, half out.

**Lighting:** Magic hour golden backlight. The shop interior glows warm amber. Exterior is long golden shadows on pavement. Sky is deep blue-orange (natural dusk).

```json
{
  "id": "shot-09-storefront-exterior",
  "prompt": "Documentary wide establishing photograph of a small GCC baqala grocery shop exterior at magic hour, just before sunset, the shop sign above the entrance is in Arabic script but generic and unreadable, the open doorway glows warm amber-orange light from inside, a silhouette of the shopkeeper is visible just inside the threshold, a wooden handcart or bicycle parked at the side, the shop occupies the left half of the frame, right half is warm golden pavement with long shadows, slightly blurred pedestrians in the far background, neon shop signs in warm tones on nearby buildings, 24mm wide lens at f/5.6, Kodak Portra 400 film emulation, magic hour golden backlight, deep warm sky transitioning from orange at horizon to blue overhead, film grain, photojournalism quality, 16:9 wide aspect ratio",
  "negative_prompt": "supermarket, mall, modern glass facade, franchise chain shop, blue neon, cold lighting, CGI, stock imagery, Western street scene, empty sterile street, AI face artifacts, visible brand logos on shop front, text in English as the shop sign",
  "aspect_ratio": "16:9",
  "style": "documentary wide establishing shot, Kodak Portra 400 film, magic hour",
  "lighting": "magic hour golden backlight, warm amber shop interior light, long shadows on pavement",
  "mood": "this is someone's livelihood, warm and full of life, the place Zerupt protects",
  "usage_notes": "Country pages hero. Works as social card. The warm interior glow is the emotional anchor — a business that is alive."
}
```

---

### SHOT 10 — Owner at End of Day

**Site usage:** `/start` founder letter page. `/switch` page emotional hook section. `/blog` editorial header.

**Framing:** 3:2 or 4:5. The shop is closing or quiet. The owner sits on a low stool or the counter edge, slightly slumped, looking at his phone or looking out the door. The shop is in half-light — some lights off, late evening. Goods are still on shelves but partially covered. It's the moment AFTER the hard work. Reflective, not sad. Poised, not defeated. Strong single light source (the open door or a single bare bulb) illuminates one side of the face.

**Lighting:** Single source — either last light through the open door or a single warm incandescent bulb. Everything else falls into deep shadow. High chiaroscuro contrast.

**Color grade:** Deep. Ink-heavy. The warmth is the single light source; everything else is near-black. This is the most cinematic shot on the list.

```json
{
  "id": "shot-10-end-of-day",
  "prompt": "Cinematic documentary photograph of a middle-aged Arab male shopkeeper at the end of the trading day, seated on a low wooden stool at the side of his baqala shop, slightly leaning forward with elbows on knees, looking down at a smartphone in his hands or gazing out the open shop doorway, the shop is in half-light — overhead fluorescents partially off, goods on shelves covered with cloth, the counter cleared, warm last light through the open door illuminates one side of his face in a strong chiaroscuro, the rest of the shop falls into deep near-black shadow, 50mm lens at f/2.0, Kodak Portra 400 with deep pushed shadows, single warm practical light source, high contrast cinematic quality, no other people in frame, reflective quiet moment, film grain, photojournalism quality, 4:5 portrait aspect ratio",
  "negative_prompt": "studio lighting, ring light, smiling, posing for camera, blue light, neon, phone showing app UI, multiple people, bright cheerful shop, AI face artifacts, text, logo, HDR, oversaturated, young male model",
  "aspect_ratio": "4:5",
  "style": "cinematic documentary, Kodak Portra 400 pushed, chiaroscuro",
  "lighting": "single warm practical source (open door or bare bulb), high chiaroscuro, ink-heavy shadows",
  "mood": "the weight of ownership, the moment Zerupt speaks to — alone with the numbers at closing time",
  "usage_notes": "Most emotionally resonant image. Use on /start founder letter and /switch 'before' emotional hook. Needs no text overlay — let it breathe."
}
```

---

### SHOT 11 — Female Shop Owner / Manager

**Site usage:** `/` homepage diversity signal, `/[country]` pages, team/meet-the-customers section.

**Framing:** 4:5 portrait. A South Asian or Arab woman in her 30s–40s managing or working in a shop — could be a female-owned shop or a woman managing inventory. She is MID-TASK: counting stock on a shelf, reviewing a paper, or on the phone. Not posing. Headscarf optional but authentic to context — do not avoid it. Warm, confident, competent. The environment should read as retail — shelves, counter, goods.

**Lighting:** Natural diffused window light. Warm. The subject is the brightest element in the frame.

```json
{
  "id": "shot-11-female-owner",
  "prompt": "Documentary editorial photograph of a South Asian woman in her late 30s, wearing a headscarf, working in a small GCC grocery shop, she is mid-task — one hand on a shelf counting stock, the other hand holding a paper inventory list, she is not looking at camera, 3/4 profile, 35mm lens at f/2.2, Kodak Portra 400 film emulation, soft diffused warm window light illuminating her face and hands, shop shelves with Arabic-packaged goods visible behind her in soft focus, candid documentary moment, warm amber skin tones, film grain, no staging, photojournalism quality, 4:5 portrait aspect ratio",
  "negative_prompt": "stock photography, posing for camera, smiling at camera, corporate headshot, studio lighting, ring light, blue light, AI face artifacts, text, logo, headscarf treated as exotic prop, overcautious or tokenistic framing, retail uniform as costume",
  "aspect_ratio": "4:5",
  "style": "documentary editorial, Kodak Portra 400 film, candid",
  "lighting": "soft diffused warm window light, warm amber skin tones, subject is brightest element",
  "mood": "competent, in control, the real face of GCC retail ownership",
  "usage_notes": "Representation matters in this market. Do not sideline this image. Homepage and country pages. Pair with Shot 02 for visual balance."
}
```

---

### SHOT 12 — Prayer Beads and Counter Detail

**Site usage:** Section texture/divider. `/[country]` Saudi, Kuwait pages. `/blog` article illustration.

**Framing:** 1:1 or 4:5 macro. An extreme close-up of a string of amber or dark wooden prayer beads (masbaha/misbaha) draped over the edge of a baqala counter or hanging from a hook near the register. The counter surface shows worn detail — a few scratches, a ring stain from a glass. Optionally a small Quran or just the edge of a notebook in soft background. Pure texture and cultural signal. No human. The beads are the subject.

**Lighting:** Soft warm window light from the side. The amber or wooden beads catch the light beautifully. Deep warm shadows.

```json
{
  "id": "shot-12-prayer-beads-counter",
  "prompt": "Documentary macro photograph of a string of amber prayer beads (misbaha/masbaha) draped over the worn edge of a baqala shop counter, the beads are warm amber-brown translucent, catching warm side light with internal glow, the counter surface is worn formica showing surface scratches and a faint ring stain, in the very soft background: the blurred edge of a small ledger notebook and the corner of a phone, no human element, 85mm macro lens at f/3.5, Kodak Portra 400 film emulation, soft warm window light from camera-right, warm amber highlights in beads, deep warm shadow pooling on counter, film grain, photojournalism texture quality, 4:5 aspect ratio",
  "negative_prompt": "studio product photography, white background, blue light, modern minimalist composition, New Age spiritual styling, religious iconography as exotic, AI artifacts, text, logo, generic beads, rosary framing",
  "aspect_ratio": "4:5",
  "style": "documentary macro texture, Kodak Portra 400 film, warm amber",
  "lighting": "soft warm side window light, internal amber glow in beads, deep warm shadows",
  "mood": "quiet faith woven into commerce, authentic GCC cultural texture",
  "usage_notes": "Cultural signal. Use as accent image on Saudi/Kuwait/Bahrain country pages. Works at full opacity or as 20% texture layer."
}
```

---

### SHOT 13 — Barcode / Receipt Roll Texture

**Site usage:** `/pricing` page texture. `/switch` page background. Abstract texture at low opacity.

**Framing:** 1:1 or 16:9. A receipt roll partially unspooled from a thermal printer, the paper curling naturally, black printed text (non-readable/generic numbers) visible on the white paper. Possibly a hand-held barcode scanner nearby or a barcode label on the counter. Pure graphic texture — lines, type, curve.

**Lighting:** Harsh close direct light (bare bulb or window shaft) so the printed text creates strong contrast. The roll casts a shadow on the counter.

```json
{
  "id": "shot-13-receipt-barcode-texture",
  "prompt": "Documentary close-up macro photograph of a thermal receipt roll partially unspooled from a small printer, the paper curling naturally with printed receipt text visible — column of numbers, item names, total line — text is small and non-readable, a handheld barcode scanner rests nearby on the worn counter surface, a few barcode label stickers visible on the counter, 85mm macro at f/4, Kodak Portra 400 film emulation, harsh direct window shaft light from above-right creating high contrast on the white paper, printed text reads as strong dark lines, the curling paper casts shadow on the counter, warm counter surface color, film grain, no human element, photojournalism texture study quality, 1:1 square crop",
  "negative_prompt": "glossy modern receipt printer, credit card terminal, studio photography, blue light, neon, readable brand name or price, stock photography, AI artifacts, HDR, digital screen",
  "aspect_ratio": "1:1",
  "style": "documentary macro texture, Kodak Portra 400 film, high contrast",
  "lighting": "harsh direct window shaft light, high paper contrast, warm counter surface",
  "mood": "the paper trail of every transaction — manual, tangible, soon to be digitized",
  "usage_notes": "Abstract background texture. Use at 10–15% opacity as section backgrounds. The receipt line patterns are a strong visual motif."
}
```

---

### SHOT 14 — Multiple Shopkeepers / Community Moment

**Site usage:** `/` homepage social proof section. `/pricing` page. Email newsletter header.

**Framing:** 3:2 or 16:9 wide. Two or three shop owners — mix of ethnicity (South Asian and Arab) — standing outside a row of small shops on a market street, in conversation. They are not posing — they are in mid-conversation, possibly laughing or gesturing, one might be on a phone. Documentary street photography feel. The environment: small shophouses, Arabic signage on storefronts, afternoon light, a loaded handcart in the background.

**Lighting:** Open shade or overcast afternoon light. Soft, even, warm. The street scene is bright enough to be energetic but not harsh direct sun on faces.

**Color grade:** Warm but slightly less pushed than the interior shots. More natural. Film grain.

```json
{
  "id": "shot-14-community-shopkeepers",
  "prompt": "Documentary street photograph of two or three small shop owners standing outside their adjacent shops on a GCC market street, mix of South Asian (Indian or Pakistani) and Arab male shopkeepers in their 30s–50s, caught in mid-conversation — one is gesturing, one is laughing, one is half-looking at his phone, not posing for camera, 35mm lens at f/3.5, Kodak Portra 400 film emulation, open shade afternoon light or overcast warm diffused light on faces, the storefronts behind them show Arabic signage (unreadable, generic), a loaded wooden handcart partially visible in the background, warm but natural tones, film grain, photojournalism documentary quality, 3:2 aspect ratio",
  "negative_prompt": "stock photography, posing for camera, smiling at camera together, diversity corporate stock, blue sky studio, corporate uniforms, mall setting, modern glass storefronts, AI face artifacts, text visible as brand name, logo, HDR, cold light",
  "aspect_ratio": "3:2",
  "style": "documentary street photography, Kodak Portra 400 film",
  "lighting": "open shade or overcast afternoon, warm diffused, no harsh direct sun",
  "mood": "the community of small business, peer trust, the word-of-mouth network Zerupt spreads through",
  "usage_notes": "Social proof / testimonials section. Wide crop provides strong text overlay space on either side."
}
```

---

### SHOT 15 — India / Kirana Variant

**Site usage:** `/[country]/india` page hero (future). Indian market expansion. SEA variant possible.

**Framing:** 16:9 or 3:2. A kirana shop interior in India — slightly different aesthetic from GCC baqala. Narrower shop, more vertical stacking, Indian product packaging (Amul, Parle-G, Tata Salt, Maggi, etc.), a digital payment QR code sticker on the counter (blurred). A young Indian male shopkeeper in his 20s behind the counter, mid-action — not posing. The walls may have a calendar with a deity image (authentic, not staged). The shop is more colorful and denser than GCC baqala.

**Lighting:** Mixed — overhead fluorescent and window light. Slightly more yellow-green fluorescent cast. Warm but different register from Gulf shots.

```json
{
  "id": "shot-15-kirana-india",
  "prompt": "Documentary photograph of the interior of a small kirana shop in India, a young Indian male shopkeeper in his mid-20s behind a narrow counter, stacked floor-to-ceiling with products — Amul butter packets, Parle-G biscuits, Tata Salt, Maggi noodles, loose incense sticks in a jar, a faded calendar with a deity image on the wall, a blurred QR code sticker payment sign on the counter edge, shopkeeper is mid-action (handing change to someone off-frame), 35mm lens at f/2.8, Kodak Portra 400 film emulation, mixed overhead fluorescent and front window light, warm yellow-green fluorescent cast authentic to Indian small shops, film grain, candid photojournalism quality, 3:2 aspect ratio",
  "negative_prompt": "stock photography, posing, smiling at camera, studio lighting, blue light, neon, Western grocery products, supermarket, AI face artifacts, text visible as brand name, overly clean or staged, HDR, ring light",
  "aspect_ratio": "3:2",
  "style": "documentary, Kodak Portra 400 film, mixed fluorescent-window light",
  "lighting": "overhead fluorescent + front window light, warm yellow-green authentic cast",
  "mood": "dense abundance, India's informal retail heartbeat, a future Zerupt customer",
  "usage_notes": "India country page hero. Also usable as SEA kirana variant with minimal direction adjustment."
}
```

---

### SHOT 16 — Abstract: Ink-Dark Shop Interior Background

**Site usage:** Full-bleed dark section backgrounds. `/` homepage dark sections. `/pricing` dark pricing table background.

**Framing:** 16:9. The shop at dusk or with most lights off — a narrow corridor of shelves or the back of the shop, barely lit. This is an abstract background shot. Details are intentionally obscured. The shelves create vertical rhythm. A single warm light source (bare bulb in background, or the glow from a small TV off-screen) creates a warm hot-point in the deep-dark scene. The image is 80% shadow.

**Lighting:** Near darkness. Single warm practical light source far in the background. Everything else is ink-black with just the ghost of shelf structure visible.

**Color grade:** Push all shadows to ink-black #141310. Keep only the single warm light point. Minimal film grain (shadows eat grain). This is a texture background, not a narrative image.

```json
{
  "id": "shot-16-dark-interior-bg",
  "prompt": "Documentary atmospheric photograph of the interior of a small GCC shop at closing time with most lights off, shot looking down a narrow corridor between floor-to-ceiling shelves, the shelves create dark vertical geometry, a single bare incandescent bulb or warm light source is visible far in the background creating one small warm amber hot-point, the foreground and mid-ground are deep near-black with only the faintest impression of shelf structure and product silhouettes, no human element, 24mm wide lens at f/2.8, long exposure slight, Kodak Portra 400 film emulation pushed very dark, shadows crushed toward near-black #141310, single warm light point, 80 percent of the image is shadow, 16:9 wide aspect ratio, abstract atmospheric quality",
  "negative_prompt": "bright lit shop, studio lighting, blue neon, teal light, multiple light sources, modern supermarket, visible product text, stock photography, AI artifacts, HDR, color grading toward blue or purple, persons in frame",
  "aspect_ratio": "16:9",
  "style": "atmospheric documentary, Kodak Portra 400 pushed dark, minimal ambient",
  "lighting": "single warm incandescent practical in deep background, 80% shadow, ink-black",
  "mood": "quiet and absolute, the shop after it closes, space that holds memory of a day's work",
  "usage_notes": "Background texture for dark sections. Site dark mode sections. Place white or cream text directly over. The single warm light gives a visual anchor. Use at 60–80% opacity for section backgrounds."
}
```

---

## Usage Map Summary

| Shot ID | Image | Primary Location |
|---------|-------|-----------------|
| shot-01 | Hero ambient — baqala counter, owner mid-action | `/` hero, `/start` |
| shot-02 | Owner environmental portrait — Arab male | `/team`, `/[country]`, `/start` |
| shot-03 | Hands scanning invoice | `/` Sami section, `/team` Sami card |
| shot-04 | Stocked shelves inventory detail | `/` Noor/Arjun sections |
| shot-05 | Phone in hand, shop running | `/` hero variant, `/switch` |
| shot-06 | Supplier delivery, backlit doorway | `/` Tariq section, `/switch` |
| shot-07 | Handwritten ledger (BEFORE) | `/switch` before state, `/compare` |
| shot-08a | Texture: weighing scale | `/pricing`, section dividers |
| shot-08b | Texture: dates and spices | `/[country]` pages, email |
| shot-08c | Texture: cash drawer, Gulf coins | `/pricing`, accounting sections |
| shot-09 | Wide storefront at magic hour | `/[country]` hero, social card |
| shot-10 | Owner at end of day — cinematic | `/start`, `/switch` emotional hook |
| shot-11 | Female shop owner, mid-task | `/` homepage, `/[country]` |
| shot-12 | Prayer beads on counter | Saudi/Kuwait country pages |
| shot-13 | Receipt roll / barcode texture | `/pricing`, `/switch` backgrounds |
| shot-14 | Community shopkeepers — street | Social proof section |
| shot-15 | Kirana shop — India variant | `/india` country page |
| shot-16 | Dark interior abstract background | Dark section backgrounds |

---

## Generation Notes

1. **Run the global style block + individual prompt together** — paste both into the generator, with the global style appended to the end of the individual prompt field, and the global negative prompt merged with the individual negative prompt.
2. **Preferred generators:** Midjourney v6.1+ (`--ar` flag for ratio, `--style raw`, `--sw 0`), DALL-E 3 (high quality), Flux Pro 1.1, or Stable Diffusion 3.5 Large.
3. **Midjourney tip:** Add `--v 6.1 --style raw --cref [previous accepted shot URL]` after shots 01/02 are approved to maintain visual consistency across the set.
4. **Iterating toward the palette:** After generation, run the image through a Lightroom preset or Photoshop curve that: lifts shadows to the cream (#F9F7F5) tone, pushes blacks toward ink (#141310), and adds a slight warm orange-amber to midtones. This bridges AI generation to the exact brand palette.
5. **Shot 07 is the intentional exception** — it should feel cooler and more uncomfortable than the rest. Do not warm-grade it.
6. **For country pages**, shots 01, 04, 09, 14 are culturally neutral and can be used across GCC. Shots 12 (prayer beads) and 15 (kirana) are market-specific.
