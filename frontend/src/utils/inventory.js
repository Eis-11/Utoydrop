export function variantKey(size, color) {
  return `${size}::${color}`;
}

export function getVariantStock(product, size, color) {
  const key = variantKey(size, color);
  const value = product.variantStock?.[key];
  if (value !== undefined) return Math.max(0, Number(value || 0));
  return Math.max(0, Number(product.stock || 0));
}

export function getTotalStock(product) {
  const values = Object.values(product.variantStock || {});
  if (values.length) return values.reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
  return Math.max(0, Number(product.stock || 0));
}

export function formatVariantStock(product) {
  const entries = Object.entries(product.variantStock || {});
  if (entries.length) {
    return entries
      .map(([key, value]) => {
        const [size, color] = key.split("::");
        return `${size} / ${color}: ${value}`;
      })
      .join("\n");
  }
  return product.sizes
    .flatMap((size) => product.colors.map((color) => `${size} / ${color}: 0`))
    .join("\n");
}

export function parseVariantStock(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((stock, line) => {
      const match = line.match(/^(.+?)\s*\/\s*(.+?)\s*:\s*(\d+)$/);
      if (!match) return stock;
      stock[variantKey(match[1].trim(), match[2].trim())] = Number(match[3]);
      return stock;
    }, {});
}
