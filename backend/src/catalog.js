import { sha256 } from "./security.js";
import { HttpError, validateCatalog, validateCategories, validateCollections } from "./validation.js";

function rows(result) {
  return result?.results || [];
}

export async function getCatalog(db, { includeInactive = false } = {}) {
  const [productsResult, optionsResult, variantsResult, categoriesResult, collectionsResult, stateResult] = await db.batch([
    db.prepare(`SELECT * FROM products WHERE deleted_at IS NULL ${includeInactive ? "" : "AND active = 1"} ORDER BY created_at DESC, id`),
    db.prepare("SELECT product_id, option_index, value FROM product_options ORDER BY product_id, option_index, sort_order, value"),
    db.prepare("SELECT id, product_id, option1_value, option2_value, shared_stock, stock FROM product_variants WHERE active = 1 ORDER BY product_id, option1_value, option2_value"),
    db.prepare("SELECT name FROM categories ORDER BY sort_order, name"),
    db.prepare("SELECT name FROM collections ORDER BY sort_order, name"),
    db.prepare("SELECT revision FROM catalog_state WHERE id = 1"),
  ]);

  const optionMap = new Map();
  for (const option of rows(optionsResult)) {
    const current = optionMap.get(option.product_id) || { sizes: [], colors: [] };
    (Number(option.option_index) === 1 ? current.sizes : current.colors).push(option.value);
    optionMap.set(option.product_id, current);
  }
  const variantMap = new Map();
  for (const variant of rows(variantsResult)) {
    const current = variantMap.get(variant.product_id) || [];
    current.push(variant);
    variantMap.set(variant.product_id, current);
  }

  const products = rows(productsResult).map((product) => {
    const options = optionMap.get(product.id) || { sizes: [], colors: [] };
    const variants = variantMap.get(product.id) || [];
    const shared = variants.find((variant) => Number(variant.shared_stock) === 1);
    const variantStock = shared ? {} : Object.fromEntries(variants.map((variant) => [
      `${variant.option1_value}::${variant.option2_value}`,
      Number(variant.stock),
    ]));
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      collection: product.collection,
      price: Number(product.price),
      badge: product.badge,
      description: product.description,
      option1Label: product.option1_label,
      option2Label: product.option2_label,
      sizes: options.sizes,
      colors: options.colors,
      stock: shared ? Number(shared.stock) : variants.reduce((sum, variant) => sum + Number(variant.stock), 0),
      variantStock,
      image: product.image,
      active: Boolean(product.active),
      featured: Boolean(product.featured),
    };
  });

  return {
    products,
    categories: rows(categoriesResult).map((row) => row.name),
    collections: rows(collectionsResult).map((row) => row.name),
    revision: Number(rows(stateResult)[0]?.revision || 0),
  };
}

async function variantId(productId, option1, option2, shared) {
  return `variant_${(await sha256(JSON.stringify([String(productId), option1, option2, shared]))).slice(0, 32)}`;
}

function revisionGuard(db, expectedRevision, now) {
  if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) < 0) {
    throw new HttpError(409, "El catálogo cambió. Actualiza el panel antes de guardar.", "catalog_revision_conflict");
  }
  return db.prepare(`
    UPDATE catalog_state
    SET revision = CASE WHEN revision = ? THEN revision + 1 ELSE -1 END, updated_at = ?
    WHERE id = 1
  `).bind(Number(expectedRevision), now);
}

