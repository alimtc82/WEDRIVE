import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = "dist/client";
async function walk(dir) {
  const items = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) items.push(...await walk(full)); else items.push(full);
  }
  return items;
}
const files = {};
for (const file of await walk(root)) {
  const key = "/" + relative(root, file).replaceAll("\\", "/");
  files[key] = Buffer.from(await readFile(file)).toString("base64");
}
const worker = `const files=${JSON.stringify(files)};const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',woff2:'font/woff2'};export default{async fetch(req){const u=new URL(req.url);let p=u.pathname; if(!files[p]) p='/index.html';const ext=p.split('.').pop();const raw=Uint8Array.from(atob(files[p]),c=>c.charCodeAt(0));return new Response(raw,{headers:{'content-type':types[ext]||'application/octet-stream','cache-control':p==='/index.html'?'no-cache':'public, max-age=31536000, immutable'}})}};`;
await mkdir("dist/server", { recursive: true });
await writeFile("dist/server/index.js", worker);
