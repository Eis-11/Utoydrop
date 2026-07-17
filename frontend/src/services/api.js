const DEFAULT_TIMEOUT = 10000;

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
  try {
    const response = await fetch(path, {
      ...options,
      headers: { Accept: "application/json", ...options.headers },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(data.message || "No se pudo completar la solicitud.", response.status);
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new ApiError("La conexión tardó demasiado. Intenta de nuevo.");
    if (error instanceof ApiError) throw error;
    throw new ApiError("No pudimos conectar con la tienda. Revisa tu conexión e intenta de nuevo.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getCatalog() {
  return apiRequest("/api/catalog");
}

export function createOrder(customer, items, checkoutToken) {
  return apiRequest("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer,
      checkoutToken,
      items: items.map(({ id, size, color, quantity }) => ({ id, size, color, quantity })),
    }),
  });
}