export async function saveCatalog(db, products, expectedRevision) {
  if (!validateCatalog(products)) throw new HttpError(400, "Catálogo inválido.");
  const now = Date.now();
  const statements = [
    revisionGuard(db, expectedRevision, now),
    db.prepare("UPDATE products SET deleted_at = ?, active = 0, updated_at = ? WHERE deleted_at IS NULL").bind(now, now),
    db.prepare("UPDATE product_variants SET active = 0, updated_at = ? WHERE active = 1").bind(now),
  ];

  for (const product of products) {
    const productId = String(product.id);
    statements.push(db.prepare(`
      INSERT INTO products (
        id, name, category, collection, price, badge, description, option1_label, option2_label,
        image, active, featured, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, category = excluded.category, collection = excluded.collection,
        price = excluded.price, badge = excluded.badge, description = excluded.description,
        option1_label = excluded.option1_label, option2_label = excluded.option2_label,
        image = excluded.image, active = excluded.active, featured = excluded.featured,
        updated_at = excluded.updated_at, deleted_at = NULL
    `).bind(
      productId, product.name.trim(), product.category.trim(), product.collection.trim(), Number(product.price),
      String(product.badge || "").trim(), String(product.description || "").trim(),
      String(product.option1Label || "Talla").trim(), String(product.option2Label || "Color").trim(),
      product.image, product.active === false ? 0 : 1, product.featured ? 1 : 0, now, now,
    ));
    statements.push(db.prepare("DELETE FROM product_options WHERE product_id = ?").bind(productId));
    product.sizes.forEach((value, index) => statements.push(
      db.prepare("INSERT INTO product_options (product_id, option_index, value, sort_order) VALUES (?, 1, ?, ?)").bind(productId, value, index),
    ));
    product.colors.forEach((value, index) => statements.push(
      db.prepare("INSERT INTO product_options (product_id, option_index, value, sort_order) VALUES (?, 2, ?, ?)").bind(productId, value, index),
    ));
    statements.push(db.prepare("UPDATE product_variants SET active = 0, updated_at = ? WHERE product_id = ?").bind(now, productId));

    const entries = Object.entries(product.variantStock || {});
    const variants = entries.length
      ? product.sizes.flatMap((size) => product.colors.map((color) => ({ option1: size, option2: color, stock: Number(product.variantStock[`${size}::${color}`] || 0), shared: 0 })))
      : [{ option1: "*", option2: "*", stock: Number(product.stock), shared: 1 }];
    for (const variant of variants) {
      const id = await variantId(productId, variant.option1, variant.option2, variant.shared);
      statements.push(db.prepare(`
        INSERT INTO product_variants (id, product_id, option1_value, option2_value, shared_stock, stock, active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET stock = excluded.stock, active = 1, updated_at = excluded.updated_at
      `).bind(id, productId, variant.option1, variant.option2, variant.shared, variant.stock, now));
    }
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (String(error?.message || error).includes("catalog_revision_conflict")) {
      throw new HttpError(409, "El inventario cambió mientras editabas. El panel se actualizará; revisa y vuelve a guardar.", "catalog_revision_conflict");
    }
    throw error;
  }
  return getCatalog(db, { includeInactive: true });
}

async function saveNamedList(db, table, values, expectedRevision, validator, message) {
  if (!validator(values)) throw new HttpError(400, message);
  const now = Date.now();
  const statements = [revisionGuard(db, expectedRevision, now), db.prepare(`DELETE FROM ${table}`)];
  values.forEach((value, index) => statements.push(
    db.prepare(`INSERT INTO ${table} (name, sort_order, created_at) VALUES (?, ?, ?)`).bind(value.trim(), index, now),
  ));
  try {
    await db.batch(statements);
  } catch (error) {
    if (String(error?.message || error).includes("catalog_revision_conflict")) {
      throw new HttpError(409, "El catálogo cambió. El panel se actualizará; revisa y vuelve a guardar.", "catalog_revision_conflict");
    }
    throw error;
  }
  return { values: values.map((value) => value.trim()), revision: Number(expectedRevision) + 1 };
}

export function saveCategories(db, categories, expectedRevision) {
  return saveNamedList(db, "categories", categories, expectedRevision, validateCategories, "Lista de categorías inválida.");
}

export function saveCollections(db, collections, expectedRevision) {
  return saveNamedList(db, "collections", collections, expectedRevision, validateCollections, "Lista de colecciones inválida.");
}
