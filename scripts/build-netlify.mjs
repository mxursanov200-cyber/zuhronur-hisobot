import { mkdir, rm, writeFile, copyFile } from "node:fs/promises";
import worker from "../worker/index.js";

const output = new URL("../netlify-dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const response = await worker.fetch(new Request("https://example.test/"), {});
if (!response.ok) throw new Error(`HTML yaratilmadi: ${response.status}`);
const html = await response.text();
await writeFile(new URL("index.html", output), html, "utf8");
await copyFile(new URL("../netlify.toml", import.meta.url), new URL("netlify.toml", output));
console.log("Netlify uchun tayyor: netlify-dist/index.html");
