# Design research — aLo Russia · ZEEN

Studied 2026-10-03. Do not copy any site. Extract craft, then apply Zeengo’s own forest / champagne / paper identity.

---

## Sites studied

### 1. goodtime.travel (bespoke Asia & Russia)
- **Layout:** Full-bleed photography hero; type sits on the image, not in a card. Long vertical scroll, large gaps.
- **Type:** High-contrast serif display, cream on photograph; small sans labels.
- **Color:** Image does the color work. UI is near-black + off-white.
- **Photo:** Cinematic, one subject, lots of sky/water. No grid of identical tiles in the hero.
- **Nav:** Tiny text links. One quiet CTA.
- **Craft vs template:** Hand-crafted. The form at the bottom is a conversation, not a dashboard widget.

### 2. Scott Dunn / Abercrombie & Kent class (luxury operators)
- **Layout:** Magazine sections: full-bleed, then a split (text left, photo right), then a quiet text band.
- **Type:** Serif headlines, humanist sans body. Large size jump (display vs 15–16px body).
- **Color:** Deep green or navy, sand, gold used as a hairline not a fill.
- **Cards:** Photography first; title below the image, not inside a bordered box.
- **Motion:** Slow image scale on hover. No bounce.

### 3. Four Seasons / Belmond (hotel)
- **Layout:** Property pages are photo-led. Booking is a thin bar, not a 6-tile app.
- **Type:** Refined serif names; prices in a quieter sans.
- **Trust:** Address, map, room list — specific, not “unlock luxury.”

### 4. Carey / private chauffeur brands
- **Layout:** Sparse. Service is a sentence + a request. Dark or stone backgrounds.
- **Type:** Tight sans, few weights.
- **Lesson for ZEEN cars:** Treat transfers as a desk conversation (from / to / when), not an icon farm.

### 5. Boutique experience booking (small tour houses)
- **Layout:** Offset grids — 4:5 portraits mixed with a wider landscape.
- **Photo:** Consistent cool or warm grade; grain allowed.
- **Copy:** Place names, walking time, who it’s for.

### 6. Tutu.ru / visitrussia-class (functional travel)
- **Layout:** Search first, then results. Honest density.
- **Lesson:** Booking fields as sentence case (From, To, When), not `FROM` tracking-wide labels.

### 7. Kinfolk / Cereal (editorial, outside travel)
- **Layout:** Uneven columns, lots of paper. A section can be only a sentence.
- **Type:** Display serif + quiet sans. No purple gradients.
- **Color:** Paper, ink, one accent.

### 8. Aesop (lifestyle craft — bot-walled in this session; known craft)
- **Layout:** Product is the photograph. UI recedes.
- **Type:** Distinctive, slightly awkward in a human way.
- **Lesson:** Don’t make every button a 16px rounded rectangle with the same shadow.

### 9. Supreme Travel / Maxelena (Russia concierge)
- **Layout:** Service lists, inquiry CTAs. Less editorial than goodtime; more operator.
- **Lesson for admin:** Keep ops dense. Luxury is for the guest site; ops is a desk.

### 10. Lion Travel / private Russia programmes
- **Layout:** Category chips that read as a desk menu, not a SaaS feature grid.

---

## What feels AI / templated (avoid)

Identical 18px cards, mint arrow tiles, numbered `01–07` eyebrows, tracking-wide uppercase everywhere, blur orbs, “seamless / unlock / elevate,” fake stats, emoji icons, default shadcn shadows.

---

## Zeengo design direction (decisions)

1. **Palette:** Forest `#12372A`, emerald `#1F6B4F`, champagne `#C7A96B`, paper ivory `#F3EEE4`. No purple, no neon.
2. **Type:** Fraunces for LTR display; IBM Plex Sans Arabic for UI and all Arabic. Clear size jump (hero ~46–56, section ~24–28, body ~15–16).
3. **Spacing:** Editorial — large gaps between rails, hairline gold rules instead of numbered labels.
4. **Images:** 4:5 portrait cards, slow zoom on hover, paper fallback if no photo (never empty mint tiles).
5. **Motion:** 200–400ms ease-out only. No bounce, no infinite loaders as decoration.
6. **Components:** Full-pill search and primary buttons; cards are the photograph, not a bordered box. Admin stays dense: same ink/forest, tighter spacing, no marketing hero.
7. **Copy:** Desk voice — “Where to today?”, “Moscow, with someone who knows it.” No buzzwords.

Website already started this pass. Admin gets token consistency and SPA fallback only — not a marketing redesign.
