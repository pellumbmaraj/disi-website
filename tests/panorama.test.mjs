import { test } from "node:test";
import assert from "node:assert/strict";
import { panoramaSize, followAngle, createRenderBudget, createPanorama } from "../dist/panorama.js";

test("GPU pixel budget covers high-DPI phones and fullscreen without changing aspect", () => {
  for (const [width, height] of [[390, 844], [1920, 1080], [3840, 2160]]) {
    const [w, h] = panoramaSize(width, height, 3);
    assert.ok(w * h <= 1000000);
    assert.ok(Math.abs(w / h - width / height) < 0.01);
    const [lowW, lowH] = panoramaSize(width, height, 3, 0.5);
    assert.ok(lowW * lowH <= w * h / 4);
  }
  assert.deepEqual(panoramaSize(0, 0, 3), [0, 0]);
});

test("smoothing is refresh-rate independent, responsive and never overshoots", () => {
  const after = (hz) => {
    let value = 0;
    for (let i = 0; i < hz / 10; i++) value = followAngle(value, 1, 1000 / hz);
    return value;
  };
  assert.ok(Math.abs(after(30) - after(120)) < 1e-10);
  assert.ok(followAngle(0, 1, 1000 / 60) > 0.6);
  assert.ok(after(60) > 0.99 && after(60) <= 1);
  assert.equal(followAngle(0, 1, 16, true), 1);
  assert.equal(followAngle(0.9999, 1, 16), 1);
});

test("sustained slow frames lower quality; healthy frames and idle pauses do not", () => {
  const budget = createRenderBudget();
  for (let i = 0; i < 24; i++) budget.observe(1000 / 60);
  assert.equal(budget.quality, 1);
  for (let i = 0; i < 24; i++) budget.observe(500);
  assert.equal(budget.quality, 1);
  for (let i = 0; i < 11; i++) assert.equal(budget.observe(33), false);
  assert.equal(budget.observe(33), true);
  assert.equal(budget.quality, 0.8);
  for (let i = 0; i < 120; i++) budget.observe(33);
  assert.equal(budget.quality, 0.5);
});

test("renderer coalesces input, settles exactly, stops at rest and cancels on context loss", async (t) => {
  let id = 0, draws = 0, rotation;
  const frames = new Map();
  const gl = {
    getShaderParameter: () => true, getProgramParameter: () => true,
    getParameter: () => 4096, isContextLost: () => false,
    getUniformLocation: (_, key) => key,
    uniform4f: (_, ...values) => { rotation = values; },
    drawArrays: () => { draws++; },
  };
  for (const name of ["createShader", "createProgram", "createBuffer", "createTexture",
    "shaderSource", "compileShader", "attachShader", "linkProgram", "useProgram",
    "bindBuffer", "bufferData", "getAttribLocation", "enableVertexAttribArray",
    "vertexAttribPointer", "bindTexture", "texParameteri", "texImage2D", "viewport",
    "uniform1f", "deleteShader", "deleteProgram", "deleteBuffer", "deleteTexture"])
    gl[name] = () => ({});
  const replacements = {
    window: { devicePixelRatio: 3 }, matchMedia: () => ({ matches: false }),
    Image: class { width = 4096; height = 2048; async decode() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (frame) => frames.delete(frame),
  };
  for (const [key, value] of Object.entries(replacements)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const canvas = new EventTarget();
  Object.assign(canvas, { clientWidth: 390, clientHeight: 844, getContext: () => gl });
  const viewer = await createPanorama(canvas, () => {});
  viewer.resize();
  for (let i = 0; i < 100; i++) viewer.panBy(1, 10, "touch");
  assert.equal(frames.size, 1);
  assert.equal(draws, 0);
  for (let time = 16; frames.size && time < 1000; time += 16) {
    const pending = [...frames.values()]; frames.clear();
    pending.forEach((callback) => callback(time));
  }
  assert.ok(draws > 1 && draws < 20);
  assert.equal(frames.size, 0);
  assert.ok(Math.abs(Math.atan2(rotation[1], rotation[0]) - 0.15) < 1e-10);
  assert.deepEqual(rotation.slice(2), [1, 0]);
  viewer.panBy(10, 0, "mouse");
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  assert.equal(frames.size, 0);
  assert.equal(viewer.isContextLost(), true);
});
