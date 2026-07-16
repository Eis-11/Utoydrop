import { getCatalog } from "./catalog.js";
import { randomToken } from "./security.js";
import { HttpError, optionalText, requiredText } from "./validation.js";

export const ORDER_STATUSES = new Set(["nuevo", "confirmado", "pagado", "enviado", "cerrado", "cancelado"]);
const ACTIVE_STATUSES = new Set(["nuevo", "confirmado", "pagado", "enviado", "cerrado"]);

function iso(timestamp) {
  return new Date(Number(timestamp)).toISOString();
}

function orderId() {
  return `UTOY-${Date.now().toString(36).toUpperCase()}-${randomToken(4).slice(0, 6).toUpperCase()}`;
}

function rowToOrder(row, items = []) {
  return {
    id: row.id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    status: row.status,
    channel: row.channel,
    customer: {
      name: row.customer_name,
      instagram: row.customer_instagram,
      city: row.customer_city,
      delivery: row.customer_delivery,
      payment: row.customer_payment,
      notes: row.customer_notes,
    },
    items,
    total: Number(row.total),
    inventoryState: row.inventory_state,
    inventoryReservedAt: iso(row.inventory_reserved_at),
    inventoryRestoredAt: row.inventory_restored_at ? iso(row.inventory_restored_at) : null,
    archivedAt: row.archived_at ? iso(row.archived_at) : null,
  };
}

function itemFromRow(row) {
  return {
    productId: row.product_id,
    name: row.name,
    collection: row.collection,
    size: row.size,
    color: row.color,
    option1Label: row.option1_label,
    option2Label: row.option2_label,
    quantity: Number(row.quantity),
    price: Number(row.unit_price),
    image: row.image,
  };
}

export async function listOrders(db, { includeArchived = false } = {}) {
  const [ordersResult, itemsResult] = await db.batch([
    db.prepare(`SELECT * FROM orders ${includeArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY created_at DESC LIMIT 5000`),
    db.prepare(`SELECT oi.* FROM order_items oi JOIN orders o ON o.id = oi.order_id ${includeArchived ? "" : "WHERE o.archived_at IS NULL"} ORDER BY oi.id`),
  ]);
  const itemsByOrder = new Map();
  for (const row of itemsResult.results || []) {
    const current = itemsByOrder.get(row.order_id) || [];
    current.push(itemFromRow(row));
    itemsByOrder.set(row.order_id, current);
  }
  return (ordersResult.results || []).map((row) => rowToOrder(row, itemsByOrder.get(row.id) || []));
}

async function orderRecord(db, id) {
  const [order, items] = await db.batch([
    db.prepare("SELECT * FROM orders WHERE id = ?").bind(id),
    db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").bind(id),
  ]);
  const row = order.results?.[0];
  if (!row) throw new HttpError(404, "Pedido no encontrado.");
  return { row, items: items.results || [], order: rowToOrder(row, (items.results || []).map(itemFromRow)) };
}

function groupItemRows(items) {
  const grouped = new Map();
  for (const item of items) {
    const current = grouped.get(item.variant_id) || { variantId: item.variant_id, productId: item.product_id, quantity: 0 };
    current.quantity += Number(item.quantity);
    grouped.set(item.variant_id, current);
  }
  return [...grouped.values()];
}

