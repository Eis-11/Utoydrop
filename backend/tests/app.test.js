const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp, validateCatalog, validateCategories, validateCollections } = require("../src/app");

class MemoryRepository {
  constructor(value) { this.value = value; }
  async read() { return this.value; }
  async write(value) { this.value = value; return value; }
  async update(updater) { this.value = await updater(this.value); return this.value; }
}

const product = {
  id: 1, name: "Playera UTOY", category: "Playeras", collection: "UTOY DROP", price: 399,
  sizes: ["M"], colors: ["Negro"], option1Label: "Talla", option2Label: "Color",
  stock: 2, active: true, featured: false, image: "/img/logo-utoy-drop-small.jpg", variantStock: {}, description: "Producto para pruebas automatizadas",
};

async function withServer(run, configOverrides = {}) {
  const productsRepository = new MemoryRepository([product]);
  const categoriesRepository = new MemoryRepository(["Playeras", "Sudaderas"]);
  const collectionsRepository = new MemoryRepository(["UTOY DROP", "Skydream"]);
  const ordersRepository = new MemoryRepository([]);
  const config = {
    adminPassword: "test-password", sessionTtlMs: 60_000,
    instagramHandle: "@utoy_drop", instagramUrl: "https://www.instagram.com/utoy_drop/",
    uploadsDirectory: `${__dirname}/fixtures/uploads`, frontendDist: `${__dirname}/fixtures/dist`,
    ...configOverrides,
  };
  const server = createApp({ config, productsRepository, categoriesRepository, collectionsRepository, ordersRepository }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${server.address().port}`, ordersRepository);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("expone salud y cabeceras de seguridad", async () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/health`, { headers: { "X-Forwarded-Proto": "https" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(response.headers.get("content-security-policy"), /object-src 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.match(response.headers.get("strict-transport-security"), /max-age=31536000/);
  assert.equal((await response.json()).instagram, "@utoy_drop");
}));

test("registra un pedido con el total confiable del servidor", async () => withServer(async (baseUrl, ordersRepository) => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer: { name: "Cliente", instagram: "@cliente", city: "CDMX" },
      items: [{ id: 1, size: "M", color: "Negro", quantity: 2, price: 1 }],
    }),
  });
  const order = await response.json();
  assert.equal(response.status, 201);
  assert.equal(order.total, 798);
  assert.equal(order.instagram.handle, "@utoy_drop");
  assert.equal((await ordersRepository.read()).length, 1);
}));

test("bloquea escrituras desde otro origen", async () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://example.com" },
    body: "{}",
  });
  assert.equal(response.status, 403);
}));

