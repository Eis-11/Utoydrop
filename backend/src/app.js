const crypto = require("crypto");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { rateLimit, sameOrigin, securityHeaders } = require("./middleware/security");
const { buildOrder } = require("./services/orderService");

const ORDER_STATUSES = new Set(["nuevo", "confirmado", "pagado", "enviado", "cerrado", "cancelado"]);
const ADMIN_COOKIE = "utoy_admin";

function safeEqual(supplied, expected) {
  const left = Buffer.from(String(supplied || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function cookieValue(req, name) {
  const prefix = `${name}=`;
  return String(req.get("cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) || "";
}

function sessionCookie(req, token, maxAgeSeconds) {
  const secure = req.secure || req.get("x-forwarded-proto") === "https";
  return `${ADMIN_COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

function validString(value, maxLength, { optional = false } = {}) {
  if (typeof value !== "string") return optional && value === undefined;
  const length = value.trim().length;
  const safeCharacters = !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
  return safeCharacters && (optional ? length <= maxLength : length > 0 && length <= maxLength);
}

function validOptions(values) {
  return Array.isArray(values) && values.length > 0 && values.length <= 30
    && values.every((value) => validString(value, 60));
}

function validImagePath(value) {
  return typeof value === "string" && value.length <= 300
    && /^\/(?:img|uploads)\/[A-Za-z0-9/_-]+\.(?:svg|jpe?g|png|webp)$/i.test(value)
    && !value.includes("..");
}

function validVariantStock(value, sizes, colors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > sizes.length * colors.length) return false;
  const allowedKeys = new Set(sizes.flatMap((size) => colors.map((color) => `${size}::${color}`)));
  return entries.every(([key, stock]) => allowedKeys.has(key) && Number.isInteger(Number(stock)) && Number(stock) >= 0 && Number(stock) <= 1_000_000);
}

function validateCatalog(products) {
  if (!Array.isArray(products) || products.length > 500) return false;
  const ids = new Set();
  return products.every((product) => {
    if (!product || typeof product !== "object" || Array.isArray(product)) return false;
    if (!(typeof product.id === "number" || typeof product.id === "string") || !String(product.id).trim() || ids.has(String(product.id))) return false;
    ids.add(String(product.id));
    const price = Number(product.price);
    const stock = Number(product.stock);
    return validString(product.name, 120)
      && validString(product.category, 60)
      && validString(product.collection, 80)
      && validString(product.option1Label || "Talla", 40)
      && validString(product.option2Label || "Color", 40)
      && validString(product.description || "", 800, { optional: true })
      && validString(product.badge || "", 40, { optional: true })
      && Number.isFinite(price) && price >= 0 && price <= 1_000_000
      && Number.isInteger(stock) && stock >= 0 && stock <= 1_000_000
      && validOptions(product.sizes)
      && validOptions(product.colors)
      && validImagePath(product.image)
      && validVariantStock(product.variantStock || {}, product.sizes, product.colors)
      && (product.active === undefined || typeof product.active === "boolean")
      && (product.featured === undefined || typeof product.featured === "boolean");
  });
}

function validateCategories(categories) {
  if (!Array.isArray(categories) || !categories.length || categories.length > 60) return false;
  const normalized = categories.map((category) => String(category || "").trim().toLocaleLowerCase("es-MX"));
  const reserved = new Set(["todo", "todas", "todos", "nuevos drops", "mas vendidos", "más vendidos"]);
  return categories.every((category) => validString(category, 60))
    && normalized.every((category) => !reserved.has(category))
    && new Set(normalized).size === normalized.length;
}

function validateCollections(collections) {
  if (!Array.isArray(collections) || !collections.length || collections.length > 100) return false;
  const normalized = collections.map((collection) => String(collection || "").trim().toLocaleLowerCase("es-MX"));
  const reserved = new Set(["toda", "todas", "colección", "colecciones"]);
  return collections.every((collection) => validString(collection, 80))
    && normalized.every((collection) => !reserved.has(collection))
    && new Set(normalized).size === normalized.length;
}

function imageType(buffer, declaredType) {
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  if ((declaredType === "jpeg" && jpeg) || (declaredType === "png" && png) || (declaredType === "webp" && webp)) {
    return declaredType === "jpeg" ? "jpg" : declaredType;
  }
  return "";
}

function createApp({ config, productsRepository, categoriesRepository, collectionsRepository, ordersRepository }) {
  const app = express();
  const sessions = new Map();
  const orderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, message: "Demasiados pedidos. Intenta de nuevo en unos minutos." });
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, message: "Demasiados intentos. Espera unos minutos antes de volver a intentar." });
  const catalogLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, message: "Demasiados cambios al catálogo. Espera un momento." });
  const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: "Demasiadas cargas de imágenes. Espera unos minutos." });

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(express.json({ limit: "9mb" }));
  app.use(sameOrigin);
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    next();
  });

  function requireAdmin(req, res, next) {
    const token = cookieValue(req, ADMIN_COOKIE);
    const expiresAt = token && sessions.get(token);
    if (!expiresAt || expiresAt <= Date.now()) {
      if (token) sessions.delete(token);
      return res.status(401).json({ message: "La sesión expiró. Inicia sesión de nuevo." });
    }
    req.adminToken = token;
    return next();
  }

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "utoy-drop", instagram: config.instagramHandle }));

  app.get("/api/products", async (_req, res, next) => {
    try {
      res.json(await productsRepository.read());
    } catch (error) { next(error); }
  });

  app.get("/api/categories", async (_req, res, next) => {
    try { res.json(await categoriesRepository.read()); } catch (error) { next(error); }
  });

  app.get("/api/collections", async (_req, res, next) => {
    try { res.json(await collectionsRepository.read()); } catch (error) { next(error); }
  });

  app.post("/api/orders", orderLimiter, async (req, res, next) => {
    try {
      const order = buildOrder(req.body, await productsRepository.read());
      await ordersRepository.update((orders) => [order, ...orders].slice(0, 5000));
      res.status(201).json({
        ...order,
        instagram: { handle: config.instagramHandle, url: config.instagramUrl },
        nextStep: "Copia el resumen y envíalo por Instagram para confirmar disponibilidad.",
      });
    } catch (error) { next(error); }
  });

  app.post("/api/admin/login", loginLimiter, (req, res) => {
    if (!safeEqual(req.body?.password, config.adminPassword)) {
      return res.status(401).json({ message: "Contraseña incorrecta." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, Date.now() + config.sessionTtlMs);
    res.set("Set-Cookie", sessionCookie(req, token, Math.floor(config.sessionTtlMs / 1000)));
    return res.json({ ok: true, expiresIn: config.sessionTtlMs });
  });

  app.get("/api/admin/session", requireAdmin, (_req, res) => res.json({ ok: true }));

  app.post("/api/admin/activity", requireAdmin, (req, res) => {
    sessions.set(req.adminToken, Date.now() + config.sessionTtlMs);
    res.set("Set-Cookie", sessionCookie(req, req.adminToken, Math.max(1, Math.ceil(config.sessionTtlMs / 1000))));
    res.json({ ok: true, expiresIn: config.sessionTtlMs });
  });

  app.post("/api/admin/logout", requireAdmin, (req, res) => {
    sessions.delete(req.adminToken);
    res.set("Set-Cookie", sessionCookie(req, "", 0));
    res.json({ ok: true });
  });

  app.get("/api/admin/orders", requireAdmin, async (_req, res, next) => {
    try { res.json(await ordersRepository.read()); } catch (error) { next(error); }
  });

  app.patch("/api/admin/orders/:id", requireAdmin, async (req, res, next) => {
    try {
      const status = String(req.body?.status || "").toLowerCase();
      if (!ORDER_STATUSES.has(status)) return res.status(400).json({ message: "Estado inválido." });
      let updatedOrder;
      await ordersRepository.update((orders) => orders.map((order) => {
        if (order.id !== req.params.id) return order;
        updatedOrder = { ...order, status, updatedAt: new Date().toISOString() };
        return updatedOrder;
      }));
      if (!updatedOrder) return res.status(404).json({ message: "Pedido no encontrado." });
      return res.json(updatedOrder);
    } catch (error) { return next(error); }
  });

  app.delete("/api/admin/orders/:id", requireAdmin, catalogLimiter, async (req, res, next) => {
    try {
      let removed = false;
      await ordersRepository.update((orders) => orders.filter((order) => {
        if (order.id !== req.params.id) return true;
        removed = true;
        return false;
      }));
      if (!removed) return res.status(404).json({ message: "Pedido no encontrado." });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  app.put("/api/admin/products", requireAdmin, catalogLimiter, async (req, res, next) => {
    try {
      if (!validateCatalog(req.body?.products)) return res.status(400).json({ message: "Catálogo inválido." });
      await productsRepository.write(req.body.products);
      return res.json({ products: req.body.products });
    } catch (error) { return next(error); }
  });

  app.put("/api/admin/categories", requireAdmin, catalogLimiter, async (req, res, next) => {
    try {
      if (!validateCategories(req.body?.categories)) return res.status(400).json({ message: "Lista de categorías inválida." });
      const categories = req.body.categories.map((category) => category.trim());
      await categoriesRepository.write(categories);
      return res.json({ categories });
    } catch (error) { return next(error); }
  });

  app.put("/api/admin/collections", requireAdmin, catalogLimiter, async (req, res, next) => {
    try {
      if (!validateCollections(req.body?.collections)) return res.status(400).json({ message: "Lista de colecciones inválida." });
      const collections = req.body.collections.map((collection) => collection.trim());
      await collectionsRepository.write(collections);
      return res.json({ collections });
    } catch (error) { return next(error); }
  });

  app.post("/api/admin/upload", requireAdmin, uploadLimiter, async (req, res, next) => {
    try {
      const match = String(req.body?.image || "").match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return res.status(400).json({ message: "Imagen inválida. Usa JPG, PNG o WebP." });
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) return res.status(400).json({ message: "La imagen debe pesar menos de 8 MB." });
      const extension = imageType(buffer, match[1]);
      if (!extension) return res.status(400).json({ message: "El contenido del archivo no coincide con una imagen válida." });
      await fs.mkdir(config.uploadsDirectory, { recursive: true });
      const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;
      await fs.writeFile(path.join(config.uploadsDirectory, filename), buffer, { flag: "wx" });
      return res.json({ url: `/uploads/${filename}` });
    } catch (error) { return next(error); }
  });

  app.use("/uploads", express.static(config.uploadsDirectory, { fallthrough: false, maxAge: "7d", immutable: true }));
  app.use(express.static(config.frontendDist, { maxAge: "1h", setHeaders: (res, filePath) => {
    if (filePath.endsWith("index.html")) res.set("Cache-Control", "no-cache");
  } }));

  app.use("/api", (_req, res) => res.status(404).json({ message: "Ruta no encontrada." }));
  app.get("*", (_req, res) => res.sendFile(path.join(config.frontendDist, "index.html")));

  app.use((error, _req, res, _next) => {
    const status = error.statusCode || (error.type === "entity.too.large" ? 413 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({ message: status >= 500 ? "Ocurrió un error en el servidor." : error.message });
  });

  return app;
}

module.exports = { createApp, validateCatalog, validateCategories, validateCollections };
