# GR Architecture portfolio

Complete, locally runnable implementation of the architecture portfolio discussed in the [shared conversation](https://chatgpt.com/s/cx_6aca0eaed3e08191bdc79bb211eb4414). The original implementation and optimized Figma assets have been brought into this repository.

## Run

Requires Node.js 20 or newer. No package installation is needed.

```sh
npm run dev
```

Open `http://127.0.0.1:4173`. Use `PORT=4180 npm run dev` to choose another port. `npm start` runs the same server.

```sh
npm run build
npm test
```

`build` validates the ready-to-deploy `dist/` directory; this site needs no compilation. `check` runs the same validation. Tests check HTTP behavior, security headers, caching and path containment.

## Included

- Full responsive portfolio: immersive hero, studio introduction, nine projects, four services and contact details.
- Project-specific galleries with 75 supplied October 2026 photographs across eight projects; the existing Durrës cover remains available as a one-image gallery. Galleries support previous/next controls, keyboard navigation, touch swipes, full-image links, modal focus handling and project-specific email inquiries.
- WebGL 360° panorama that activates and pans with the first mouse drag or horizontal touch swipe, with keyboard zoom, reset and fullscreen where supported. Movement made while loading is preserved. Active touch gestures stay in the viewer, follow the finger directly and rotate 180° per full-width swipe. Tap 360° to close the viewer and scroll the page again.
- Supplied SVG branding and original imagery in locally hosted responsive WebP sizes, lazy loading and explicit image dimensions.
- Accessible navigation, image descriptions, focus indicators and reduced-motion support.
- Restrictive content security policy, MIME protection, framing protection and privacy permissions policy.

Instagram and LinkedIn links remain omitted, following the conversation's explicit preference. Contact and service links open an email app; there is no server-side contact form.

## Edit

| File | Purpose |
| --- | --- |
| `dist/index.html` | Content, project titles, email, metadata and image references |
| `dist/styles.css` | Branding and responsive layouts |
| `dist/app.js` | Navigation, gallery and viewer activation |
| `dist/gallery.js` | Decode-before-display galleries with bounded phone previews |
| `dist/project-images.js` | Project image order, alt descriptions and responsive asset URLs |
| `dist/panorama.js` | On-demand perspective panorama renderer |
| `dist/drag-pan.js` | First-gesture activation and touch scrolling behavior |
| `dist/freshness.js` | Automatic release checks on opening or restoring the page |
| `dist/assets/` | Optimized imagery, supplied GR logo and retained panorama |
| `scripts/serve.mjs` | Loopback-only local server with security headers |

Keep image dimensions and responsive `srcset` attributes when replacing imagery. The panorama uses a textured sphere so each pixel only samples the image, without inverse trigonometry. Phones use a maximum 2048-pixel texture and 450,000 render pixels; desktop keeps the original texture and up to one million render pixels. Sustained slow display frames reduce resolution automatically. Idle frames do not redraw, and animation stops after release once the view settles. Desktop retains short smoothing; touch is immediate.

Keyboard controls: gallery Left/Right to navigate, Escape to close; panorama arrows to pan, +/− to zoom, Home to reset and Escape to exit. Vertical touch swipes scroll the page while the viewer is closed. Once open, swipes rotate in both directions; the 360° toggle restores scrolling.

The October image delivery was reviewed and mapped to the matching existing projects. The 75 raster originals total approximately 512 MB; their gallery exports total approximately 29.5 MB across responsive sizes, a 94% reduction. Phone galleries request only a preview at most 960 pixels wide (each at most 210 KB); desktop photographs are capped at 1920 pixels, with 2400-pixel versions for the infrastructure boards. Full-image links retain the complete composition, including embedded credits. Original files and the 146 MB video are not shipped to visitors or committed to the public repository. No gallery images are prefetched as a slideshow: the next image is requested on navigation and decoded before display. Closing the gallery clears its image element. The supplied logo replaces the recreated monogram, and the existing equirectangular panorama is retained because the delivery contains flat photographs rather than a replacement panorama.

Image filenames include a content fingerprint. Keep that convention for replacements so return visitors cannot reuse stale images. The gallery modules participate in the existing release-version hash and automatic update checks. Gallery transitions use a short opacity animation, respect reduced-motion preferences, and avoid backdrop blur; project zoom effects apply only to devices with a fine pointer and hover support.

## Deploy

### GitHub Pages

The repository already points to `https://github.com/pellumbmaraj/disi-website`. A deployment workflow is included in `.github/workflows/pages.yml`.

1. Commit and push the site, scripts, tests and workflow to `main`:

   ```sh
   git add README.md .gitignore package.json dist scripts tests .github
   git commit -m "Build responsive architecture portfolio"
   git push origin main
   ```

2. On GitHub, open the repository's **Settings → Pages**. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Open **Actions → Deploy portfolio to GitHub Pages → Run workflow**. Later pushes to `main` deploy automatically after checks pass.
4. The workflow's deployment link shows the live URL. With the current repository name and no custom domain, expect `https://pellumbmaraj.github.io/disi-website/`.

GitHub Pages availability depends on the repository visibility and your GitHub plan. The usual Pages site is public; publishing does not preserve the private preview's ChatGPT sign-in restriction. GitHub's [custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) explains configuration and availability.

The workflow validates the source, runs tests and uploads a prepared `pages/` directory. Relative asset URLs work under `/disi-website/`, at an account root and with custom domains. The configured Pages URL is used automatically for canonical and Open Graph metadata. A content hash of the HTML, JavaScript and CSS versions the whole module graph and stylesheet. The same release is published in `version.json` and the HTML metadata.

On opening the page, restoring it from browser history, or returning to its tab, the page checks the release manifest with caching disabled and a unique request URL. A newer release triggers one automatic cache-bypassing navigation, then removes its internal update marker from the address bar. The normal public URL and any section anchor or other query parameters remain intact. No reload occurs when the release is unchanged or the check fails/offline; requests stay on the same origin. This also works without service workers or browser storage. The one-time adoption limit is that HTML cached before this updater existed must first expire under GitHub Pages' 10-minute cache policy; code cannot run inside an already-cached older document. Subsequent releases update automatically.

To create the deployment files locally:

```sh
npm run build:pages
```

For another domain, use `SITE_URL=https://your-domain.example/ npm run build:pages`. `pages/` is generated and ignored by Git; `dist/` remains the editable source. No dependency installation or API keys are required.

GitHub Pages does not apply `_headers`; its published HTML retains the fallback CSP, while response headers are controlled by GitHub.

### Other static hosts

Serve `dist/` at the root or a directory path of any static HTTPS host. Apply `dist/_headers` on hosts that support it; otherwise configure the equivalent headers in the host settings. The local server applies these headers directly. The HTML includes a fallback CSP, but framing protection requires response headers.

The canonical and Open Graph URLs in the source refer to the GitHub Pages deployment. The Pages preparation script adapts them to `SITE_URL`, including the selected cover image. Static files do not implement authentication; any private Sites preview has its own audience configuration.

No runtime dependencies, analytics, cookies, external fonts, third-party scripts, database or upload endpoints are needed. Current source imagery and the GR logo come from the supplied October 2026 web-material archive; the Durrës image and panorama remain from the earlier design delivery.
