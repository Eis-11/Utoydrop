import { spawn } from "node:child_process";
import path from "node:path";

const port = 8791;
const baseUrl = `http://127.0.0.1:${port}`;
const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
const child = spawn(process.execPath, [
  wrangler, "dev", "--env", "preview", "--local",
  "--ip", "127.0.0.1", "--port", String(port),
  "--var", "ADMIN_PASSWORD:wrangler-local-test-only",
], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

async function waitForWorker() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Wrangler terminó antes de iniciar.\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Wrangler no respondió dentro de 30 segundos.\n${output}`);
}

try {
  await waitForWorker();
  const health = await fetch(`${baseUrl}/api/health`);
  const catalog = await fetch(`${baseUrl}/api/catalog`);
  const root = await fetch(`${baseUrl}/`);
  const spa = await fetch(`${baseUrl}/catalogo/ruta-interna`, { headers: { "Sec-Fetch-Mode": "navigate" } });
  if (!health.ok || !(await health.json()).ok) throw new Error("Falló /api/health.");
  if (!catalog.ok || !catalog.headers.get("etag")) throw new Error("Falló /api/catalog o su ETag.");
  if (!root.ok || !(await root.text()).includes('id="root"')) throw new Error("No se sirvió el frontend.");
  if (!spa.ok || !(await spa.text()).includes('id="root"')) throw new Error("Falló la recarga de una ruta SPA.");
  console.log("Wrangler local: health, catálogo, assets y fallback SPA correctos.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
