const moneyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export const COPIED_ORDER_MESSAGE = "Tu pedido fue copiado. En Instagram solo pégalo y envíalo.";

function money(value) {
  return moneyFormatter.format(Number(value));
}

export function buildOrderSummary({ order, customer, items, instagramHandle = "@utoy_drop" }) {
  const orderItems = order?.items || items || [];
  const orderCustomer = order?.customer || customer || {};
  const total = order?.total ?? orderItems.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);

  return [
    `Hola ${instagramHandle}, quiero confirmar este pedido:`,
    order?.id ? `ID del pedido: ${order.id}` : null,
    "",
    `Cliente: ${orderCustomer.name || ""}`,
    `Instagram: ${orderCustomer.instagram || ""}`,
    `Ciudad / estado: ${orderCustomer.city || ""}`,
    `Entrega: ${orderCustomer.delivery || ""}`,
    `Pago: ${orderCustomer.payment || ""}`,
    orderCustomer.notes ? `Notas: ${orderCustomer.notes}` : null,
    "",
    ...orderItems.map((item, index) => (
      `${index + 1}. ${item.name} | ${item.option1Label || "Talla"}: ${item.size} | ${item.option2Label || "Color"}: ${item.color} | Cantidad: ${item.quantity} | ${money(Number(item.price) * Number(item.quantity))}`
    )),
    "",
    `Total: ${money(total)}`,
    "",
    "¿Me ayudan a confirmar disponibilidad, total final y entrega?",
  ].filter((line) => line !== null).join("\n");
}

export function createCheckoutToken(cryptoImplementation = globalThis.crypto) {
  if (typeof cryptoImplementation?.randomUUID === "function") return cryptoImplementation.randomUUID();
  if (typeof cryptoImplementation?.getRandomValues !== "function") {
    throw new Error("Este navegador no puede preparar un identificador seguro para el pedido.");
  }
  const bytes = cryptoImplementation.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function copyOrderSummary(summary, clipboard = globalThis.navigator?.clipboard) {
  if (typeof clipboard?.writeText !== "function") return false;
  try {
    await clipboard.writeText(summary);
    return true;
  } catch {
    return false;
  }
}

export function reserveInstagramWindow(openWindow = globalThis.window?.open?.bind(globalThis.window)) {
  if (typeof openWindow !== "function") return null;
  try {
    const popup = openWindow("about:blank", "utoy-instagram");
    if (popup) popup.opener = null;
    return popup || null;
  } catch {
    return null;
  }
}

export function sendReservedWindowToInstagram(popup, url) {
  if (!popup || popup.closed) return false;
  try {
    if (typeof popup.location?.replace === "function") popup.location.replace(url);
    else popup.location.href = url;
    return true;
  } catch {
    try { popup.close(); } catch { /* The browser owns this window. */ }
    return false;
  }
}

export function closeReservedWindow(popup) {
  if (!popup || popup.closed) return;
  try { popup.close(); } catch { /* The browser owns this window. */ }
}

export function openInstagram(url, openWindow = globalThis.window?.open?.bind(globalThis.window)) {
  if (typeof openWindow !== "function") return false;
  try {
    const popup = openWindow(url, "utoy-instagram");
    if (!popup) return false;
    popup.opener = null;
    return true;
  } catch {
    return false;
  }
}
