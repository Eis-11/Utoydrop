import { Hono } from "hono";
import { getCatalog, saveCatalog, saveCategories, saveCollections } from "./catalog.js";
import { serveImage, uploadImage } from "./images.js";
import { archiveOrder, createOrder, listOrders, updateOrderStatus } from "./orders.js";
import {
  enforceOrigin,
  persistentRateLimit,
  randomToken,
  requireAdmin,
  safeEqual,
  securityHeaders,
  sessionTtlMs,
  sha256,
  writeSessionCookie,
} from "./security.js";
import { HttpError, readJson } from "./validation.js";

export const app = new Hono();

app.use("*", securityHeaders);
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store, no-cache, must-revalidate");
  await next();
});
app.use("/api/*", enforceOrigin);

app.get("/api/health", (c) => c.json({ ok: true, service: "utoy-drop-worker", environment: c.env.ENVIRONMENT || "local" }));

app.get("/api/catalog", async (c) => {
  const catalog = await getCatalog(c.env.DB);
  const body = JSON.stringify(catalog);
  const etag = `"${await sha256(body)}"`;
  c.header("ETag", etag);
  c.header("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  c.header("Vary", "Accept-Encoding");
  const ifNoneMatch = c.req.header("if-none-match");
  if (ifNoneMatch === "*" || ifNoneMatch?.replace(/^W\//, "") === etag) return c.body(null, 304);
  return c.body(body, 200, { "Content-Type": "application/json; charset=UTF-8" });
});

app.get("/api/products", async (c) => c.json((await getCatalog(c.env.DB)).products));
app.get("/api/categories", async (c) => c.json((await getCatalog(c.env.DB)).categories));
app.get("/api/collections", async (c) => c.json((await getCatalog(c.env.DB)).collections));

app.post("/api/orders", async (c) => {
  await persistentRateLimit(c, {
    scope: "orders",
    windowMs: 15 * 60_000,
    limit: 12,
    message: "Demasiados pedidos. Intenta de nuevo en unos minutos.",
  });
  const order = await createOrder(c.env.DB, await readJson(c.req.raw));
  return c.json({
    ...order,
    instagram: { handle: "@utoy_drop", url: "https://www.instagram.com/utoy_drop/" },
    nextStep: "Copia el resumen y envíalo por Instagram para confirmar disponibilidad.",
  }, order.replayed ? 200 : 201);
});

app.post("/api/admin/login", async (c) => {
  await persistentRateLimit(c, {
    scope: "admin_login",
    windowMs: 15 * 60_000,
    limit: 10,
    message: "Demasiados intentos. Espera unos minutos antes de volver a intentar.",
  });
  if (!c.env.ADMIN_PASSWORD) throw new HttpError(503, "La contraseña administrativa no está configurada.");
  const payload = await readJson(c.req.raw, 20_000);
  if (!(await safeEqual(payload.password, c.env.ADMIN_PASSWORD))) throw new HttpError(401, "Contraseña incorrecta.");
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = Date.now();
  const ttl = sessionTtlMs(c.env);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    c.env.DB.prepare(`
      INSERT INTO admin_sessions (token_hash, created_at, last_activity_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(tokenHash, now, now, now + ttl),
  ]);
  writeSessionCookie(c, token, ttl / 1000);
  return c.json({ ok: true, expiresIn: ttl });
});

app.get("/api/admin/session", requireAdmin, (c) => c.json({ ok: true }));

app.post("/api/admin/activity", requireAdmin, async (c) => {
  const now = Date.now();
  const ttl = sessionTtlMs(c.env);
  await c.env.DB.prepare(`
    UPDATE admin_sessions SET last_activity_at = ?, expires_at = ? WHERE token_hash = ? AND expires_at > ?
  `).bind(now, now + ttl, c.get("adminTokenHash"), now).run();
  writeSessionCookie(c, c.get("adminToken"), ttl / 1000);
  return c.json({ ok: true, expiresIn: ttl });
});

app.post("/api/admin/logout", requireAdmin, async (c) => {
  await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(c.get("adminTokenHash")).run();
  writeSessionCookie(c, "", 0);
  return c.json({ ok: true });
});

app.get("/api/admin/orders", requireAdmin, async (c) => c.json(await listOrders(c.env.DB)));

app.patch("/api/admin/orders/:id", requireAdmin, async (c) => {
  const payload = await readJson(c.req.raw, 20_000);
  return c.json(await updateOrderStatus(c.env.DB, c.req.param("id"), payload.status));
});

app.delete("/api/admin/orders/:id", requireAdmin, async (c) => {
  await persistentRateLimit(c, {
    scope: "admin_orders",
    windowMs: 60_000,
    limit: 30,
    message: "Demasiados cambios a pedidos. Espera un momento.",
  });
  return c.json(await archiveOrder(c.env.DB, c.req.param("id")));
});

app.put("/api/admin/products", requireAdmin, async (c) => {
  await persistentRateLimit(c, {
    scope: "admin_catalog",
    windowMs: 60_000,
    limit: 30,
    message: "Demasiados cambios al catálogo. Espera un momento.",
  });
  const payload = await readJson(c.req.raw, 9 * 1024 * 1024);
  const catalog = await saveCatalog(c.env.DB, payload.products, payload.revision);
  return c.json({ products: catalog.products, revision: catalog.revision });
});

app.put("/api/admin/categories", requireAdmin, async (c) => {
  await persistentRateLimit(c, {
    scope: "admin_catalog",
    windowMs: 60_000,
    limit: 30,
    message: "Demasiados cambios al catálogo. Espera un momento.",
  });
  const payload = await readJson(c.req.raw, 100_000);
  const result = await saveCategories(c.env.DB, payload.categories, payload.revision);
  return c.json({ categories: result.values, revision: result.revision });
});

app.put("/api/admin/collections", requireAdmin, async (c) => {
  await persistentRateLimit(c, {
    scope: "admin_catalog",
    windowMs: 60_000,
    limit: 30,
    message: "Demasiados cambios al catálogo. Espera un momento.",
  });
  const payload = await readJson(c.req.raw, 100_000);
  const result = await saveCollections(c.env.DB, payload.collections, payload.revision);
  return c.json({ collections: result.values, revision: result.revision });
});

app.post("/api/admin/upload", requireAdmin, async (c) => {
  await persistentRateLimit(c, {
    scope: "admin_upload",
    windowMs: 15 * 60_000,
    limit: 30,
    message: "Demasiadas cargas de imágenes. Espera unos minutos.",
  });
  return c.json(await uploadImage(c));
});

app.get("/uploads/:key", serveImage);

app.all("/api/*", () => { throw new HttpError(404, "Ruta no encontrada."); });

app.onError((error, c) => {
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error(error);
  c.header("Cache-Control", "private, no-store, no-cache, must-revalidate");
  return c.json({
    message: error instanceof HttpError ? error.message : "Ocurrió un error en el servidor.",
    ...(error instanceof HttpError ? { code: error.code } : {}),
  }, status);
});

export default app;
