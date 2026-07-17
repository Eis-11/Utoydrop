import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";

const ORIGIN = "https://example.com";
let clientCounter = 20;

function headers(extra = {}) {
  clientCounter += 1;
  return {
    Origin: ORIGIN,
    "X-Forwarded-For": `192.0.2.${(clientCounter % 220) + 1}`,
    ...extra,
  };
}

async function login() {
  const response = await SELF.fetch(`${ORIGIN}/api/admin/login`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ password: "test-password" }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie").split(";")[0];
}

function dropPayload(overrides = {}) {
  return {
    imageUrl: "/img/logo-utoy-drop-hero.jpg",
    imageAlt: "Imagen accesible del drop",
    topLabel: "NUEVO DROP",
    bottomLabel: "OVERSIZE / HEAVYWEIGHT",
    cardBrand: "UTOY DROP",
    cardFooterLeft: "STREETWEAR SELECTED",
    cardFooterRight: "DROP 01",
    verticalLabel: "LIMITED / 001",
    targetType: "none",
    targetId: null,
    ...overrides,
  };
}

async function adminJson(cookie, path, method = "GET", body) {
  return SELF.fetch(`${ORIGIN}${path}`, {
    method,
    headers: headers({
      Cookie: cookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createDrop(cookie, payload = dropPayload()) {
  const response = await adminJson(cookie, "/api/admin/featured-drops", "POST", payload);
  expect(response.status).toBe(201);
  return (await response.json()).drop;
}

async function publishDrop(cookie, id, confirmReplace = false) {
  return adminJson(cookie, `/api/admin/featured-drops/${id}/publish`, "POST", { confirmReplace });
}

async function uploadWebp(cookie) {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0,
    0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0,
  ]);
  const response = await SELF.fetch(`${ORIGIN}/api/admin/upload`, {
    method: "POST",
    headers: headers({ Cookie: cookie, "Content-Type": "image/webp" }),
    body: bytes,
  });
  expect(response.status).toBe(200);
  return (await response.json()).url;
}

async function deleteImage(cookie, imageUrl) {
  const key = imageUrl.split("/").pop();
  return SELF.fetch(`${ORIGIN}/api/admin/images/${key}`, {
    method: "DELETE",
    headers: headers({ Cookie: cookie }),
  });
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM featured_drops").run();
});

describe("Drop destacado", () => {
  test("protege las rutas administrativas", async () => {
    expect((await SELF.fetch(`${ORIGIN}/api/admin/featured-drops`)).status).toBe(401);
    expect((await adminJson("", "/api/admin/featured-drops", "POST", dropPayload())).status).toBe(401);
  });

  test("crea y edita un borrador sin aceptar HTML ni rutas inválidas", async () => {
    const cookie = await login();
    const created = await createDrop(cookie);
    expect(created.status).toBe("draft");

    const edited = await adminJson(cookie, `/api/admin/featured-drops/${created.id}`, "PUT", {
      ...dropPayload(),
      topLabel: "DROP DE JULIO",
    });
    expect(edited.status).toBe(200);
    expect((await edited.json()).drop.topLabel).toBe("DROP DE JULIO");

    const html = await adminJson(cookie, "/api/admin/featured-drops", "POST", dropPayload({ topLabel: "<b>DROP</b>" }));
    expect(html.status).toBe(400);
    const invalidImage = await adminJson(cookie, "/api/admin/featured-drops", "POST", dropPayload({ imageUrl: "https://evil.example/image.jpg" }));
    expect(invalidImage.status).toBe(400);
  });

  test("publica con ETag y caché corta, y se oculta inmediatamente", async () => {
    const cookie = await login();
    const created = await createDrop(cookie);
    expect((await publishDrop(cookie, created.id)).status).toBe(200);

    const first = await SELF.fetch(`${ORIGIN}/api/featured-drop`);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toContain("s-maxage=30");
    const body = await first.json();
    expect(body.drop.id).toBe(created.id);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    expect((await SELF.fetch(`${ORIGIN}/api/featured-drop`, { headers: { "If-None-Match": etag } })).status).toBe(304);

    const hidden = await adminJson(cookie, `/api/admin/featured-drops/${created.id}/hide`, "POST", {});
    expect(hidden.status).toBe(200);
    expect((await (await SELF.fetch(`${ORIGIN}/api/featured-drop`)).json()).drop).toBeNull();
  });

  test("confirma el reemplazo, conserva historial y permite recuperar uno anterior", async () => {
    const cookie = await login();
    const first = await createDrop(cookie, dropPayload({ topLabel: "DROP UNO" }));
    const second = await createDrop(cookie, dropPayload({ topLabel: "DROP DOS" }));
    expect((await publishDrop(cookie, first.id)).status).toBe(200);

    const withoutConfirmation = await publishDrop(cookie, second.id);
    expect(withoutConfirmation.status).toBe(409);
    expect((await withoutConfirmation.json()).code).toBe("featured_drop_replace_confirmation_required");
    expect((await publishDrop(cookie, second.id, true)).status).toBe(200);

    let stored = await env.DB.prepare("SELECT id, status FROM featured_drops ORDER BY created_at").all();
    expect(stored.results.filter((row) => row.status === "published")).toHaveLength(1);
    expect(stored.results.find((row) => row.id === first.id).status).toBe("archived");

    expect((await publishDrop(cookie, first.id, true)).status).toBe(200);
    stored = await env.DB.prepare("SELECT id, status FROM featured_drops").all();
    expect(stored.results.filter((row) => row.status === "published")).toEqual([
      expect.objectContaining({ id: first.id }),
    ]);
    expect(stored.results.find((row) => row.id === second.id).status).toBe("archived");
  });

  test("el índice impide que dos drops queden activos simultáneamente", async () => {
    const cookie = await login();
    const first = await createDrop(cookie, dropPayload({ topLabel: "DROP CONCURRENTE UNO" }));
    const second = await createDrop(cookie, dropPayload({ topLabel: "DROP CONCURRENTE DOS" }));
    const responses = await Promise.all([
      publishDrop(cookie, first.id, true),
      publishDrop(cookie, second.id, true),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM featured_drops WHERE status = 'published'").first();
    expect(Number(count.count)).toBe(1);
  });

  test("valida que el producto o la colección de destino existan", async () => {
    const cookie = await login();
    const missing = await createDrop(cookie, dropPayload({ targetType: "product", targetId: "producto-inexistente" }));
    const response = await publishDrop(cookie, missing.id);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("featured_drop_target_missing");

    const collection = await createDrop(cookie, dropPayload({ targetType: "collection", targetId: "UTOY DROP" }));
    expect((await publishDrop(cookie, collection.id)).status).toBe(200);
    expect((await (await SELF.fetch(`${ORIGIN}/api/featured-drop`)).json()).drop.target).toEqual({
      type: "collection",
      id: "UTOY DROP",
    });
  });

  test("no elimina imágenes referenciadas por productos, pedidos o el historial de drops", async () => {
    const cookie = await login();

    const historyImage = await uploadWebp(cookie);
    await createDrop(cookie, dropPayload({ imageUrl: historyImage }));
    const historyDelete = await deleteImage(cookie, historyImage);
    expect(historyDelete.status).toBe(409);
    expect((await historyDelete.json()).code).toBe("image_in_use");

    const productImage = await uploadWebp(cookie);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO products (
          id, name, category, collection, price, badge, description,
          option1_label, option2_label, image, active, featured,
          created_at, updated_at, deleted_at
        ) VALUES ('drop-image-product', 'Producto imagen', 'Playeras', 'UTOY DROP', 1, '', '',
          'Talla', 'Color', ?, 1, 0, ?, ?, NULL)
      `).bind(productImage, now, now),
      env.DB.prepare(`
        INSERT INTO product_variants (
          id, product_id, option1_value, option2_value, shared_stock, stock, active, updated_at
        ) VALUES ('drop-image-variant', 'drop-image-product', 'M', 'Negro', 1, 1, 1, ?)
      `).bind(now),
      env.DB.prepare(`
        INSERT INTO orders (
          id, created_at, updated_at, status, channel, customer_name, customer_instagram,
          customer_city, customer_delivery, customer_payment, customer_notes, total,
          inventory_state, inventory_reserved_at, inventory_restored_at, archived_at
        ) VALUES ('drop-image-order', ?, ?, 'cerrado', 'instagram', 'Cliente ficticio', '@ficticio',
          'Ciudad ficticia', 'Entrega local', 'Efectivo', '', 1, 'reserved', ?, NULL, ?)
      `).bind(now, now, now, now),
      env.DB.prepare(`
        INSERT INTO order_items (
          order_id, product_id, variant_id, name, collection, size, color,
          option1_label, option2_label, quantity, unit_price, image
        ) VALUES ('drop-image-order', 'drop-image-product', 'drop-image-variant', 'Producto imagen',
          'UTOY DROP', 'M', 'Negro', 'Talla', 'Color', 1, 1, ?)
      `).bind(productImage),
    ]);

    expect((await deleteImage(cookie, productImage)).status).toBe(409);
    await env.DB.prepare("UPDATE products SET image = '/img/logo-utoy-drop-small.jpg' WHERE id = 'drop-image-product'").run();
    expect((await deleteImage(cookie, productImage)).status).toBe(409);

    const unreferenced = await uploadWebp(cookie);
    expect((await deleteImage(cookie, unreferenced)).status).toBe(200);
    expect((await SELF.fetch(`${ORIGIN}${unreferenced}`)).status).toBe(404);
  });
});
