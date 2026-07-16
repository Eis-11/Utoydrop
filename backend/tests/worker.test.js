import { env, SELF } from "cloudflare:test";
import { describe, expect, test } from "vitest";

const ORIGIN = "https://example.com";
let clientCounter = 0;

function headers(extra = {}) {
  clientCounter += 1;
  return { Origin: ORIGIN, "X-Forwarded-For": `198.51.100.${(clientCounter % 240) + 1}`, ...extra };
}

function jsonRequest(path, method, body, extraHeaders = {}) {
  return SELF.fetch(`${ORIGIN}${path}`, {
    method,
    headers: headers({ "Content-Type": "application/json", ...extraHeaders }),
    body: JSON.stringify(body),
  });
}

async function login(password = "test-password", extraHeaders = {}) {
  const response = await jsonRequest("/api/admin/login", "POST", { password }, extraHeaders);
  return { response, cookie: response.headers.get("set-cookie")?.split(";")[0] || "" };
}

function product({ id = "test-product", stock = 2, variantStock = {} } = {}) {
  return {
    id,
    name: "Playera de prueba",
    category: "Playeras",
    collection: "UTOY DROP",
    price: 349,
    badge: "Nuevo",
    description: "Producto para pruebas automatizadas",
    option1Label: "Talla",
    option2Label: "Color",
    sizes: ["M"],
    colors: ["Negro"],
    stock,
    variantStock,
    image: "/img/logo-utoy-drop-small.jpg",
    active: true,
    featured: false,
  };
}

async function saveProducts(products) {
  const { cookie } = await login();
  const revision = (await (await SELF.fetch(`${ORIGIN}/api/catalog`)).json()).revision;
  const response = await jsonRequest("/api/admin/products", "PUT", { products, revision }, { Cookie: cookie });
  expect(response.status).toBe(200);
  return cookie;
}

function orderPayload(items = [{ id: "test-product", size: "M", color: "Negro", quantity: 1 }]) {
  return {
    customer: {
      name: "Cliente de prueba",
      instagram: "@cliente_prueba",
      city: "Ciudad de prueba",
      delivery: "Entrega local",
      payment: "Efectivo",
      notes: "",
    },
    items,
  };
}

async function placeOrder(items) {
  return jsonRequest("/api/orders", "POST", orderPayload(items));
}

async function variantStocks() {
  const result = await env.DB.prepare("SELECT option1_value, option2_value, stock FROM product_variants WHERE active = 1 ORDER BY option1_value, option2_value").all();
  return result.results.map((row) => Number(row.stock));
}

async function patchOrder(cookie, id, status) {
  return jsonRequest(`/api/admin/orders/${id}`, "PATCH", { status }, { Cookie: cookie });
}

async function archive(cookie, id) {
  return SELF.fetch(`${ORIGIN}/api/admin/orders/${id}`, { method: "DELETE", headers: headers({ Cookie: cookie }) });
}