export async function createOrder(db, payload) {
  const requestedItems = Array.isArray(payload?.items) ? payload.items : [];
  if (!requestedItems.length) throw new HttpError(400, "El pedido está vacío.");
  if (requestedItems.length > 25) throw new HttpError(400, "El pedido contiene demasiadas variantes.");
  const customerInput = payload.customer || {};
  const customer = {
    name: requiredText(customerInput.name, "El nombre", 100),
    instagram: requiredText(customerInput.instagram || customerInput.phone, "El usuario de Instagram", 80),
    city: requiredText(customerInput.city, "La ciudad", 120),
    delivery: optionalText(customerInput.delivery, 40) || "Envío",
    payment: optionalText(customerInput.payment, 40) || "Por confirmar",
    notes: optionalText(customerInput.notes, 400),
  };

  const catalog = await getCatalog(db, { includeInactive: true });
  const products = new Map(catalog.products.filter((product) => product.active !== false).map((product) => [String(product.id), product]));
  const variantsResult = await db.prepare("SELECT * FROM product_variants WHERE active = 1").all();
  const variantsByProduct = new Map();
  for (const variant of variantsResult.results || []) {
    const current = variantsByProduct.get(variant.product_id) || [];
    current.push(variant);
    variantsByProduct.set(variant.product_id, current);
  }

  const items = requestedItems.map((requested) => {
    const product = products.get(String(requested.id));
    if (!product) throw new HttpError(400, "Uno de los productos ya no está disponible.");
    const size = requiredText(requested.size, "La talla", 30);
    const color = requiredText(requested.color, "El color", 60);
    if (!product.sizes.includes(size) || !product.colors.includes(color)) {
      throw new HttpError(400, `La variante elegida de ${product.name} ya no está disponible.`);
    }
    const variant = (variantsByProduct.get(String(product.id)) || []).find((candidate) => (
      Number(candidate.shared_stock) === 1
      || (candidate.option1_value === size && candidate.option2_value === color)
    ));
    if (!variant) throw new HttpError(409, `La variante elegida de ${product.name} ya no tiene inventario.`, "insufficient_stock");
    const quantity = Number(requested.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new HttpError(400, `Revisa la cantidad de ${product.name}.`);
    return {
      productId: String(product.id),
      variantId: variant.id,
      name: product.name,
      collection: product.collection || "",
      size,
      color,
      option1Label: product.option1Label || "Talla",
      option2Label: product.option2Label || "Color",
      quantity,
      price: Number(product.price),
      image: product.image || "",
      available: Number(variant.stock),
    };
  });

  const grouped = new Map();
  for (const item of items) {
    const current = grouped.get(item.variantId) || { ...item, quantity: 0 };
    current.quantity += item.quantity;
    grouped.set(item.variantId, current);
  }
  for (const item of grouped.values()) {
    if (item.quantity > Math.min(10, item.available)) throw new HttpError(409, `No hay inventario suficiente de ${item.name}.`, "insufficient_stock");
  }

  const now = Date.now();
  const id = orderId();
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const statements = [db.prepare(`
    INSERT INTO orders (
      id, created_at, updated_at, status, channel, customer_name, customer_instagram,
      customer_city, customer_delivery, customer_payment, customer_notes, total,
      inventory_state, inventory_reserved_at
    ) VALUES (?, ?, ?, 'nuevo', 'instagram', ?, ?, ?, ?, ?, ?, ?, 'reserved', ?)
  `).bind(id, now, now, customer.name, customer.instagram, customer.city, customer.delivery, customer.payment, customer.notes, total, now)];

  for (const item of grouped.values()) {
    statements.push(db.prepare("UPDATE product_variants SET stock = stock - ?, updated_at = ? WHERE id = ?").bind(item.quantity, now, item.variantId));
    statements.push(db.prepare(`
      INSERT INTO inventory_movements (order_id, product_id, variant_id, kind, quantity_delta, created_at)
      VALUES (?, ?, ?, 'reserve', ?, ?)
    `).bind(id, item.productId, item.variantId, -item.quantity, now));
  }
  for (const item of items) {
    statements.push(db.prepare(`
      INSERT INTO order_items (
        order_id, product_id, variant_id, name, collection, size, color,
        option1_label, option2_label, quantity, unit_price, image
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, item.productId, item.variantId, item.name, item.collection, item.size, item.color,
      item.option1Label, item.option2Label, item.quantity, item.price, item.image));
  }
  statements.push(db.prepare("UPDATE catalog_state SET revision = revision + 1, updated_at = ? WHERE id = 1").bind(now));
  statements.push(db.prepare(`
    INSERT INTO order_events (order_id, event_type, from_status, to_status, created_at)
    VALUES (?, 'created', NULL, 'nuevo', ?)
  `).bind(id, now));
  try {
    await db.batch(statements);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("insufficient_stock") || message.includes("inactive_variant")) {
      throw new HttpError(409, "El inventario cambió mientras enviabas el pedido. No se reservó ninguna pieza; revisa las existencias.", "insufficient_stock");
    }
    throw error;
  }
  return orderRecord(db, id).then((record) => record.order);
}

export async function updateOrderStatus(db, id, nextStatus) {
  const status = String(nextStatus || "").toLowerCase();
  if (!ORDER_STATUSES.has(status)) throw new HttpError(400, "Estado inválido.");
  const record = await orderRecord(db, id);
  if (record.row.archived_at) throw new HttpError(404, "Pedido no encontrado.");
  if (record.row.status === "cancelado") {
    if (status === "cancelado") return record.order;
    throw new HttpError(409, "Un pedido cancelado no puede reactivarse. Crea un pedido nuevo.", "cancelled_order_terminal");
  }
  if (!ACTIVE_STATUSES.has(record.row.status)) throw new HttpError(409, "La transición de estado no está permitida.");
  if (record.row.status === status) return record.order;
  const now = Date.now();

  if (status === "cancelado") {
    const statements = [];
    for (const item of groupItemRows(record.items)) {
      statements.push(db.prepare(`
        UPDATE product_variants SET stock = stock + ?, updated_at = ?
        WHERE id = ? AND EXISTS (
          SELECT 1 FROM orders WHERE id = ? AND archived_at IS NULL
            AND status <> 'cancelado' AND inventory_state = 'reserved'
        )
      `).bind(item.quantity, now, item.variantId, id));
      statements.push(db.prepare(`
        INSERT INTO inventory_movements (order_id, product_id, variant_id, kind, quantity_delta, created_at)
        SELECT ?, ?, ?, 'restore_cancel', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM orders WHERE id = ? AND archived_at IS NULL
            AND status <> 'cancelado' AND inventory_state = 'reserved'
        )
        ON CONFLICT(order_id, variant_id, kind) DO NOTHING
      `).bind(id, item.productId, item.variantId, item.quantity, now, id));
    }
    statements.push(db.prepare(`
      INSERT INTO order_events (order_id, event_type, from_status, to_status, created_at)
      SELECT id, 'cancelled', status, 'cancelado', ? FROM orders
      WHERE id = ? AND archived_at IS NULL AND status <> 'cancelado' AND inventory_state = 'reserved'
    `).bind(now, id));
    statements.push(db.prepare(`
      UPDATE catalog_state SET revision = revision + 1, updated_at = ?
      WHERE id = 1 AND EXISTS (
        SELECT 1 FROM orders WHERE id = ? AND archived_at IS NULL
          AND status <> 'cancelado' AND inventory_state = 'reserved'
      )
    `).bind(now, id));
    statements.push(db.prepare(`
      UPDATE orders SET status = 'cancelado', inventory_state = 'restored', inventory_restored_at = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL AND status <> 'cancelado' AND inventory_state = 'reserved'
    `).bind(now, now, id));
    await db.batch(statements);
  } else {
    const results = await db.batch([
      db.prepare(`
        INSERT INTO order_events (order_id, event_type, from_status, to_status, created_at)
        SELECT id, 'status_changed', status, ?, ? FROM orders
        WHERE id = ? AND archived_at IS NULL AND status <> 'cancelado'
      `).bind(status, now, id),
      db.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL AND status <> 'cancelado'`).bind(status, now, id),
    ]);
    if (!Number(results[1]?.meta?.changes || 0)) {
      throw new HttpError(409, "La transición de estado no está permitida.");
    }
  }
  return orderRecord(db, id).then((updated) => updated.order);
}

