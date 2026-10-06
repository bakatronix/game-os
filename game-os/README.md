# Game OS

**Game OS is a Llama & Griffin operator surface for indie studio executives.** It answers three CXO-level questions on one screen:

- **Are players engaging?** — community and playtest signal (Chicken Brûlée).
- **Is the price right?** — pricing, discount, wishlist, and regional strategy (Comp Analysis / SEB).
- **Are we hitting product-market fit?** — post-launch 30-day PMF signal (MTG PMF Analyzer).

Each area is a module. Each module has a status tile on the dashboard and a detail page that either embeds or deep-links into the existing live tool.

Game OS does **not** rebuild the three tools — it wraps, links, and summarizes them.

---

## Modules

| Module | Tool | Live URL | CXO Question |
|--------|------|----------|---------------|
| Community | Chicken Brûlée | [llamagriffin.com/game-os/chicken-brulee](https://llamagriffin.com/game-os/chicken-brulee/) | Is the playtest community giving useful, directional feedback? |
| Pricing | Comp Analysis / SEB | [llamagriffin.com/game-os/price-calc](https://llamagriffin.com/game-os/price-calc/) | Is our launch price, discount plan, and regional strategy defensible? |
| PMF | MTG PMF Analyzer | [llamagriffin.com/game-os/PMF](https://llamagriffin.com/game-os/PMF) | 30 days in, is this game showing PMF signals, and where is the weakness? |

---

## File Layout

```
game-os/
  index.html
  assets/
    tokens.css        (copied from Design System/design-system/tokens.css)
    components.css    (copied from Design System/design-system/components.css)
    styles.css        (shell + page layout, built on the tokens)
    app.js
    logo.svg
  README.md
```

No frameworks, no build step. Vanilla HTML, CSS, JavaScript.

- **index.html** — App shell: 3px top bar, brand lockup, `NavTabs` navigation, content area.
- **tokens.css** — Design-system tokens (colour, type, spacing, radius, border). Generated from `Design System/design-system/tokens.json`; do not edit by hand.
- **components.css** — Design-system component classes (`.gos-*`). Copied from the design system.
- **styles.css** — Shell and page layout only. Never hard-codes a colour, font or spacing a token covers.
- **app.js** — Hash-based routing, all demo data in a single `MODULES` object, settings via localStorage. Renders using the `.gos-*` component classes.
- **logo.svg** — Brand wordmark (ink text + gold chevrons).

### Design system

All UI follows the Game OS design system in `../Design System/design-system/`.
Read its `README.md` before changing a screen. Rules in short:

- Light (cream) is the default theme; dark is opt-in via `data-theme="dark"` on `<html>`.
- Use the CSS variables in `tokens.css` — never hard-code a hex, font or spacing.
- Charts take `--data-1` … `--data-6` in order, never cycled. Gold (`--accent-gold`) is
  never a data colour. Status colours always ship with a glyph and a word.
- Card titles are claims ("Is the price right?"), every number carries a unit and a period,
  estimates get an `Est.` prefix, and demo data carries a persistent `Demo data` badge.

---

## Hash Routing

| Hash | Page |
|------|------|
| `#/overview` | CXO dashboard with three status tiles |
| `#/community` | Community detail page |
| `#/pricing` | Pricing detail page |
| `#/pmf` | PMF detail page |
| `#/settings` | Studio profile and module URL overrides |
| `#/about` | About page with credits and links |

---

## How to Add a Fourth Module

1. **Add the module definition** to the `MODULES` object in `assets/app.js`. Copy the structure of an existing module (name, toolName, url, cxoQuestion, description, status, metrics, detailNote, keyReadings, howToRead).

2. **Add a nav item** in `index.html` — copy an existing `<a class="nav-item">` and set `data-route` and `href` to your new key.

3. **Add the tile** in the `renderOverview()` function in `app.js` — follow the pattern of the existing tiles. Add to the `tiles` array that maps over module keys.

4. **Register the route** in the `route()` function's switch statement.

5. **Add to default URLs** in `DEFAULT_MODULE_URLS`.

6. **Add to settings** in `renderSettings()` if you want the URL to be configurable.

---

## How to Swap iframe URLs

1. Open Game OS, navigate to **Settings**.
2. Under "Module Data Sources," change the URL for any module.
3. The new URL is saved to `localStorage` and persists across sessions.

Alternatively, edit the `DEFAULT_MODULE_URLS` object in `assets/app.js` to change the default for all users.

---

## Non-Goals for v1

- **No auth, no backend, no database.** Everything runs client-side.
- **No live data** pulled from Chicken Brûlée, SEB, or MTG. Tiles are seeded with demo values and clearly labeled "(demo)".
- **No mobile-app packaging.** Desktop-first, but tablet-friendly (responsive sidebar and grid).
- **No new charts or analytics.** Small inline SVG sparklines and bar charts are used where a visual would go — no charting library.

---

## Credits

Abbas Saleem Khan, Sebastian Cardoso, Jay Rooney.

[llamagriffin.com](https://llamagriffin.com) · [recognizingpatterns.substack.com](https://recognizingpatterns.substack.com) · [Book a Conversation](https://cal.com/llamagriffin/30min)
