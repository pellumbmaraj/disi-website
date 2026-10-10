// GitHub Pages controls the HTML cache lifetime. A cached page can still ask
// for the current release and refresh itself without changing the public link.
export function watchForUpdates({ page = window, doc = document, load = fetch } = {}) {
  const version = doc.querySelector('meta[name="site-version"]')?.content;
  const valid = value => typeof value === "string" && /^[a-f0-9]{12}$/.test(value);
  if (!valid(version)) return; // Unbuilt local previews have no release manifest.

  const address = new URL(page.location.href);
  const attempted = address.searchParams.get("__site_update");
  if (valid(attempted)) {
    address.searchParams.delete("__site_update");
    page.history.replaceState(page.history.state, "", address.href);
  }
  let checking = false;
  let refreshing = false;
  async function check() {
    if (checking || refreshing || doc.visibilityState === "hidden") return;
    checking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const manifest = new URL("./version.json", import.meta.url);
      manifest.searchParams.set("check", Date.now().toString());
      const response = await load(manifest.href, {
        cache: "no-store", credentials: "omit", signal: controller.signal,
      });
      if (!response.ok) return;
      const latest = (await response.json()).version;
      // The marker also stops a reload loop if an edge serves old HTML once.
      if (!valid(latest) || latest === version || latest === attempted) return;
      const next = new URL(page.location.href);
      next.searchParams.set("__site_update", latest);
      refreshing = true;
      page.location.replace(next.href);
    } catch {
      // Offline, blocked or failed checks must leave the portfolio usable.
    } finally {
      clearTimeout(timeout);
      checking = false;
    }
  }
  page.addEventListener("pageshow", event => { if (event.persisted) check(); });
  doc.addEventListener("visibilitychange", check);
  check();
}
