import { describe, expect, test, vi } from "vitest";
import {
  buildOrderSummary,
  COPIED_ORDER_MESSAGE,
  copyOrderSummary,
  createCheckoutToken,
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

describe("entrega segura del pedido a Instagram", () => {
  test("genera el resumen final con ID, variante, cantidad, total y entrega", () => {
    const summary = buildOrderSummary({ order, instagramHandle: "@utoy_drop" });
    expect(summary).toContain("ID del pedido: UTOY-PRUEBA-001");
    expect(summary).toContain("Playera ficticia | Talla: M | Color: Negro | Cantidad: 3");
    expect(summary).toContain("Total: $1,047");
    expect(summary).toContain("Ciudad / estado: Ciudad ficticia");
    expect(summary).toContain("Entrega: Envío");
  });

  test("usa exactamente la confirmación aprobada cuando la copia funciona", () => {
    expect(COPIED_ORDER_MESSAGE).toBe("Tu pedido fue copiado. En Instagram solo pégalo y envíalo.");
  });

  test("solo confirma la copia cuando el portapapeles acepta el texto", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyOrderSummary("pedido", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("pedido");

    expect(await copyOrderSummary("pedido", { writeText: vi.fn().mockRejectedValue(new Error("bloqueado")) })).toBe(false);
    expect(await copyOrderSummary("pedido", null)).toBe(false);
  });

  test("reserva una ventana durante el gesto y después abre el chat sin parámetros", () => {
    const replace = vi.fn();
    const popup = { opener: {}, closed: false, location: { replace } };
    const openWindow = vi.fn(() => popup);
    const reserved = reserveInstagramWindow(openWindow);
    const url = "https://www.instagram.com/direct/t/17844536325494661/";

    expect(openWindow).toHaveBeenCalledWith("about:blank", "utoy-instagram");
    expect(sendReservedWindowToInstagram(reserved, url)).toBe(true);
    expect(replace).toHaveBeenCalledWith(url);
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
