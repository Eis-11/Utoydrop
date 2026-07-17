import { describe, expect, test, vi } from "vitest";
import {
  applyCatalogSnapshot,
  createCatalogRefreshCoordinator,
  synchronizeCatalogAfterOrderMutation,
} from "../../frontend/src/services/catalogState.js";

function catalogWithStock(stock, revision) {
  return {
    products: [{ id: "producto-ficticio", stock }],
    categories: ["Playeras"],
    collections: ["UTOY DROP"],
    revision,
  };
}

function catalogHarness(snapshot) {
  const state = {};
  const loadCatalog = vi.fn().mockResolvedValue(snapshot);
  const refreshCatalog = createCatalogRefreshCoordinator(loadCatalog, (catalog) => applyCatalogSnapshot(catalog, {
    onProductsChange: (products) => { state.products = products; },
    onCategoriesChange: (categories) => { state.categories = categories; },
    onCollectionsChange: (collections) => { state.collections = collections; },
    onRevisionChange: (revision) => { state.revision = revision; },
  }));
  return { loadCatalog, refreshCatalog, state };
}

describe("sincronizaciÃ³n del catÃ¡logo despuÃ©s de pedidos", () => {
  test("cancelar muestra inmediatamente el stock restaurado", async () => {
    const harness = catalogHarness(catalogWithStock(3, 12));

    await synchronizeCatalogAfterOrderMutation("cancel", harness.refreshCatalog);

    expect(harness.state.products[0].stock).toBe(3);
    expect(harness.loadCatalog).toHaveBeenCalledOnce();
  });

  test("archivar un pedido nuevo muestra inmediatamente el stock restaurado", async () => {
    const harness = catalogHarness(catalogWithStock(5, 21));

    await synchronizeCatalogAfterOrderMutation("archive", harness.refreshCatalog);

    expect(harness.state.products[0].stock).toBe(5);
  });

  test("archivar otro estado conserva el stock descontado del servidor", async () => {
    const harness = catalogHarness(catalogWithStock(4, 30));

    await synchronizeCatalogAfterOrderMutation("archive", harness.refreshCatalog);

    expect(harness.state.products[0].stock).toBe(4);
  });

  test("sincroniza la revisiÃ³n optimista y deduplica solicitudes simultÃ¡neas", async () => {
    const harness = catalogHarness(catalogWithStock(7, 44));

    await Promise.all([
      synchronizeCatalogAfterOrderMutation("cancel", harness.refreshCatalog),
      synchronizeCatalogAfterOrderMutation("archive", harness.refreshCatalog),
    ]);

    expect(harness.state.revision).toBe(44);
    expect(harness.loadCatalog).toHaveBeenCalledOnce();
  });

  test("libera una sincronizaciÃ³n fallida para permitir reintentar", async () => {
    const state = {};
    const loadCatalog = vi.fn()
      .mockRejectedValueOnce(new Error("sin conexiÃ³n"))
      .mockResolvedValueOnce(catalogWithStock(6, 51));
    const refreshCatalog = createCatalogRefreshCoordinator(loadCatalog, (catalog) => applyCatalogSnapshot(catalog, {
      onProductsChange: (products) => { state.products = products; },
      onCategoriesChange: () => {},
      onCollectionsChange: () => {},
      onRevisionChange: (revision) => { state.revision = revision; },
    }));

    await expect(refreshCatalog()).rejects.toThrow("sin conexiÃ³n");
    await refreshCatalog();

    expect(loadCatalog).toHaveBeenCalledTimes(2);
    expect(state.products[0].stock).toBe(6);
    expect(state.revision).toBe(51);
  });
});
