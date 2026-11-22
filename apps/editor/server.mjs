import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const port = Number(process.env.PORT ?? 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const appRoutes = new Set(["/apps/editor/", "/apps/library/"]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    const canonical = pathname === "/" ? "/apps/editor/" : `${pathname}/`;
    if (appRoutes.has(canonical)) {
      response.writeHead(302, { Location: canonical + url.search });
      response.end();
      return;
    }
    const relative = (appRoutes.has(pathname) ? `${pathname}index.html` : pathname).replace(/^\/+/, "");
    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error("outside root");
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`AgentSceneBuilder: http://127.0.0.1:${server.address().port}\n`);
});
