# GR Architecture

Portfolio website for GR Architecture, an architecture and design studio in Tiranë, Albania.

A static site with no build step, no dependencies, no cookies, no analytics and no third-party requests. It needs Node.js 20 or newer only for the local server, checks and tests.

## Quick start

```sh
npm run dev      # http://127.0.0.1:4173 (PORT=4180 npm run dev for another port)
npm run check    # validate references, images, metadata and assets
npm test         # run the test suite
```

## Project structure

| Path | Purpose |
| --- | --- |
| `dist/index.html` | All page content: hero, studio, projects, services, contact, metadata |
| `dist/styles.css` | Design tokens, fonts, section styles and responsive layout, in numbered sections |
| `dist/app.js` | Navigation, project filters, reveal animation and 360° viewer activation |
| `dist/theme.js` | Applies a saved light/dark choice before the page is drawn |
| `dist/i18n.js` | Albanian translations and the EN / SQ language switch |
| `dist/gallery.js` | Project gallery dialog and shareable project links |
| `dist/project-images.js` | Gallery images per project: order, descriptions and responsive files |
| `dist/panorama.js` | WebGL 360° panorama of the hotel, loaded on demand |
| `dist/drag-pan.js` | Mouse and touch gestures for the panorama |
| `dist/freshness.js` | Picks up new releases automatically when a visitor returns |
| `dist/assets/` | Logo, icons and optimized WebP imagery |
| `scripts/` | Local server, validation and GitHub Pages preparation |
| `tests/` | Node test suite |

## Features

- Sections: hero with 360° view, studio facts, studio introduction, "From site to keys" process (with the studio poster), selected work, services and contact.
- Self-hosted Inter, Inter Display and EB Garamond Italic fonts (SIL Open Font License), subset to Latin and Albanian characters.
- English and Albanian, switchable from the header.
- Light and dark themes: follows the device setting, with a header toggle that is remembered.
- Service cards that show the matching projects or open a pre-filled email.
- Nine projects in three categories (architecture, interiors, infrastructure) with filters, counts generated from the page itself.
- A gallery for every project with keyboard, swipe and button navigation. Each project has its own link, for example `…/#apartment-durres`, which opens its gallery directly.
- A 360° panorama in the hero: drag or swipe to look around, arrow keys to pan, +/− to zoom. A large “Exit 360° view” button (and Escape) returns to the page.
- Responsive WebP images with explicit dimensions and lazy loading; phones download smaller previews.
- Accessible markup: skip link, labelled controls, focus styles, live status messages, reduced-motion support and WCAG AA text contrast.
- Search and sharing metadata: Open Graph, Twitter card, structured data for the studio, sitemap and touch icon.
- A strict content security policy; all files are served from the site's own origin.

## Editing content

### Text, titles and contact details

Edit `dist/index.html`. The contact email appears in the studio, services and contact sections and in the gallery's inquiry link; the gallery reuses the address from that link, so no JavaScript needs changing. Update the `email` field in the structured data (`application/ld+json` in the page head) too.

### English and Albanian

English is written in `dist/index.html`; Albanian is in `dist/i18n.js`, matched by the exact English wording. When you change or add English text, add the Albanian version under the same English text. `npm test` lists any text, image description or message still missing a translation. Headings with an italic part are translated as a whole by their `data-i18n-html` key.

Visitors switch with EN / SQ in the header. The choice is remembered, links such as `…/?lang=sq` open in Albanian, and browsers set to Albanian start in Albanian.

### Adding or changing a project

1. Add an `<article>` to `#project-grid` in `dist/index.html`, following an existing one. Give it a unique `id`, a `data-category` (`architecture`, `interiors` or `infrastructure`), and matching `data-project` (the next number) and `data-slug` (same as the `id`) on its link.
2. Add the gallery images to `dist/project-images.js` under the same number.
3. Run `npm run check && npm test`. The filter counts update automatically.

### Images

- Export WebP at 960 px wide (phone preview) and 1920 px (desktop); 480 px for card images.
- Include a content fingerprint in every filename, e.g. `durres-02-960-24faf3a5.webp` (the first 8 characters of the file's SHA-256). Assets are cached for a long time, so a new file needs a new name.
- `npm run check` fails if an asset is unused or has no fingerprint, so delete replaced files.
- Keep original photographs and renders out of the repository; `extra/` is ignored by Git for this purpose.

## Deployment

### GitHub Pages

The workflow in `.github/workflows/pages.yml` checks, tests and deploys every push to `main`. In the repository's **Settings → Pages**, set the source to **GitHub Actions**. The site is published at `https://pellumbmaraj.github.io/disi-website/`.

`npm run build:pages` writes the deployable site to `pages/` (ignored by Git). It:

- sets canonical, Open Graph and structured-data URLs to the deployed address (`SITE_URL=https://example.com/ npm run build:pages` for a custom domain);
- generates `sitemap.xml` and `robots.txt`;
- adds a release version to every script and stylesheet URL and writes `version.json`.

When a visitor opens or returns to the page, it checks `version.json`. If a newer release exists, it reloads once to pick it up, but never while a gallery or the 360° view is open.

### Other static hosts

Serve `dist/` from any HTTPS host. Apply `dist/_headers` where the host supports it (Netlify, Cloudflare Pages); otherwise configure the same security and cache headers. GitHub Pages ignores `_headers`, so the page also carries a fallback content security policy.
