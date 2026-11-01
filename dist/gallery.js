// Decode before displaying a new image; a closed or superseded request cannot
// replace the current picture. Mobile uses a bounded 960px preview.
export function createGalleryLoader(makeImage = () => new Image()) {
  let revision = 0;
  return {
    cancel() { revision++; },
    async load(photo, mobile = false) {
      const request = ++revision;
      const image = makeImage();
      image.alt = photo.alt;
      image.width = photo.width;
      image.height = photo.height;
      image.decoding = "async";
      image.sizes = "(min-width: 1440px) 1176px, calc(100vw - 64px)";
      if (!mobile) image.srcset = photo.srcset || "";
      image.src = mobile ? photo.preview : photo.src;
      try { await image.decode(); }
      catch (error) { if (request !== revision) return null; throw error; }
      return request === revision ? image : null;
    },
  };
}

export function attachProjectGallery() {
  const $ = selector => document.querySelector(selector);
  const links = [...document.querySelectorAll("[data-project]")];
  const dialog = $(".project-dialog"), frame = $(".dialog-image");
  const previous = $(".previous"), next = $(".next");
  const loader = createGalleryLoader();
  let photos = [], selected = 0, returnFocus, previousOverflow, opening = 0;
  let loading = false, swipe, retiring, fadeTimer, closeTimer, closing = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = () => matchMedia("(max-width: 699px)").matches;
  function controls() { previous.disabled = next.disabled = loading || photos.length < 2; }
  function clearPrevious() {
    clearTimeout(fadeTimer);
    retiring?.remove();
    retiring = undefined;
  }
  function closeGallery() {
    if (closing || !dialog.open) return;
    opening++;
    loader.cancel();
    if (reducedMotion.matches) { dialog.close(); return; }
    closing = true;
    dialog.classList.add("is-closing");
    closeTimer = setTimeout(() => dialog.close(), 180);
  }
  async function showPhoto(index) {
    selected = (index + photos.length) % photos.length;
    const photo = photos[selected];
    loading = true;
    controls();
    frame.setAttribute("aria-busy", "true");
    $("#dialog-status").textContent = "Loading image…";
    $("#dialog-counter").textContent = `${String(selected + 1).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;
    $("#dialog-original").href = photo.src;
    $("#dialog-photo-caption").textContent = photo.alt;
    try {
      const image = await loader.load(photo, mobile());
      if (!image || !dialog.open || closing) return;
      clearPrevious();
      const current = $("#dialog-img");
      image.id = "dialog-img";
      if (!current.hidden && current.naturalWidth && !reducedMotion.matches) {
        current.style.opacity = getComputedStyle(current).opacity;
        current.removeAttribute("id");
        current.setAttribute("aria-hidden", "true");
        current.classList.add("gallery-previous");
        retiring = current;
        frame.append(image);
        fadeTimer = setTimeout(clearPrevious, 340);
      } else current.replaceWith(image);
      $("#dialog-status").textContent = "";
    } catch {
      if (!dialog.open || closing) return;
      $("#dialog-status").textContent = "This image could not load. Try the next image or open the full image.";
    }
    loading = false;
    frame.setAttribute("aria-busy", "false");
    controls();
  }
  links.forEach(link => link.addEventListener("click", async event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !dialog.showModal) return;
    event.preventDefault();
    if (dialog.open) return;
    const request = ++opening;
    returnFocus = link;
    const card = link.querySelector("img"), title = link.querySelector("h3").textContent.trim();
    $("#dialog-title").textContent = title;
    $("#dialog-meta").textContent = link.querySelector(".project-caption p").textContent;
    $("#dialog-inquiry").href = `mailto:glejdisresulaj@gmail.com?subject=${encodeURIComponent(`Project inquiry — ${title}`)}`;
    $("#dialog-img").hidden = true;
    $("#dialog-status").textContent = "Loading project…";
    previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    $(".dialog-close").focus({ preventScroll: true });
    loading = true;
    controls();
    const fallback = [{ src: link.href, preview: card.getAttribute("src"), width: Number(card.getAttribute("width")), height: Number(card.getAttribute("height")), alt: card.alt }];
    try {
      const { projectImages } = await import("./project-images.js");
      if (request !== opening || !dialog.open) return;
      photos = projectImages[link.dataset.project] || fallback;
    } catch {
      if (request !== opening || !dialog.open) return;
      photos = fallback;
    }
    showPhoto(0);
  }));
  $(".dialog-close").addEventListener("click", closeGallery);
  dialog.addEventListener("cancel", event => { event.preventDefault(); closeGallery(); });
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeGallery();
  });
  dialog.addEventListener("close", () => {
    opening++;
    loader.cancel();
    clearTimeout(closeTimer);
    clearPrevious();
    closing = false;
    dialog.classList.remove("is-closing");
    photos = [];
    swipe = undefined;
    // Release the decoded image after closing rather than keeping a large
    // bitmap alive behind the page on memory-constrained phones.
    const image = $("#dialog-img");
    image.removeAttribute("srcset");
    image.removeAttribute("src");
    image.hidden = true;
    document.body.style.overflow = previousOverflow || "";
    returnFocus?.focus({ preventScroll: true });
  });
  const move = delta => { if (!loading && !closing && photos.length > 1) showPhoto(selected + delta); };
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  dialog.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    move(event.key === "ArrowRight" ? 1 : -1);
  });
  frame.addEventListener("pointerdown", event => {
    swipe = event.isPrimary && event.pointerType === "touch" ? { id: event.pointerId, x: event.clientX, y: event.clientY } : undefined;
  });
  frame.addEventListener("pointerup", event => {
    const start = swipe;
    swipe = undefined;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
  });
  frame.addEventListener("pointercancel", () => { swipe = undefined; });
}
