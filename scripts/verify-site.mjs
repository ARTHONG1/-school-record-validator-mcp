import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = resolve(root, "site");
const html = await readFile(resolve(site, "index.html"), "utf8");
const required = ["School Record Validator MCP", "#connect", "#results", "#examples", "#faq", "check_school_record", "pass", "revise", "prohibited"];
for (const value of required) if (!html.includes(value)) throw new Error(`site/index.html is missing required content: ${value}`);
const forbidden = [/YOUR[_-]/iu, /C:\\Users\\/u, /Bearer\s+[^<\s]+/iu, /student[_-]?name\s*[:=]\s*(?!김철수)/iu, /google-analytics|plausible\.io|segment\.com/iu];
for (const pattern of forbidden) if (pattern.test(html)) throw new Error(`forbidden site content matched: ${pattern}`);
const references = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+)/gu)].map((match) => match[1]);
for (const reference of references) {
  const target = resolve(site, reference.slice(2));
  if (!relative(site, target) || relative(site, target).startsWith("..")) throw new Error(`site path escapes site root: ${reference}`);
  await access(target);
}
const app = await readFile(resolve(site, "app.js"), "utf8");
if (!app.includes("clipboard") || !app.includes("aria-selected")) throw new Error("site/app.js is missing copy or tab behavior");
console.log(`site verification passed: ${references.length} local references checked`);
