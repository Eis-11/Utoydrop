import { describe, expect, test, vi } from "vitest";
import {
  beginDeferredOrderHandoff,
  buildOrderSummary,
  classifyClipboardError,
  CLIPBOARD_API_UNAVAILABLE,
  COPIED_ORDER_MESSAGE,
  copyAndOpenInstagram,
  copyOrderSummary,
  createCheckoutToken,
  MANUAL_HANDOFF_LABEL,
  openInstagram,
  reserveInstagramWindow,
  sendReservedWindowToInstagram,
} from "../../frontend/src/services/orderHandoff.js";

const order = {
  id: "UTOY-PRUEBA-001",
  total: 1047,
  customer: {
    name: "Cliente ficticio",
    instagram: "@cliente_ficticio",
    city: "Ciudad ficticia",
    delivery: "Envío",
    payment: "Transferencia",
    notes: "Datos de prueba",
  },
  items: [
    {
      name: "Playera ficticia",
      option1Label: "Talla",
      size: "M",
      option2Label: "Color",
      color: "Negro",
      quantity: 3,
      price: 349,
    },
  ],
};

class TestClipboardItem {
  constructor(data) {
    this.data = data;
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function popup() {
  return {
    opener: {},
    closed: false,
    close: vi.fn(),
    location: { replace: vi.fn() },
  };
}

describe("entrega segura del pedido a Instagram", () => {
  test("genera el resumen final con ID, variante, cantidad, total y entrega", () => {
    const summary = buildOrderSummary({ order, instagramHandle: "@utoy_drop" });
    expect(summary).toContain("ID del pedido: UTOY-PRUEBA-001");
    expect(summary).toContain("Playera ficticia | Talla: M | Color: Negro | Cantidad: 3");
    expect(summary).toContain("Total: $1,047");
    expect(summary).toContain("Ciudad / estado: Ciudad ficticia");
    expect(summary).toContain("Entrega: Envío");
  });

  test("inicia ClipboardItem diferido antes de crear el pedido", async () => {
    const events = [];
    const pendingOrder = deferred();
    const browserPopup = popup();
    const clipboard = {
      write: vi.fn((items) => {
        events.push("clipboard.write");
        return items[0].data["text/plain"];
      }),
    };

    const handoff = beginDeferredOrderHandoff({
      clipboard,
      ClipboardItemClass: TestClipboardItem,
      BlobClass: Blob,
      openWindow: () => browserPopup,
      instagramUrl: "https://www.instagram.com/direct/t/17844536325494661/",
      createOrderRequest: () => {
        events.push("createOrder");
        return pendingOrder.promise;
      },
      buildSummary: (createdOrder) => `ID del pedido: ${createdOrder.id}`,
      logger: vi.fn(),
    });

    expect(events).toEqual(["clipboard.write", "createOrder"]);
    pendingOrder.resolve(order);
    await handoff.completion;
  });

  test("resuelve la Promise de ClipboardItem con el resumen final y el ID real", async () => {
    let copiedText = "";
    const browserPopup = popup();
    const clipboard = {
      async write(items) {
        const blob = await items[0].data["text/plain"];
        copiedText = await blob.text();
      },
    };

    const handoff = beginDeferredOrderHandoff({
      clipboard,
      ClipboardItemClass: TestClipboardItem,
      BlobClass: Blob,
      openWindow: () => browserPopup,
      instagramUrl: "https://www.instagram.com/direct/t/17844536325494661/",
      createOrderRequest: () => Promise.resolve(order),
      buildSummary: (createdOrder) => buildOrderSummary({ order: createdOrder }),
      logger: vi.fn(),
    });
    const result = await handoff.completion;

    expect(result.copied).toBe(true);
    expect(copiedText).toContain("ID del pedido: UTOY-PRUEBA-001");
    expect(copiedText).not.toContain("undefined");
    expect(browserPopup.location.replace).toHaveBeenCalledTimes(1);
  });

  test("rechaza el contenido pendiente y cierra la ventana cuando falla el pedido", async () => {
    const browserPopup = popup();
    let contentRejected = false;
    const clipboard = {
      async write(items) {
        try {
          await items[0].data["text/plain"];
        } catch {
          contentRejected = true;
          throw new DOMException("Pedido no creado", "AbortError");
        }
      },
    };
    const orderError = new Error("No se pudo crear el pedido");
    const handoff = beginDeferredOrderHandoff({
      clipboard,
      ClipboardItemClass: TestClipboardItem,
      BlobClass: Blob,
      openWindow: () => browserPopup,
      instagramUrl: "https://www.instagram.com/direct/t/17844536325494661/",
      createOrderRequest: () => Promise.reject(orderError),
      buildSummary: () => "no debe generarse",
      logger: vi.fn(),
    });

    await expect(handoff.completion).rejects.toBe(orderError);
    expect(contentRejected).toBe(true);
    expect(browserPopup.close).toHaveBeenCalled();
    expect(browserPopup.location.replace).not.toHaveBeenCalled();
  });

  test("registra NotAllowedError sin incluir el contenido y no abre Instagram", async () => {
    const logger = vi.fn();
    const browserPopup = popup();
    const notAllowed = new DOMException("Bloqueado", "NotAllowedError");
    const handoff = beginDeferredOrderHandoff({
      clipboard: { write: vi.fn().mockRejectedValue(notAllowed) },
      ClipboardItemClass: TestClipboardItem,
      BlobClass: Blob,
      openWindow: () => browserPopup,
      instagramUrl: "https://www.instagram.com/direct/t/17844536325494661/",
      createOrderRequest: () => Promise.resolve(order),
      buildSummary: (createdOrder) => buildOrderSummary({ order: createdOrder }),
      logger,
    });
    const result = await handoff.completion;

    expect(result).toMatchObject({ copied: false, clipboardErrorType: "NotAllowedError", instagramOpened: false });
    expect(logger).toHaveBeenCalledWith("UTOY clipboard", { type: "NotAllowedError" });
    expect(JSON.stringify(logger.mock.calls)).not.toContain(order.id);
    expect(browserPopup.location.replace).not.toHaveBeenCalled();
  });

  test("ofrece el fallback COPIAR Y ABRIR INSTAGRAM cuando ClipboardItem no está disponible", async () => {
    const logger = vi.fn();
    const handoff = beginDeferredOrderHandoff({
      clipboard: { writeText: vi.fn() },
      ClipboardItemClass: undefined,
      BlobClass: Blob,
      openWindow: vi.fn(),
      instagramUrl: "https://www.instagram.com/direct/t/17844536325494661/",
      createOrderRequest: () => Promise.resolve(order),
      buildSummary: (createdOrder) => buildOrderSummary({ order: createdOrder }),
      logger,
    });
    const result = await handoff.completion;

    expect(MANUAL_HANDOFF_LABEL).toBe("COPIAR Y ABRIR INSTAGRAM");
    expect(result).toMatchObject({ copied: false, clipboardErrorType: CLIPBOARD_API_UNAVAILABLE, manualRequired: true });
    expect(logger).toHaveBeenCalledWith("UTOY clipboard", { type: CLIPBOARD_API_UNAVAILABLE });
  });

  test("el fallback confirma la copia antes de abrir Instagram", async () => {
    const events = [];
    const browserPopup = popup();
    browserPopup.location.replace.mockImplementation(() => events.push("instagram"));
    const result = await copyAndOpenInstagram({
      summary: "ID del pedido: UTOY-PRUEBA-001",
      instagramUrl: "https://www.instagram.com/direct/t/17844536325494661/",
      clipboard: {
        writeText: vi.fn(() => {
          events.push("copy-start");
          return Promise.resolve().then(() => events.push("copy-complete"));
        }),
      },
      openWindow: () => {
        events.push("reserve-window");
        return browserPopup;
      },
      logger: vi.fn(),
    });

    expect(result).toMatchObject({ copied: true, instagramOpened: true });
    expect(events).toEqual(["copy-start", "reserve-window", "copy-complete", "instagram"]);
  });

  test("Instagram no se abre cuando la copia manual falla", async () => {
    const browserPopup = popup();
    const result = await copyAndOpenInstagram({
      summary: "pedido ficticio",
      instagramUrl: "https://www.instagram.com/direct/t/17844536325494661/",
      clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException("Bloqueado", "NotAllowedError")) },
      openWindow: () => browserPopup,
      logger: vi.fn(),
    });

    expect(result).toMatchObject({ copied: false, clipboardErrorType: "NotAllowedError", instagramOpened: false });
    expect(browserPopup.close).toHaveBeenCalled();
    expect(browserPopup.location.replace).not.toHaveBeenCalled();
  });

  test("clasifica NotFoundError y API no disponible", () => {
    expect(classifyClipboardError(new DOMException("Sin formato", "NotFoundError"))).toBe("NotFoundError");
    expect(classifyClipboardError(null, false)).toBe(CLIPBOARD_API_UNAVAILABLE);
  });

  test("usa exactamente la confirmación aprobada cuando la copia funciona", () => {
    expect(COPIED_ORDER_MESSAGE).toBe("Tu pedido fue copiado. En Instagram solo pégalo y envíalo.");
  });

  test("solo confirma la copia de texto cuando el portapapeles acepta el resumen", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyOrderSummary("pedido", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("pedido");
    expect(await copyOrderSummary("pedido", { writeText: vi.fn().mockRejectedValue(new Error("bloqueado")) })).toBe(false);
    expect(await copyOrderSummary("pedido", null)).toBe(false);
  });

  test("reserva una ventana durante el gesto y después abre el chat sin parámetros", () => {
    const browserPopup = popup();
    const openWindow = vi.fn(() => browserPopup);
    const reserved = reserveInstagramWindow(openWindow);
    const url = "https://www.instagram.com/direct/t/17844536325494661/";

    expect(openWindow).toHaveBeenCalledWith("about:blank", "utoy-instagram");
    expect(sendReservedWindowToInstagram(reserved, url)).toBe(true);
    expect(browserPopup.location.replace).toHaveBeenCalledWith(url);
    expect(new URL(url).search).toBe("");
  });

  test("detecta el bloqueo de Instagram y permite un intento manual posterior", () => {
    expect(reserveInstagramWindow(() => null)).toBeNull();
    expect(openInstagram("https://www.instagram.com/utoy_drop/", () => null)).toBe(false);
    expect(openInstagram("https://www.instagram.com/utoy_drop/", () => ({ opener: {} }))).toBe(true);
  });

  test("crea identificadores criptográficos estables para un solo intento", () => {
    expect(createCheckoutToken({ randomUUID: () => "12345678-1234-4234-9234-123456789abc" }))
      .toBe("12345678-1234-4234-9234-123456789abc");
  });
});
