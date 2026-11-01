import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createGalleryLoader } from "../dist/gallery.js";
import { projectImages } from "../dist/project-images.js";

test("all 75 supplied photographs have bounded, correctly sized and fingerprinted WebP exports", async () => {
  assert.deepEqual(Object.values(projectImages).map(photos => photos.length), [15, 2, 5, 17, 13, 5, 8, 10]);
  const seen = new Set();
  let total = 0;
  for (const photos of Object.values(projectImages)) for (const photo of photos) {
    assert.ok(photo.alt.length > 15);
    assert.ok(!seen.has(photo.src));
    seen.add(photo.src);
    const sizes = [];
    for (const source of photo.srcset.split(",")) {
      const [file, descriptor] = source.trim().split(/\s/);
      const bytes = await readFile("dist/" + file.slice(2));
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 16), "WEBPVP8 ");
      const width = bytes.readUInt16LE(26) & 16383, height = bytes.readUInt16LE(28) & 16383;
      assert.equal(descriptor, `${width}w`);
      assert.ok(width <= 2400 && height <= 2400);
      assert.ok(bytes.length < 900000, file);
      assert.ok(file.includes(createHash("sha256").update(bytes).digest("hex").slice(0, 8)), file);
      if (file === photo.preview) assert.ok(width <= 960);
      if (file === photo.src) assert.deepEqual([width, height], [photo.width, photo.height]);
      sizes.push(file);
      total += bytes.length;
    }
    assert.ok(sizes.includes(photo.preview) && sizes.includes(photo.src));
  }
  assert.equal(seen.size, 75);
  assert.ok(total < 31e6);
});

test("a mobile gallery decodes only its bounded preview before returning the image", async () => {
  let ready, allocated = 0;
  const loader = createGalleryLoader(() => { allocated++; return { decode: () => new Promise(resolve => { ready = resolve; }) }; });
  const photo = projectImages[0][0];
  const pending = loader.load(photo, true);
  let displayed = false;
  pending.then(() => { displayed = true; });
  assert.equal(displayed, false);
  assert.equal(allocated, 1);
  ready();
  const image = await pending;
  assert.equal(image.src, photo.preview);
  assert.equal(image.srcset, undefined);
  assert.equal(image.decoding, "async");
  assert.equal(image.alt, photo.alt);
});

test("closing or changing the gallery discards late image decodes", async () => {
  const images = [], ready = [];
  const loader = createGalleryLoader(() => {
    const image = { decode: () => new Promise(resolve => ready.push(resolve)) };
    images.push(image); return image;
  });
  const old = loader.load(projectImages[0][0]);
  const latest = loader.load(projectImages[0][1]);
  ready[0](); ready[1]();
  assert.equal(await old, null);
  assert.equal(await latest, images[1]);
  assert.equal(images[1].srcset, projectImages[0][1].srcset);
  const closed = loader.load(projectImages[0][2]);
  loader.cancel(); ready[2]();
  assert.equal(await closed, null);
});

test("a failed obsolete decode is ignored while a current failure is reported", async () => {
  let fail;
  const loader = createGalleryLoader(() => ({ decode: () => new Promise((_, reject) => { fail = reject; }) }));
  const stale = loader.load(projectImages[0][0]);
  loader.cancel(); fail(new Error("Obsolete"));
  assert.equal(await stale, null);
  const current = loader.load(projectImages[0][0]);
  fail(new Error("Image unavailable"));
  await assert.rejects(current, /Image unavailable/);
});
