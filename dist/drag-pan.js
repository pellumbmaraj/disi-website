// Keep the original gesture, including movement while the panorama loads.
export function attachDragPan(host, activate, isActive = () => false) {
  let gesture;
  let suppressClick = false;

  function flush(current) {
    if (!current.viewer || (!current.dx && !current.dy)) return;
    current.viewer.panBy(current.dx, current.dy, current.pointerType);
    current.dx = current.dy = 0;
  }

  function start(current, capture = true) {
    current.started = true;
    if (capture) host.setPointerCapture(current.id);
    Promise.resolve(activate(current.pointerType)).then((viewer) => {
      current.viewer = viewer;
      if (!current.ended) viewer?.beginPan?.(current.pointerType);
      flush(current);
    });
  }

  host.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    const control = event.target.closest("a,button");
    if (
      gesture || event.target.closest(".site-header") ||
      (control && !control.closest(".explore"))
    ) return;
    gesture = {
      id: event.pointerId, pointerType: event.pointerType,
      originX: event.clientX, originY: event.clientY,
      x: event.clientX, y: event.clientY, dx: 0, dy: 0,
      started: false, moved: false,
    };
    // Once open, the panorama owns the whole swipe, including diagonal motion.
    if (event.pointerType !== "touch" || isActive()) start(gesture);
  });

  host.addEventListener("pointermove", (event) => {
    const current = gesture;
    if (!current || current.id !== event.pointerId) return;
    const totalX = event.clientX - current.originX;
    const totalY = event.clientY - current.originY;
    if (!current.started) {
      // Let vertical touch swipes scroll the page before activating the view.
      if (Math.abs(totalY) >= 8 && Math.abs(totalY) > Math.abs(totalX)) {
        gesture = undefined;
        return;
      }
      if (Math.abs(totalX) < 8) return;
      start(current);
    }
    current.dx += event.clientX - current.x;
    current.dy += event.clientY - current.y;
    current.x = event.clientX;
    current.y = event.clientY;
    current.moved ||= Math.hypot(totalX, totalY) >= 8;
    flush(current);
  });

  function release(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const current = gesture;
    gesture = undefined;
    current.ended = true;
    current.viewer?.endPan?.();
    suppressClick = event.type === "pointerup" && current.moved;
    if (event.type === "pointerup" && !current.started) start(current, false);
    if (host.hasPointerCapture(current.id)) host.releasePointerCapture(current.id);
  }
  host.addEventListener("pointerup", release);
  host.addEventListener("pointercancel", release);
  host.addEventListener("lostpointercapture", release);
  host.addEventListener("click", (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });
}
