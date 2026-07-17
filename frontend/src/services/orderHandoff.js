const moneyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export const COPIED_ORDER_MESSAGE = "Tu pedido fue copiado. En Instagram solo pégalo y envíalo.";
export const MANUAL_HANDOFF_LABEL = "COPIAR Y ABRIR INSTAGRAM";
export const CLIPBOARD_API_UNAVAILABLE = "API no disponible";
export const CLIPBOARD_TIMEOUT_ERROR = "TimeoutError";
const DEFERRED_CLIPBOARD_TIMEOUT_MS = 5000;

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

export function classifyClipboardError(error, apiAvailable = true) {
  if (!apiAvailable) return CLIPBOARD_API_UNAVAILABLE;
  if (error?.name === "NotAllowedError") return "NotAllowedError";
  if (error?.name === "NotFoundError") return "NotFoundError";
  return error?.name || "Error desconocido";
}

export function recordClipboardError(type, logger = console.warn) {
  if (!type || typeof logger !== "function") return;
  logger("UTOY clipboard", { type });
}

export function startDeferredClipboardWrite({
  clipboard = globalThis.navigator?.clipboard,
  ClipboardItemClass = globalThis.ClipboardItem,
  BlobClass = globalThis.Blob,
  timeoutMs = DEFERRED_CLIPBOARD_TIMEOUT_MS,
} = {}) {
  const supported = typeof clipboard?.write === "function"
    && typeof ClipboardItemClass === "function"
    && typeof BlobClass === "function";

  if (!supported) {
    return {
      supported: false,
      resolve: () => {},
      reject: () => {},
      completion: Promise.resolve({ ok: false, errorType: CLIPBOARD_API_UNAVAILABLE }),
    };
  }

  let resolveContent;
  let rejectContent;
  let markContentReady;
  let settled = false;
  const contentPromise = new Promise((resolve, reject) => {
    resolveContent = resolve;
    rejectContent = reject;
  });
  void contentPromise.catch(() => {});
  const contentReady = new Promise((resolve) => { markContentReady = resolve; });

  let rawCompletion;
  try {
    const item = new ClipboardItemClass({ "text/plain": contentPromise });
    rawCompletion = Promise.resolve(clipboard.write([item])).then(
      () => ({ ok: true, errorType: null }),
      (error) => ({ ok: false, errorType: classifyClipboardError(error) }),
    );
  } catch (error) {
    rawCompletion = Promise.resolve({ ok: false, errorType: classifyClipboardError(error) });
  }

  const completion = contentReady.then(() => new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, errorType: CLIPBOARD_TIMEOUT_ERROR }), timeoutMs);
    rawCompletion.then(finish);
  }));

  return {
    supported: true,
    resolve(summary) {
      if (settled) return;
      settled = true;
      resolveContent(new BlobClass([summary], { type: "text/plain" }));
      markContentReady();
    },
    reject(error) {
      if (settled) return;
      settled = true;
      rejectContent(error);
      markContentReady();
    },
    completion,
  };
}

export function beginDeferredOrderHandoff({
  createOrderRequest,
  buildSummary,
  instagramUrl,
  clipboard = globalThis.navigator?.clipboard,
  ClipboardItemClass = globalThis.ClipboardItem,
  BlobClass = globalThis.Blob,
  clipboardTimeoutMs = DEFERRED_CLIPBOARD_TIMEOUT_MS,
  openWindow = globalThis.window?.open?.bind(globalThis.window),
  logger = console.warn,
}) {
  const deferredClipboard = startDeferredClipboardWrite({
    clipboard,
    ClipboardItemClass,
    BlobClass,
    timeoutMs: clipboardTimeoutMs,
  });
  const reservedInstagramWindow = deferredClipboard.supported ? reserveInstagramWindow(openWindow) : null;

  if (reservedInstagramWindow) {
    void deferredClipboard.completion.then((result) => {
      if (!result.ok) closeReservedWindow(reservedInstagramWindow);
    });
  }

  let orderPromise;
  try {
    orderPromise = Promise.resolve(createOrderRequest());
  } catch (error) {
    orderPromise = Promise.reject(error);
  }

  const completion = (async () => {
    try {
      const order = await orderPromise;
      const summary = buildSummary(order);

      if (!deferredClipboard.supported) {
        recordClipboardError(CLIPBOARD_API_UNAVAILABLE, logger);
        return {
          order,
          summary,
          copied: false,
          clipboardErrorType: CLIPBOARD_API_UNAVAILABLE,
          instagramOpened: false,
          manualRequired: true,
        };
      }

      deferredClipboard.resolve(summary);
      const copyResult = await deferredClipboard.completion;
      if (!copyResult.ok) {
        closeReservedWindow(reservedInstagramWindow);
        recordClipboardError(copyResult.errorType, logger);
        return {
          order,
          summary,
          copied: false,
          clipboardErrorType: copyResult.errorType,
          instagramOpened: false,
          manualRequired: true,
        };
      }

      const instagramOpened = sendReservedWindowToInstagram(reservedInstagramWindow, instagramUrl);
      return {
        order,
        summary,
        copied: true,
        clipboardErrorType: null,
        instagramOpened,
        manualRequired: false,
      };
    } catch (error) {
      deferredClipboard.reject(error);
      closeReservedWindow(reservedInstagramWindow);
      await deferredClipboard.completion;
      throw error;
    }
  })();

  return { deferredSupported: deferredClipboard.supported, completion };
}

export async function copyOrderSummaryDetailed(summary, clipboard = globalThis.navigator?.clipboard) {
  if (typeof clipboard?.writeText !== "function") {
    return { ok: false, errorType: CLIPBOARD_API_UNAVAILABLE };
  }
  try {
    await clipboard.writeText(summary);
    return { ok: true, errorType: null };
  } catch (error) {
    return { ok: false, errorType: classifyClipboardError(error) };
  }
}

export async function copyOrderSummary(summary, clipboard = globalThis.navigator?.clipboard) {
  return (await copyOrderSummaryDetailed(summary, clipboard)).ok;
}

export async function copyAndOpenInstagram({
  summary,
  instagramUrl,
  clipboard = globalThis.navigator?.clipboard,
  openWindow = globalThis.window?.open?.bind(globalThis.window),
  logger = console.warn,
}) {
  const copyPromise = copyOrderSummaryDetailed(summary, clipboard);
  const reservedInstagramWindow = typeof clipboard?.writeText === "function" ? reserveInstagramWindow(openWindow) : null;
  const copyResult = await copyPromise;

  if (!copyResult.ok) {
    closeReservedWindow(reservedInstagramWindow);
    recordClipboardError(copyResult.errorType, logger);
    return { copied: false, clipboardErrorType: copyResult.errorType, instagramOpened: false };
  }

  const instagramOpened = sendReservedWindowToInstagram(reservedInstagramWindow, instagramUrl);
  return { copied: true, clipboardErrorType: null, instagramOpened };
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
