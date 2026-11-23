import { attachDragPan } from "./drag-pan.js";
import { attachProjectGallery } from "./gallery.js";
import { watchForUpdates } from "./freshness.js";
import { startTranslation, t } from "./i18n.js";

startTranslation();

// Never reload under someone who is browsing a gallery or the 360° view.
watchForUpdates({ isBusy: () => document.querySelector(".project-dialog")?.open || document.querySelector(".hero")?.classList.contains("viewer-active") });

const $ = (selector) => document.querySelector(selector);
const menu = $(".menu-toggle");
const nav = $("#main-nav");
function closeMenu() {
  menu.setAttribute("aria-expanded", "false");
  nav.classList.remove("open");
}
menu.addEventListener("click", () => {
  const isOpen = menu.getAttribute("aria-expanded") === "true";
  menu.setAttribute("aria-expanded", String(!isOpen));
  nav.classList.toggle("open", !isOpen);
});
nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
    closeMenu();
    menu.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
});
matchMedia("(min-width: 700px)").addEventListener("change", closeMenu);

// Theme: theme.js picks the saved choice or the device setting; the toggle
// saves an explicit choice, and device changes apply until one is saved.
const themeToggle = $(".theme-toggle");
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const root = document.documentElement;
const savedTheme = () => { try { return localStorage.getItem("theme"); } catch { return null; } };
function applyTheme(theme) {
  root.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
}
themeToggle.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("theme", next); } catch {}
  applyTheme(next);
});
darkQuery.addEventListener("change", event => { if (!savedTheme()) applyTheme(event.matches ? "dark" : "light"); });
applyTheme(root.dataset.theme === "dark" ? "dark" : "light");

const header = $(".site-header");
if ("IntersectionObserver" in window) {
  const headerObserver = new IntersectionObserver(([entry]) => {
    header.classList.toggle("is-scrolled", entry.intersectionRatio < 0.85);
  }, { threshold: [0, 0.85] });
  headerObserver.observe($(".hero"));
} else header.classList.add("is-scrolled");

// Highlight the navigation link for the section currently in view.
const navLinks = [...nav.querySelectorAll('a[href^="#"]:not(.nav-cta)')];
const tracked = navLinks.map(link => document.querySelector(link.getAttribute("href"))).filter(Boolean);
if ("IntersectionObserver" in window && tracked.length) {
  const visible = new Map();
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => visible.set(entry.target, entry.isIntersecting));
    const current = tracked.find(section => visible.get(section));
    navLinks.forEach(link => {
      if (current && link.getAttribute("href") === `#${current.id}`) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  tracked.forEach(section => sectionObserver.observe(section));
}

const projectGrid = $("#project-grid");
const projects = [...projectGrid.querySelectorAll(".project")];
const filters = [...document.querySelectorAll("[data-filter]")];
const pad = count => String(count).padStart(2, "0");
// Counts come from the grid itself, so adding a project never leaves them stale.
filters.forEach(button => {
  const { filter } = button.dataset;
  button.querySelector("sup").textContent = pad(projects.filter(project => filter === "all" || project.dataset.category === filter).length);
});
$("#project-results").textContent = t(`${projects.length} projects shown.`);
document.querySelectorAll("[data-project-total]").forEach(node => { node.textContent = pad(projects.length); });
filters.forEach(button => button.addEventListener("click", () => {
  const selected = button.dataset.filter;
  filters.forEach(filter => filter.setAttribute("aria-pressed", String(filter === button)));
  projectGrid.classList.toggle("is-filtered", selected !== "all");
  let count = 0;
  projects.forEach(project => {
    project.hidden = selected !== "all" && project.dataset.category !== selected;
    project.classList.remove("reveal-pending");
    if (!project.hidden) count++;
  });
  $("#project-results").textContent = t(`${count} projects shown.`);
}));

// Service cards show the matching projects.
document.querySelectorAll("[data-show]").forEach(button => button.addEventListener("click", () => {
  filters.find(filter => filter.dataset.filter === button.dataset.show)?.click();
  $("#projects").scrollIntoView({ behavior: motionPreference.matches ? "auto" : "smooth" });
  $("#project-grid .project:not([hidden]) .project-link")?.focus({ preventScroll: true });
}));

// Reveal below-the-fold content once; no scroll loop or continuous GPU work.
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
if ("IntersectionObserver" in window && !motionPreference.matches) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove("reveal-pending");
      revealObserver.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -24px 0px", threshold: 0.05 });
  const sections = [...document.querySelectorAll("[data-reveal]")];
  sections.forEach(section => {
    if (section.getBoundingClientRect().top < innerHeight) return;
    section.classList.add("reveal-pending");
    revealObserver.observe(section);
  });
  motionPreference.addEventListener("change", event => {
    if (!event.matches) return;
    revealObserver.disconnect();
    sections.forEach(section => section.classList.remove("reveal-pending"));
  });
}