test("protege el catálogo sin una sesión administrativa", async () => withServer(async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/admin/products`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ products: [product] }),
  });
  assert.equal(response.status, 401);
}));

test("usa una cookie HttpOnly segura y no acepta tokens del navegador", async () => withServer(async (baseUrl) => {
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
    body: JSON.stringify({ password: "test-password" }),
  });
  const setCookie = login.headers.get("set-cookie");
  assert.equal(login.status, 200);
  assert.match(setCookie, /utoy_admin=[^;]+/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /Path=\/api\/admin/i);

  const cookie = setCookie.split(";")[0];
  const session = await fetch(`${baseUrl}/api/admin/session`, { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);

  const bearerOnly = await fetch(`${baseUrl}/api/admin/session`, { headers: { Authorization: "Bearer token-en-local-storage" } });
  assert.equal(bearerOnly.status, 401);
}));

test("cierra la sesión administrativa por inactividad y permite renovarla con actividad real", async () => withServer(async (baseUrl) => {
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "test-password" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];

  await new Promise((resolve) => setTimeout(resolve, 100));
  const activity = await fetch(`${baseUrl}/api/admin/activity`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(activity.status, 200);

  await new Promise((resolve) => setTimeout(resolve, 100));
  const stillActive = await fetch(`${baseUrl}/api/admin/session`, { headers: { Cookie: cookie } });
  assert.equal(stillActive.status, 200);

  await new Promise((resolve) => setTimeout(resolve, 100));
  const expired = await fetch(`${baseUrl}/api/admin/session`, { headers: { Cookie: cookie } });
  assert.equal(expired.status, 401);
}, { sessionTtlMs: 180 }));

test("la cookie administrativa no permite cambios desde otro origen", async () => withServer(async (baseUrl) => {
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "test-password" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const response = await fetch(`${baseUrl}/api/admin/products`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://attacker.example" },
    body: JSON.stringify({ products: [product] }),
  });
  assert.equal(response.status, 403);
}));

test("publica categorías administrables para los filtros de la tienda", async () => withServer(async (baseUrl) => {
  const initial = await fetch(`${baseUrl}/api/categories`);
  assert.deepEqual(await initial.json(), ["Playeras", "Sudaderas"]);
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "test-password" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const update = await fetch(`${baseUrl}/api/admin/categories`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ categories: ["Playeras", "Sudaderas", "Shorts", "Perfumes"] }),
  });
  assert.equal(update.status, 200);
  const published = await fetch(`${baseUrl}/api/categories`);
  assert.deepEqual(await published.json(), ["Playeras", "Sudaderas", "Shorts", "Perfumes"]);
}));

test("publica colecciones administrables para la tienda", async () => withServer(async (baseUrl) => {
  const initial = await fetch(`${baseUrl}/api/collections`);
  assert.deepEqual(await initial.json(), ["UTOY DROP", "Skydream"]);
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "test-password" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const update = await fetch(`${baseUrl}/api/admin/collections`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ collections: ["UTOY DROP", "Skydream", "Drop especial"] }),
  });
  assert.equal(update.status, 200);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/collections`)).json(), ["UTOY DROP", "Skydream", "Drop especial"]);
}));

test("permite al administrador eliminar pedidos", async () => withServer(async (baseUrl, ordersRepository) => {
  const created = await fetch(`${baseUrl}/api/orders`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer: { name: "Cliente", instagram: "@cliente", city: "CDMX" }, items: [{ id: 1, size: "M", color: "Negro", quantity: 1 }] }),
  });
  const order = await created.json();
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "test-password" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const removed = await fetch(`${baseUrl}/api/admin/orders/${order.id}`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(removed.status, 200);
  assert.equal((await ordersRepository.read()).length, 0);
}));

test("rechaza archivos disfrazados como imágenes", async () => withServer(async (baseUrl) => {
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "test-password" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const response = await fetch(`${baseUrl}/api/admin/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ image: `data:image/png;base64,${Buffer.from("<html>ataque</html>").toString("base64")}` }),
  });
  assert.equal(response.status, 400);
}));

test("limita intentos repetidos de contraseña", async () => withServer(async (baseUrl) => {
  let response;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    response = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "incorrecta" }),
    });
  }
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
}));

test("valida productos genéricos y rechaza rutas o IDs inseguros", () => {
  const perfume = {
    ...product, id: 2, name: "Perfume UTOY", category: "Perfumes",
    option1Label: "Presentación", option2Label: "Aroma", sizes: ["50 ml", "100 ml"], colors: ["Original"],
  };
  assert.equal(validateCatalog([product, perfume]), true);
  assert.equal(validateCatalog([product, { ...perfume, id: 1 }]), false);
  assert.equal(validateCatalog([{ ...product, image: "javascript:alert(1)" }]), false);
  assert.equal(validateCatalog([{ ...product, name: "<script>alert(1)</script>" }]), false);
  assert.equal(validateCatalog([{ ...product, sizes: [] }]), false);
  assert.equal(validateCatalog([{ ...product, price: 10_000_000 }]), false);
});

test("valida categorías únicas y seguras", () => {
  assert.equal(validateCategories(["Playeras", "Shorts", "Perfumes"]), true);
  assert.equal(validateCategories(["Playeras", "playeras"]), false);
  assert.equal(validateCategories(["Todo", "Playeras"]), false);
  assert.equal(validateCategories(["<script>"]), false);
});

test("valida colecciones únicas y seguras", () => {
  assert.equal(validateCollections(["UTOY DROP", "Skydream"]), true);
  assert.equal(validateCollections(["UTOY DROP", "utoy drop"]), false);
  assert.equal(validateCollections(["Colecciones"]), false);
  assert.equal(validateCollections(["<script>"]), false);
});
