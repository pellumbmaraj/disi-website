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
- Project gallery with previous/next controls, keyboard navigation, modal focus handling and project-specific email inquiries.
- WebGL 360° panorama that activates and pans with the first mouse drag or horizontal touch swipe, with keyboard zoom, reset and fullscreen where supported. Movement made while loading is preserved. Active touch gestures stay in the viewer, follow the finger directly and rotate 180° per full-width swipe. Tap 360° to close the viewer and scroll the page again.
- Original imagery in locally hosted responsive WebP sizes, lazy loading and explicit image dimensions.
- Accessible navigation, image descriptions, focus indicators and reduced-motion support.
- Restrictive content security policy, MIME protection, framing protection and privacy permissions policy.

Instagram and LinkedIn links remain omitted, following the conversation's explicit preference. Contact and service links open an email app; there is no server-side contact form.

## Edit

| File | Purpose |
| --- | --- |
| `dist/index.html` | Content, project titles, email, metadata and image references |
| `dist/styles.css` | Branding and responsive layouts |
| `dist/app.js` | Navigation, gallery and viewer activation |
| `dist/panorama.js` | On-demand perspective panorama renderer |
| `dist/drag-pan.js` | First-gesture activation and touch scrolling behavior |
| `dist/freshness.js` | Automatic release checks on opening or restoring the page |
| `dist/assets/` | Optimized imagery and recreated GR monogram |
| `scripts/serve.mjs` | Loopback-only local server with security headers |

Keep image dimensions and responsive `srcset` attributes when replacing imagery. The panorama uses a textured sphere so each pixel only samples the image, without inverse trigonometry. Phones use a maximum 2048-pixel texture and 450,000 render pixels; desktop keeps the original texture and up to one million render pixels. Sustained slow display frames reduce resolution automatically. Idle frames do not redraw, and animation stops after release once the view settles. Desktop retains short smoothing; touch is immediate.

Keyboard controls: gallery Left/Right to navigate, Escape to close; panorama arrows to pan, +/− to zoom, Home to reset and Escape to exit. Vertical touch swipes scroll the page while the viewer is closed. Once open, swipes rotate in both directions; the 360° toggle restores scrolling.

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

The canonical and Open Graph URLs currently refer to the existing private preview from the original conversation. Change them in `dist/index.html` when deploying to your own domain. Static files do not implement authentication; the existing private preview's audience is controlled separately by Sites hosting.

No runtime dependencies, analytics, cookies, external fonts, third-party scripts, database or upload endpoints are needed. Source imagery comes from the supplied Figma design. The GR monogram was recreated as an SVG from its visible reference and can be replaced by an original vector.