export async function archiveOrder(db, id) {
  const record = await orderRecord(db, id);
  if (record.row.archived_at) return { ok: true, archived: true };
  const now = Date.now();
  const statements = [];
  for (const item of groupItemRows(record.items)) {
    statements.push(db.prepare(`
      UPDATE product_variants SET stock = stock + ?, updated_at = ?
      WHERE id = ? AND EXISTS (
        SELECT 1 FROM orders WHERE id = ? AND archived_at IS NULL
          AND status = 'nuevo' AND inventory_state = 'reserved'
      )
    `).bind(item.quantity, now, item.variantId, id));
    statements.push(db.prepare(`
      INSERT INTO inventory_movements (order_id, product_id, variant_id, kind, quantity_delta, created_at)
      SELECT ?, ?, ?, 'restore_archive', ?, ?
      WHERE EXISTS (
        SELECT 1 FROM orders WHERE id = ? AND archived_at IS NULL
          AND status = 'nuevo' AND inventory_state = 'reserved'
      )
      ON CONFLICT(order_id, variant_id, kind) DO NOTHING
    `).bind(id, item.productId, item.variantId, item.quantity, now, id));
  }
  statements.push(db.prepare(`
    INSERT INTO order_events (order_id, event_type, from_status, to_status, created_at)
    SELECT id, 'archived', status, status, ? FROM orders WHERE id = ? AND archived_at IS NULL
  `).bind(now, id));
  statements.push(db.prepare(`
    UPDATE catalog_state SET revision = revision + 1, updated_at = ?
    WHERE id = 1 AND EXISTS (
      SELECT 1 FROM orders WHERE id = ? AND archived_at IS NULL
        AND status = 'nuevo' AND inventory_state = 'reserved'
    )
  `).bind(now, id));
  statements.push(db.prepare(`
    UPDATE orders SET
      inventory_state = CASE WHEN status = 'nuevo' AND inventory_state = 'reserved' THEN 'restored' ELSE inventory_state END,
      inventory_restored_at = CASE WHEN status = 'nuevo' AND inventory_state = 'reserved' THEN ? ELSE inventory_restored_at END,
      archived_at = ?, updated_at = ?
    WHERE id = ? AND archived_at IS NULL
  `).bind(now, now, now, id));
  await db.batch(statements);
  return { ok: true, archived: true };
}