attachProjectGallery();

const hero = $(".hero");
const explore = $(".explore");
const toggle = $(".view-toggle");
const panorama = $(".panorama");
const status = $(".viewer-status");
const exitButton = $(".viewer-exit");
let viewer;
let opening;
let active = false;
function deactivateViewer() {
  active = false;
  hero.classList.remove("viewer-active");
  viewer?.endPan();
  panorama.hidden = true;
  exitButton.hidden = true;
  explore.hidden = false;
  $(".viewer-help").hidden = true;
  toggle.setAttribute("aria-pressed", "false");
  toggle.setAttribute("aria-label", t("Open 360 degree view"));
  status.textContent = t("360 degree view closed.");
}
function activateViewer(focus = false) {
  if (active) return Promise.resolve(viewer);
  if (opening) return opening;
  toggle.disabled = true;
  status.textContent = t("Loading 360 degree view.");
  opening = (async () => {
    try {
      if (viewer?.isContextLost()) viewer = undefined;
      if (!viewer) {
        const { createPanorama } = await import("./panorama.js");
        viewer = await createPanorama($("#panorama-canvas"), () => {
          deactivateViewer();
          toggle.focus();
        });
      }
      panorama.hidden = false;
      exitButton.hidden = false;
      explore.querySelector("span:last-child").textContent =
        t("Drag to explore 360°");
      explore.hidden = true;
      $(".viewer-help").hidden = false;
      active = true;
      hero.classList.add("viewer-active");
      $(".viewer-help").textContent = matchMedia("(pointer: coarse)").matches
        ? t("Swipe to look around · Tap Exit to scroll the page again")
        : t("Drag to look around · Arrow keys to pan · + / − to zoom");
      toggle.setAttribute("aria-pressed", "true");
      toggle.setAttribute("aria-label", t("Close 360 degree view"));
      viewer.resize();
      status.textContent =
        t("360 degree view ready. Drag to look around, or use the arrow keys.");
      // Next frame: a mouse press that opened the viewer would otherwise move focus afterwards.
      if (focus) requestAnimationFrame(() => { if (active) $("#panorama-canvas").focus({ preventScroll: true }); });
      return viewer;
    } catch (error) {
      deactivateViewer();
      status.textContent =
        t("360 degree view could not load. The hotel preview is still available.");
      explore.querySelector("span:last-child").textContent =
        t("360° unavailable · Try again");
      console.warn("Panorama unavailable:", error.message);
    } finally {
      toggle.disabled = false;
    }
  })().finally(() => { opening = undefined; });
  return opening;
}
explore.addEventListener("click", () => activateViewer(true));
// Escape leaves the viewer wherever keyboard focus happens to be.
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !active || document.querySelector(".project-dialog")?.open) return;
  event.preventDefault();
  deactivateViewer();
  toggle.focus({ preventScroll: true });
});
// A large, always-visible way out: on phones the viewer fills the screen.
exitButton.addEventListener("click", async () => {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  deactivateViewer();
  toggle.focus({ preventScroll: true });
});
toggle.addEventListener("click", () =>
  active ? deactivateViewer() : activateViewer(true),
);
// Touch activation must not focus/scroll the canvas while a finger is moving.
attachDragPan(hero, pointerType => activateViewer(pointerType !== "touch"), () => active);
const fullscreen = $(".fullscreen");
if (!document.fullscreenEnabled) fullscreen.hidden = true;
fullscreen.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await hero.requestFullscreen();
  } catch {
    status.textContent = t("Fullscreen is unavailable in this browser.");
  }
});
document.addEventListener("fullscreenchange", () => {
  fullscreen.setAttribute(
    "aria-label",
    document.fullscreenElement
      ? t("Exit fullscreen view")
      : t("Enter fullscreen view"),
  );
  viewer?.resize();
});
