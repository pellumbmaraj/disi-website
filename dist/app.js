import { attachDragPan } from "./drag-pan.js";
import { attachProjectGallery } from "./gallery.js";
import { watchForUpdates } from "./freshness.js";

watchForUpdates();

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

const header = $(".site-header");
if ("IntersectionObserver" in window) {
  const headerObserver = new IntersectionObserver(([entry]) => {
    header.classList.toggle("is-scrolled", entry.intersectionRatio < 0.85);
  }, { threshold: [0, 0.85] });
  headerObserver.observe($(".hero"));
} else header.classList.add("is-scrolled");

const projectGrid = $("#project-grid");
const projects = [...projectGrid.querySelectorAll(".project")];
const filters = [...document.querySelectorAll("[data-filter]")];
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
  $("#project-results").textContent = `${count} projects shown.`;
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
  const sections = [...document.querySelectorAll(".studio-layout, .project, .services-layout")];
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
let viewer;
let opening;
let active = false;
function deactivateViewer() {
  active = false;
  hero.classList.remove("viewer-active");
  viewer?.endPan();
  panorama.hidden = true;
  explore.hidden = false;
  $(".viewer-help").hidden = true;
  toggle.setAttribute("aria-pressed", "false");
  toggle.setAttribute("aria-label", "Open 360 degree view");
  status.textContent = "360 degree view closed.";
}
function activateViewer(focus = false) {
  if (active) return Promise.resolve(viewer);
  if (opening) return opening;
  toggle.disabled = true;
  status.textContent = "Loading 360 degree view.";
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
      explore.querySelector("span:last-child").textContent =
        "Drag to explore 360°";
      explore.hidden = true;
      $(".viewer-help").hidden = false;
      active = true;
      hero.classList.add("viewer-active");
      $(".viewer-help").textContent = matchMedia("(pointer: coarse)").matches
        ? "Swipe to look around · Tap 360° to return to page scrolling"
        : "Drag to look around · Arrow keys to pan · + / − to zoom";
      toggle.setAttribute("aria-pressed", "true");
      toggle.setAttribute("aria-label", "Close 360 degree view");
      viewer.resize();
      status.textContent =
        "360 degree view ready. Drag to look around, or use the arrow keys.";
      if (focus) $("#panorama-canvas").focus({ preventScroll: true });
      return viewer;
    } catch (error) {
      deactivateViewer();
      status.textContent =
        "360 degree view could not load. The hotel preview is still available.";
      explore.querySelector("span:last-child").textContent =
        "360° unavailable · Try again";
      console.warn("Panorama unavailable:", error.message);
    } finally {
      toggle.disabled = false;
    }
  })().finally(() => { opening = undefined; });
  return opening;
}
explore.addEventListener("click", () => activateViewer(true));
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
    status.textContent = "Fullscreen is unavailable in this browser.";
  }
});
document.addEventListener("fullscreenchange", () => {
  fullscreen.setAttribute(
    "aria-label",
    document.fullscreenElement
      ? "Exit fullscreen view"
      : "Enter fullscreen view",
  );
  viewer?.resize();
});
