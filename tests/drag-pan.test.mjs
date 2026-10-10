import { test } from "node:test";
import assert from "node:assert/strict";
import { attachDragPan } from "../dist/drag-pan.js";

class Hero extends EventTarget {
  captured = new Set();
  closest() { return null; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}
function emit(hero, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries({
    isPrimary: true, pointerId: 1, pointerType: "mouse", button: 0,
    clientX: 100, clientY: 100, ...properties,
  })) Object.defineProperty(event, key, { value });
  hero.dispatchEvent(event);
  return event;
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("first mouse press activates; the same drag pans without a second press", async () => {
  const hero = new Hero(), moves = [];
  let calls = 0;
  attachDragPan(hero, () => { calls++; return { panBy: (...args) => moves.push(args) }; });
  emit(hero, "pointerdown");
  assert.equal(calls, 1);
  await settle();
  emit(hero, "pointermove", { clientX: 150, clientY: 120 });
  assert.deepEqual(moves.at(-1), [50, 20, "mouse"]);
  emit(hero, "pointerup", { clientX: 150, clientY: 120 });
  assert.equal(hero.captured.size, 0);
});

test("movement while loading survives release before the image is ready", async () => {
  const hero = new Hero(), moves = [];
  let ready;
  attachDragPan(hero, () => new Promise((resolve) => { ready = resolve; }));
  emit(hero, "pointerdown");
  emit(hero, "pointermove", { clientX: 130, clientY: 110 });
  emit(hero, "pointermove", { clientX: 180, clientY: 130 });
  emit(hero, "pointerup", { clientX: 180, clientY: 130 });
  ready({ panBy: (...args) => moves.push(args) });
  await settle();
  assert.deepEqual(moves, [[80, 30, "mouse"]]);
});

test("first horizontal touch swipe activates and pans", async () => {
  const hero = new Hero(), moves = [];
  let calls = 0;
  attachDragPan(hero, () => { calls++; return { panBy: (...args) => moves.push(args) }; });
  emit(hero, "pointerdown", { pointerType: "touch" });
  assert.equal(calls, 0);
  emit(hero, "pointermove", { pointerType: "touch", clientX: 150, clientY: 104 });
  await settle();
  assert.equal(calls, 1);
  assert.deepEqual(moves, [[50, 4, "touch"]]);
});

test("vertical touch scrolling and cancellation do not activate", async () => {
  const hero = new Hero();
  let calls = 0;
  attachDragPan(hero, () => { calls++; });
  emit(hero, "pointerdown", { pointerType: "touch" });
  emit(hero, "pointermove", { pointerType: "touch", clientX: 102, clientY: 140 });
  emit(hero, "pointercancel", { pointerType: "touch" });
  emit(hero, "pointerup", { pointerType: "touch" });
  await settle();
  assert.equal(calls, 0);
});

test("a touch tap activates on release without capturing a released pointer", async () => {
  const hero = new Hero();
  let calls = 0;
  attachDragPan(hero, () => { calls++; });
  emit(hero, "pointerdown", { pointerType: "touch" });
  emit(hero, "pointerup", { pointerType: "touch" });
  await settle();
  assert.equal(calls, 1);
  assert.equal(hero.captured.size, 0);
});

test("navigation and controls keep their clicks; drag clicks are suppressed", async () => {
  const hero = new Hero();
  let calls = 0;
  attachDragPan(hero, () => { calls++; });
  const button = { closest: (selector) => selector === "a,button" ? { closest: () => null } : null };
  emit(hero, "pointerdown", { target: button });
  assert.equal(calls, 0);
  emit(hero, "pointerdown");
  emit(hero, "pointermove", { clientX: 160 });
  emit(hero, "pointerup");
  assert.equal(emit(hero, "click").defaultPrevented, true);
  assert.equal(emit(hero, "click").defaultPrevented, false);
  await settle();
});

test("canceled drags do not swallow the next navigation click", async () => {
  const hero = new Hero();
  attachDragPan(hero, () => undefined);
  emit(hero, "pointerdown");
  emit(hero, "pointermove", { clientX: 160 });
  emit(hero, "pointercancel");
  assert.equal(emit(hero, "click").defaultPrevented, false);
  await settle();
});

test("an open viewer owns diagonal and vertical touch gestures until release", async () => {
  const hero = new Hero(), moves = [], lifecycle = [];
  attachDragPan(hero, () => ({
    panBy: (...args) => moves.push(args),
    beginPan: type => lifecycle.push(type),
    endPan: () => lifecycle.push("end"),
  }), () => true);
  emit(hero, "pointerdown", { pointerType: "touch" });
  await settle();
  emit(hero, "pointermove", { pointerType: "touch", clientX: 102, clientY: 140 });
  emit(hero, "pointermove", { pointerType: "touch", clientX: 150, clientY: 180 });
  emit(hero, "pointerup", { pointerType: "touch" });
  assert.deepEqual(moves, [[2, 40, "touch"], [48, 40, "touch"]]);
  assert.deepEqual(lifecycle, ["touch", "end"]);
});

test("a released lazy-loading gesture never starts an abandoned render loop", async () => {
  const hero = new Hero(), lifecycle = [], moves = [];
  let ready;
  attachDragPan(hero, () => new Promise(resolve => { ready = resolve; }));
  emit(hero, "pointerdown");
  emit(hero, "pointermove", { clientX: 150 });
  emit(hero, "pointerup");
  ready({ panBy: (...args) => moves.push(args), beginPan: () => lifecycle.push("begin") });
  await settle();
  assert.deepEqual(lifecycle, []);
  assert.deepEqual(moves, [[50, 0, "mouse"]]);
});
