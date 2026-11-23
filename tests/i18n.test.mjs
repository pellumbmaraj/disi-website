import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sq, hasTranslation } from "../dist/i18n.js";
import { projectImages } from "../dist/project-images.js";

const decode = text => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

async function pageBody() {
  const html = await readFile("dist/index.html", "utf8");
  return html.slice(html.indexOf("<body>"))
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<(\w+)[^>]*data-i18n-html[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<(\w+)[^>]*translate="no"[^>]*>[\s\S]*?<\/\1>/g, "");
}

test("every visible English text on the page has an Albanian translation", async () => {
  const body = await pageBody();
  const missing = [];
  for (const match of body.matchAll(/>([^<]+)</g)) {
    const text = decode(match[1].replace(/\s+/g, " ").trim());
    if (/\p{L}/u.test(text) && !hasTranslation(text)) missing.push(text);
  }
  for (const match of body.matchAll(/\s(?:alt|aria-label)="([^"]+)"/g))
    if (!hasTranslation(decode(match[1]))) missing.push(match[1]);
  assert.deepEqual(missing, []);
});

test("styled headings, gallery descriptions and script messages are translated", async () => {
  const html = await readFile("dist/index.html", "utf8");
  for (const match of html.matchAll(/data-i18n-html="([^"]+)"/g)) assert.ok(sq[match[1]], match[1]);
  for (const photos of Object.values(projectImages))
    for (const photo of photos) assert.ok(hasTranslation(photo.alt), photo.alt);
  for (const file of ["app.js", "gallery.js"]) {
    const code = await readFile(`dist/${file}`, "utf8");
    for (const match of code.matchAll(/\bt\("([^"]+)"\)/g)) assert.ok(hasTranslation(match[1]), match[1]);
  }
  assert.ok(hasTranslation("9 projects shown.") && hasTranslation("15 images"));
});

test("translations keep their numbers and never empty a string", () => {
  for (const [english, albanian] of Object.entries(sq)) {
    assert.ok(albanian.trim().length > 0, english);
    for (const number of english.match(/\d+/g) || []) assert.ok(albanian.includes(number), `${english} → ${albanian}`);
  }
});
