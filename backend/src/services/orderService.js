const crypto = require("crypto");

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

function text(value, label, maxLength = 120) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) throw new ValidationError(`${label} es obligatorio.`);
  if (normalized.length > maxLength) throw new ValidationError(`${label} es demasiado largo.`);
  return normalized;
}

function optionalText(value, maxLength = 400) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function variantStock(product, size, color) {
  const value = product.variantStock?.[`${size}::${color}`];
  return Math.max(0, Number(value === undefined ? product.stock : value) || 0);
}

function buildOrder(payload, products) {
  const requestedItems = Array.isArray(payload?.items) ? payload.items : [];
  if (!requestedItems.length) throw new ValidationError("El pedido está vacío.");
  if (requestedItems.length > 25) throw new ValidationError("El pedido contiene demasiadas variantes.");

  const customerInput = payload.customer || {};
  const customer = {
    name: text(customerInput.name, "El nombre", 100),
    instagram: text(customerInput.instagram || customerInput.phone, "El usuario de Instagram", 80),
    city: text(customerInput.city, "La ciudad", 120),
    delivery: optionalText(customerInput.delivery, 40) || "Envío",
    payment: optionalText(customerInput.payment, 40) || "Por confirmar",
    notes: optionalText(customerInput.notes, 400),
  };

  const productMap = new Map(products.filter((product) => product.active !== false).map((product) => [String(product.id), product]));
  const items = requestedItems.map((requested) => {
    const product = productMap.get(String(requested.id));
    if (!product) throw new ValidationError("Uno de los productos ya no está disponible.");
    const size = text(requested.size, "La talla", 30);
    const color = text(requested.color, "El color", 60);
    if (!product.sizes?.includes(size) || !product.colors?.includes(color)) {
      throw new ValidationError(`La variante elegida de ${product.name} ya no está disponible.`);
    }
    const quantity = Number(requested.quantity);
    const available = variantStock(product, size, color);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > Math.min(10, available)) {
      throw new ValidationError(`Revisa la cantidad disponible de ${product.name}.`);
    }
    return {
      productId: product.id,
      name: product.name,
      collection: product.collection || "",
      size,
      color,
      option1Label: optionalText(product.option1Label, 40) || "Talla",
      option2Label: optionalText(product.option2Label, 40) || "Color",
      quantity,
      price: Number(product.price),
      image: product.image || "",
    };
  });

  const now = new Date().toISOString();
  return {
    id: `UTOY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
    createdAt: now,
    updatedAt: now,
    status: "nuevo",
    channel: "instagram",
    customer,
    items,
    total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
  };
}

module.exports = { buildOrder, ValidationError, variantStock };
