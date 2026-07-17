import { randomToken } from "./security.js";
import { HttpError, requiredText, validImagePath } from "./validation.js";

const STATUSES = new Set(["draft", "published", "hidden", "archived"]);
const TARGET_TYPES = new Set(["none", "product", "collection"]);

function normalizeTarget(payload) {
  const targetType = String(payload?.targetType || "none").trim().toLowerCase();
  if (!TARGET_TYPES.has(targetType)) throw new HttpError(400, "El tipo de destino no es válido.");
  if (targetType === "none") return { targetType, targetId: null };
  return {
    targetType,
    targetId: requiredText(payload?.targetId, "El destino", 120),
  };
}

export function validateFeaturedDrop(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "Los datos del drop no son válidos.");
  }
  const imageUrl = String(payload.imageUrl || "").trim();
  if (!validImagePath(imageUrl)) throw new HttpError(400, "La imagen del drop no es válida.");
  const target = normalizeTarget(payload);
  return {
    imageUrl,
    imageAlt: requiredText(payload.imageAlt, "El texto alternativo", 160),
    topLabel: requiredText(payload.topLabel, "El texto superior", 40),
    bottomLabel: requiredText(payload.bottomLabel, "La etiqueta inferior", 80),
    cardBrand: requiredText(payload.cardBrand, "El texto interior superior", 40),
    cardFooterLeft: requiredText(payload.cardFooterLeft, "El texto interior inferior izquierdo", 60),
    cardFooterRight: requiredText(payload.cardFooterRight, "El texto interior inferior derecho", 40),
    verticalLabel: requiredText(payload.verticalLabel, "El texto vertical", 40),
    ...target,
  };
}

function mapDrop(row) {
  if (!row) return null;
  return {
    id: row.id,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    topLabel: row.top_label,
    bottomLabel: row.bottom_label,
    cardBrand: row.card_brand,
    cardFooterLeft: row.card_footer_left,
    cardFooterRight: row.card_footer_right,
    verticalLabel: row.vertical_label,
    targetType: row.target_type,
    targetId: row.target_id,
    status: row.status,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    publishedAt: row.published_at == null ? null : Number(row.published_at),
  };
}

const DROP_COLUMNS = `
  id, image_url, image_alt, top_label, bottom_label, card_brand,
  card_footer_left, card_footer_right, vertical_label, target_type,
  target_id, status, created_at, updated_at, published_at
`;

async function findDrop(db, id) {
  return db.prepare(`SELECT ${DROP_COLUMNS} FROM featured_drops WHERE id = ?`).bind(id).first();
}

async function validateExistingTarget(db, drop) {
  if (drop.targetType === "none") return;
  if (drop.targetType === "product") {
    const product = await db.prepare(`
      SELECT id FROM products
      WHERE id = ? AND deleted_at IS NULL AND active = 1
    `).bind(drop.targetId).first();
    if (!product) throw new HttpError(400, "El producto de destino no existe o no está visible.", "featured_drop_target_missing");
    return;
  }
  const collection = await db.prepare("SELECT name FROM collections WHERE name = ? COLLATE NOCASE").bind(drop.targetId).first();
  if (!collection) throw new HttpError(400, "La colección de destino no existe.", "featured_drop_target_missing");
}

async function resolvePublicTarget(db, row) {
  if (row.target_type === "none" || !row.target_id) return null;
  if (row.target_type === "product") {
    const product = await db.prepare(`
      SELECT id FROM products
      WHERE id = ? AND deleted_at IS NULL AND active = 1
    `).bind(row.target_id).first();
    return product ? { type: "product", id: product.id } : null;
  }
  const collection = await db.prepare("SELECT name FROM collections WHERE name = ? COLLATE NOCASE").bind(row.target_id).first();
  return collection ? { type: "collection", id: collection.name } : null;
}

