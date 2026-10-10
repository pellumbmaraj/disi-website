import { attachDragPan } from "./drag-pan.js";
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

const projectLinks = [...document.querySelectorAll("[data-project]")];
const dialog = $(".project-dialog");
let projectIndex = 0;
let returnFocus;
let previousOverflow;
function showProject(index) {
  projectIndex = (index + projectLinks.length) % projectLinks.length;
  const link = projectLinks[projectIndex];
  const title = link.querySelector("h3").textContent;
  $("#dialog-img").src = link.href;
  $("#dialog-img").alt = link.querySelector("img").alt;
  $("#dialog-title").textContent = title;
  $("#dialog-meta").textContent =
    link.querySelector(".project-caption p").textContent;
  $("#dialog-counter").textContent =
    `${String(projectIndex + 1).padStart(2, "0")} / ${String(projectLinks.length).padStart(2, "0")}`;
  $("#dialog-inquiry").href =
    `mailto:glejdisresulaj@gmail.com?subject=${encodeURIComponent(`Project inquiry — ${title}`)}`;
}
projectLinks.forEach((link, index) =>
  link.addEventListener("click", (event) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !dialog.showModal
    )
      return;
    event.preventDefault();
    returnFocus = link;
    showProject(index);
    previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    $(".dialog-close").focus();
  }),
);
$(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    dialog.close();
});
dialog.addEventListener("close", () => {
  document.body.style.overflow = previousOverflow || "";
  returnFocus?.focus({ preventScroll: true });
});
dialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") {
    event.preventDefault();
    showProject(projectIndex + 1);
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showProject(projectIndex - 1);
  }
});
$(".previous").addEventListener("click", () => showProject(projectIndex - 1));
$(".next").addEventListener("click", () => showProject(projectIndex + 1));

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