describe("UTOY DROP Worker", () => {
  test("expone salud y cabeceras de seguridad", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/health`);
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  test("publica el catálogo unificado con ETag y caché corta", async () => {
    const first = await SELF.fetch(`${ORIGIN}/api/catalog`);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toContain("max-age=30");
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const second = await SELF.fetch(`${ORIGIN}/api/catalog`, { headers: { "If-None-Match": etag } });
    expect(second.status).toBe(304);
  });

  test("protege el catálogo administrativo sin sesión", async () => {
    const response = await jsonRequest("/api/admin/products", "PUT", { products: [] });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  test("guarda solo el hash de la sesión y emite cookie segura", async () => {
    const { response, cookie } = await login();
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    const rawToken = cookie.split("=")[1];
    const stored = await env.DB.prepare("SELECT token_hash FROM admin_sessions").first();
    expect(stored.token_hash).toHaveLength(64);
    expect(stored.token_hash).not.toBe(rawToken);
  });

  test("no acepta tokens administrativos por Authorization", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/admin/session`, { headers: { Authorization: "Bearer cualquier-token" } });
    expect(response.status).toBe(401);
  });

  test("cierra la sesión administrativa", async () => {
    const { cookie } = await login();
    const logout = await SELF.fetch(`${ORIGIN}/api/admin/logout`, { method: "POST", headers: headers({ Cookie: cookie }) });
    expect(logout.status).toBe(200);
    const session = await SELF.fetch(`${ORIGIN}/api/admin/session`, { headers: { Cookie: cookie } });
    expect(session.status).toBe(401);
  });

  test("expira sesiones persistidas en D1", async () => {
    const { cookie } = await login();
    await env.DB.prepare("UPDATE admin_sessions SET expires_at = 1").run();
    const response = await SELF.fetch(`${ORIGIN}/api/admin/session`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(401);
  });

  test("bloquea escrituras desde otro origen", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/orders`, {
      method: "POST",
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload()),
    });
    expect(response.status).toBe(403);
  });

  test("administra categorías y colecciones en D1", async () => {
    const { cookie } = await login();
    const revision = (await (await SELF.fetch(`${ORIGIN}/api/catalog`)).json()).revision;
    const categories = await jsonRequest("/api/admin/categories", "PUT", { categories: ["Playeras", "Otros"], revision }, { Cookie: cookie });
    const categoriesBody = await categories.clone().json();
    const collections = await jsonRequest("/api/admin/collections", "PUT", { collections: ["UTOY DROP", "Colección prueba"], revision: categoriesBody.revision }, { Cookie: cookie });
    expect(categories.status).toBe(200);
    expect(collections.status).toBe(200);
    const catalog = await (await SELF.fetch(`${ORIGIN}/api/catalog`)).json();
    expect(catalog.categories).toEqual(["Playeras", "Otros"]);
    expect(catalog.collections).toEqual(["UTOY DROP", "Colección prueba"]);
  });

  test("calcula el total con precios del servidor y reserva inventario", async () => {
    await saveProducts([product({ stock: 2 })]);
    const response = await placeOrder([{ id: "test-product", size: "M", color: "Negro", quantity: 2, price: 1 }]);
    expect(response.status).toBe(201);
    const order = await response.json();
    expect(order.total).toBe(698);
    expect(order.inventoryState).toBe("reserved");
    expect(await variantStocks()).toEqual([0]);
  });

  test("rechaza el pedido completo cuando una variante no tiene stock", async () => {
    const withVariants = product({
      stock: 1,
      variantStock: { "M::Negro": 1, "M::Blanco": 0 },
    });
    withVariants.colors = ["Negro", "Blanco"];
    await saveProducts([withVariants]);
    const before = Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM orders").first()).count);
    const response = await placeOrder([
      { id: "test-product", size: "M", color: "Negro", quantity: 1 },
      { id: "test-product", size: "M", color: "Blanco", quantity: 1 },
    ]);
    expect(response.status).toBe(409);
    expect(await variantStocks()).toEqual([0, 1]);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM orders").first()).count)).toBe(before);
  });

  test("dos pedidos simultáneos no pueden sobre-vender la última pieza", async () => {
    await saveProducts([product({ stock: 1 })]);
    const ordersBefore = Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM orders").first()).count);
    const movementsBefore = Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'reserve'").first()).count);
    const responses = await Promise.all([placeOrder(), placeOrder()]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await variantStocks()).toEqual([0]);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM orders").first()).count)).toBe(ordersBefore + 1);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'reserve'").first()).count)).toBe(movementsBefore + 1);
  });

  test("rechaza una edición administrativa obsoleta después de una reserva", async () => {
    const cookie = await saveProducts([product({ stock: 1 })]);
    const staleCatalog = await (await SELF.fetch(`${ORIGIN}/api/catalog`)).json();
    expect((await placeOrder()).status).toBe(201);
    const response = await jsonRequest("/api/admin/products", "PUT", {
      products: staleCatalog.products,
      revision: staleCatalog.revision,
    }, { Cookie: cookie });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("catalog_revision_conflict");
    expect(await variantStocks()).toEqual([0]);
  });

  test("la doble cancelación restaura inventario una sola vez", async () => {
    const cookie = await saveProducts([product({ stock: 1 })]);
    const created = await (await placeOrder()).json();
    expect((await patchOrder(cookie, created.id, "cancelado")).status).toBe(200);
    expect((await patchOrder(cookie, created.id, "cancelado")).status).toBe(200);
    expect(await variantStocks()).toEqual([1]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'restore_cancel'").first()).count).toBe(1);
  });

  test("rechaza reactivar un pedido cancelado y conserva inventario", async () => {
    const cookie = await saveProducts([product({ stock: 1 })]);
    const created = await (await placeOrder()).json();
    await patchOrder(cookie, created.id, "cancelado");
    const response = await patchOrder(cookie, created.id, "confirmado");
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("cancelled_order_terminal");
    expect(await variantStocks()).toEqual([1]);
  });

  test("archivar dos veces un pedido nuevo restaura una sola vez y conserva historial", async () => {
    const cookie = await saveProducts([product({ stock: 1 })]);
    const created = await (await placeOrder()).json();
    expect((await archive(cookie, created.id)).status).toBe(200);
    expect((await archive(cookie, created.id)).status).toBe(200);
    expect(await variantStocks()).toEqual([1]);
    const stored = await env.DB.prepare("SELECT archived_at, inventory_state FROM orders WHERE id = ?").bind(created.id).first();
    expect(stored.archived_at).toBeTruthy();
    expect(stored.inventory_state).toBe("restored");
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE kind = 'restore_archive'").first()).count).toBe(1);
  });

  test("archivar un pedido confirmado no restaura inventario ni borra el registro", async () => {
    const cookie = await saveProducts([product({ stock: 1 })]);
    const created = await (await placeOrder()).json();
    expect((await patchOrder(cookie, created.id, "confirmado")).status).toBe(200);
    expect((await archive(cookie, created.id)).status).toBe(200);
    expect(await variantStocks()).toEqual([0]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE id = ? AND archived_at IS NOT NULL").bind(created.id).first()).count).toBe(1);
  });

  test("archivar un pedido cancelado no devuelve inventario por segunda vez", async () => {
    const cookie = await saveProducts([product({ stock: 1 })]);
    const created = await (await placeOrder()).json();
    await patchOrder(cookie, created.id, "cancelado");
    await archive(cookie, created.id);
    expect(await variantStocks()).toEqual([1]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE order_id = ? AND quantity_delta > 0").bind(created.id).first()).count).toBe(1);
  });

  test("rechaza archivos disfrazados como imágenes", async () => {
    const { cookie } = await login();
    const response = await SELF.fetch(`${ORIGIN}/api/admin/upload`, {
      method: "POST",
      headers: headers({ Cookie: cookie, "Content-Type": "image/png" }),
      body: new TextEncoder().encode("esto no es una imagen"),
    });
    expect(response.status).toBe(400);
  });

  test("guarda WebP válido en R2 y lo sirve con Content-Type seguro", async () => {
    const { cookie } = await login();
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
    const upload = await SELF.fetch(`${ORIGIN}/api/admin/upload`, {
      method: "POST",
      headers: headers({ Cookie: cookie, "Content-Type": "image/webp" }),
      body: webp,
    });
    expect(upload.status).toBe(200);
    const { url } = await upload.json();
    const image = await SELF.fetch(`${ORIGIN}${url}`);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/webp");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("limita intentos de contraseña de forma persistente", async () => {
    const fixed = { "X-Forwarded-For": "203.0.113.200" };
    let response;
    for (let index = 0; index < 11; index += 1) response = (await login("incorrecta", fixed)).response;
    expect(response.status).toBe(429);
    const record = await env.DB.prepare("SELECT request_count FROM rate_limits WHERE scope = 'admin_login' ORDER BY request_count DESC LIMIT 1").first();
    expect(Number(record.request_count)).toBeGreaterThan(10);
  });

  test("sirve la SPA y conserva las cabeceras estáticas", async () => {
    const response = await env.ASSETS.fetch(new Request(`${ORIGIN}/ruta-interna`, { headers: { "Sec-Fetch-Mode": "navigate" } }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="root"');
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});