export async function getPublishedFeaturedDrop(db) {
  const row = await db.prepare(`
    SELECT ${DROP_COLUMNS}
    FROM featured_drops
    WHERE status = 'published'
    LIMIT 1
  `).first();
  if (!row) return null;
  const drop = mapDrop(row);
  return { ...drop, target: await resolvePublicTarget(db, row) };
}

export async function listFeaturedDrops(db) {
  const result = await db.prepare(`
    SELECT ${DROP_COLUMNS}
    FROM featured_drops
    ORDER BY
      CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 WHEN 'hidden' THEN 2 ELSE 3 END,
      updated_at DESC,
      created_at DESC
  `).all();
  return result.results.map(mapDrop);
}

export async function saveFeaturedDropDraft(db, payload, id) {
  const drop = validateFeaturedDrop(payload);
  const now = Date.now();
  let targetId = id;
  let createdAt = now;

  if (targetId) {
    const existing = await findDrop(db, targetId);
    if (!existing) throw new HttpError(404, "El drop no existe.");
    if (existing.status !== "draft") {
      targetId = null;
    } else {
      createdAt = Number(existing.created_at);
    }
  }

  if (!targetId) targetId = `drop_${randomToken(18)}`;

  await db.prepare(`
    INSERT INTO featured_drops (
      id, image_url, image_alt, top_label, bottom_label, card_brand,
      card_footer_left, card_footer_right, vertical_label, target_type,
      target_id, status, created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET
      image_url = excluded.image_url,
      image_alt = excluded.image_alt,
      top_label = excluded.top_label,
      bottom_label = excluded.bottom_label,
      card_brand = excluded.card_brand,
      card_footer_left = excluded.card_footer_left,
      card_footer_right = excluded.card_footer_right,
      vertical_label = excluded.vertical_label,
      target_type = excluded.target_type,
      target_id = excluded.target_id,
      updated_at = excluded.updated_at
    WHERE featured_drops.status = 'draft'
  `).bind(
    targetId,
    drop.imageUrl,
    drop.imageAlt,
    drop.topLabel,
    drop.bottomLabel,
    drop.cardBrand,
    drop.cardFooterLeft,
    drop.cardFooterRight,
    drop.verticalLabel,
    drop.targetType,
    drop.targetId,
    createdAt,
    now,
  ).run();

  return mapDrop(await findDrop(db, targetId));
}

export async function publishFeaturedDrop(db, id, confirmReplace = false) {
  const row = await findDrop(db, id);
  if (!row) throw new HttpError(404, "El drop no existe.");
  if (!STATUSES.has(row.status)) throw new HttpError(409, "El estado del drop no es válido.");
  const drop = mapDrop(row);
  await validateExistingTarget(db, drop);

  const active = await db.prepare(`
    SELECT ${DROP_COLUMNS}
    FROM featured_drops
    WHERE status = 'published'
    LIMIT 1
  `).first();
  if (active?.id === id) return drop;
  if (active && !confirmReplace) {
    throw new HttpError(
      409,
      "Confirma que deseas reemplazar el drop publicado actualmente.",
      "featured_drop_replace_confirmation_required",
    );
  }

  const now = Date.now();
  await db.batch([
    db.prepare(`
      UPDATE featured_drops
      SET status = 'archived', updated_at = ?
      WHERE status = 'published' AND id <> ?
    `).bind(now, id),
    db.prepare(`
      UPDATE featured_drops
      SET status = 'published', updated_at = ?, published_at = ?
      WHERE id = ?
    `).bind(now, now, id),
  ]);
  return mapDrop(await findDrop(db, id));
}

export async function hideFeaturedDrop(db, id) {
  const row = await findDrop(db, id);
  if (!row) throw new HttpError(404, "El drop no existe.");
  if (row.status !== "published") throw new HttpError(409, "Solo el drop publicado puede ocultarse.");
  const now = Date.now();
  await db.prepare(`
    UPDATE featured_drops
    SET status = 'hidden', updated_at = ?
    WHERE id = ? AND status = 'published'
  `).bind(now, id).run();
  return mapDrop(await findDrop(db, id));
}
