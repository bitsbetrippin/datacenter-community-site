# Upgrading to v1.1 — Seasonal theme packs

The simplest upgrade yet: **copy the zip over your repo, commit, push.**
No database migration, no wrangler change, no secrets, no SQL editor.

## What's new

**Settings → Appearance → Theme** now offers:

- **✨ Auto — follow the seasons**: the calendar dresses itself through the
  year automatically — Winter (Jan–Feb), Spring flowers (Mar–May), sunny
  Summer beaches (Jun–Aug), Fall leaves (Sep + early Nov), 🎃 Halloween all
  of October, 🦃 Thanksgiving (Nov 15–30), 🎄 Christmas all of December.
- **Seasonal packs** (pick one directly): Christmas, Winter, Thanksgiving,
  Halloween, Summer, Fall, Spring.
- **Everyday**: the original Classic / Forest / Ocean / Sunset palettes.

Each seasonal pack restyles the whole app — accent colors, buttons, page
tint — and dresses the calendar itself:

- a holiday **gradient frame** around the calendar edges,
- a **garland strip** across the top (🎄 ❄️ 🎁 ⭐ …),
- **themed day-of-week headers** and today-highlight,
- a matching **ribbon on the top bar** and event-details panel,
- the **wall display** gets the full treatment too (bigger garland) — the
  kitchen tablet turns festive on its own with Auto.

Themes are per-person: you can run Auto while a kid keeps Halloween
year-round. Selection previews live as you change the dropdown — Save makes
it stick across devices. Print/PDF export always stays clean white
regardless of theme.

## Verify

- [ ] Appearance → pick 🎄 Christmas → whole app recolors instantly; calendar
      gets the red/green frame + garland; Save.
- [ ] `/wall` shows the same dressing, garland scaled up.
- [ ] Pick ✨ Auto → today resolves to the current season (shown right in the
      dropdown label).
- [ ] Export PDF: no garland/frame in the print output.
- [ ] Nav footer reads **v1.1**.

Tag `v1.1` when it looks right on the kitchen tablet. 🎄
