import { test } from "node:test";
import assert from "node:assert/strict";
import { panoramaSize, panSensitivity, panoramaMesh, followAngle, createRenderBudget, createPanorama } from "../dist/panorama.js";

test("phone rotation follows swipe distance rather than fixed desktop sensitivity", () => {
  for (const width of [320, 390, 428, 926]) {
    assert.equal(width * panSensitivity(width, "touch"), Math.PI);
    const [w, h] = panoramaSize(width, 926, 3, 1, true);
    assert.ok(w <= width && w * h <= 450000);
  }
  assert.equal(panSensitivity(428, "mouse"), 0.004);
});

test("sphere mesh covers the complete image without an interpolated seam or invalid indices", () => {
  const { vertices, indices } = panoramaMesh();
  const count = vertices.length / 5;
  assert.equal(indices.length, 128 * 64 * 6);
  assert.ok(Math.max(...indices) < count && count < 65536);
  for (let row = 0; row <= 64; row++) {
    const first = row * 129 * 5, last = first + 128 * 5;
    for (let axis = 0; axis < 3; axis++)
      assert.ok(Math.abs(vertices[first + axis] - vertices[last + axis]) < 1e-6);
    assert.equal(vertices[first + 3], 0);
    assert.equal(vertices[last + 3], 1);
  }
  const center = (32 * 129 + 64) * 5;
  assert.deepEqual([...vertices.slice(center, center + 5)], [0, 0, 1, 0.5, 0.5]);
});

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

for (const mobile of [false, true]) test(`renderer (${mobile ? "phone" : "desktop"}) follows touch immediately, settles mouse input and stops at rest`, async (t) => {
  let id = 0, draws = 0, rotation, textureWidth;
  const frames = new Map();
  const gl = {
    getShaderParameter: () => true, getProgramParameter: () => true,
    getParameter: () => 4096, isContextLost: () => false,
    getUniformLocation: (_, key) => key,
    uniform4f: (_, ...values) => { rotation = values; },
    drawElements: () => { draws++; },
  };
  for (const name of ["createShader", "createProgram", "createBuffer", "createTexture",
    "shaderSource", "compileShader", "attachShader", "linkProgram", "useProgram",
    "bindBuffer", "bufferData", "getAttribLocation", "enableVertexAttribArray",
    "vertexAttribPointer", "bindTexture", "texParameteri", "texImage2D", "viewport",
    "uniform1f", "deleteShader", "deleteProgram", "deleteBuffer", "deleteTexture"])
    gl[name] = () => ({});
  gl.texImage2D = (...args) => { textureWidth = args.at(-1).width; };
  const replacements = {
    window: { devicePixelRatio: 3 }, matchMedia: query => ({ matches: mobile && query.includes("pointer: coarse") }),
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) },
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
  assert.equal(textureWidth, mobile ? 2048 : 4096);
  viewer.resize();
  for (let i = 0; i < 100; i++) viewer.panBy(1, 0, "mouse");
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
  // Direct touch needs exactly one rendered frame, with no delayed catch-up.
  const beforeTouch = draws;
  viewer.beginPan("touch");
  viewer.panBy(390, 0, "touch");
  const firstFrame = [...frames.values()]; frames.clear();
  firstFrame.forEach(callback => callback(1100));
  assert.equal(draws, beforeTouch + 1);
  assert.ok(Math.abs(Math.cos(0.15 - Math.PI) - rotation[0]) < 1e-10);
  // Holding a finger schedules timing checks, but doesn't repaint the GPU.
  const heldFrame = [...frames.values()]; frames.clear();
  heldFrame.forEach(callback => callback(1116));
  assert.equal(draws, beforeTouch + 1);
  viewer.endPan();
  const released = [...frames.values()]; frames.clear();
  released.forEach(callback => callback(1132));
  assert.equal(frames.size, 0);
  viewer.panBy(10, 0, "mouse");
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  assert.equal(frames.size, 0);
  assert.equal(viewer.isContextLost(), true);
});
