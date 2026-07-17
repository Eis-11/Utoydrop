export class HttpError extends Error {
  constructor(status, message, code = "request_error") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function requiredText(value, label, maxLength = 120) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) throw new HttpError(400, `${label} es obligatorio.`);
  if (normalized.length > maxLength) throw new HttpError(400, `${label} es demasiado largo.`);
  if (/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalized)) {
    throw new HttpError(400, `${label} contiene caracteres inválidos.`);
  }
  return normalized;
}

export function optionalText(value, maxLength = 400) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
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

export function validImagePath(value) {
  return typeof value === "string" && value.length <= 300
    && /^\/(?:img|uploads)\/[A-Za-z0-9/_-]+\.(?:svg|jpe?g|png|webp)$/i.test(value)
    && !value.includes("..");
}

function validVariantStock(value, sizes, colors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > Math.min(900, sizes.length * colors.length)) return false;
  const allowedKeys = new Set(sizes.flatMap((size) => colors.map((color) => `${size}::${color}`)));
  return entries.every(([key, stock]) => allowedKeys.has(key)
    && Number.isInteger(Number(stock)) && Number(stock) >= 0 && Number(stock) <= 1_000_000);
}

export function validateCatalog(products) {
  if (!Array.isArray(products) || products.length > 500) return false;
  const ids = new Set();
  return products.every((product) => {
    if (!product || typeof product !== "object" || Array.isArray(product)) return false;
    const id = String(product.id || "").trim();
    if (!id || id.length > 120 || ids.has(id)) return false;
    ids.add(id);
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
      && product.sizes.length * product.colors.length <= 900
      && validImagePath(product.image)
      && validVariantStock(product.variantStock || {}, product.sizes, product.colors)
      && (product.active === undefined || typeof product.active === "boolean")
      && (product.featured === undefined || typeof product.featured === "boolean");
  });
}

function validateNamedList(values, maxItems, maxLength, reserved) {
  if (!Array.isArray(values) || !values.length || values.length > maxItems) return false;
  const normalized = values.map((value) => String(value || "").trim().toLocaleLowerCase("es-MX"));
  return values.every((value) => validString(value, maxLength))
    && normalized.every((value) => !reserved.has(value))
    && new Set(normalized).size === normalized.length;
}

export function validateCategories(categories) {
  return validateNamedList(categories, 60, 60, new Set(["todo", "todas", "todos", "nuevos drops", "mas vendidos", "más vendidos"]));
}

export function validateCollections(collections) {
  return validateNamedList(collections, 100, 80, new Set(["toda", "todas", "colección", "colecciones"]));
}

export async function readJson(request, maxBytes = 1_000_000) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new HttpError(413, "La solicitud es demasiado grande.");
  let text;
  try {
    text = await request.text();
  } catch {
    throw new HttpError(400, "No se pudo leer la solicitud.");
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError(413, "La solicitud es demasiado grande.");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "El contenido JSON es inválido.");
  }
}
