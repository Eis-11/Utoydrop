export function applyCatalogSnapshot(catalog, handlers) {
  handlers.onProductsChange(catalog.products);
  handlers.onCategoriesChange(catalog.categories);
  handlers.onCollectionsChange(catalog.collections);
  handlers.onRevisionChange(catalog.revision || 0);
  return catalog;
}

export function createCatalogRefreshCoordinator(loadCatalog, applyCatalog) {
  let inFlight = null;

  return function refreshCatalog() {
    if (inFlight) return inFlight;

    inFlight = Promise.resolve()
      .then(loadCatalog)
      .then((catalog) => {
        applyCatalog(catalog);
        return catalog;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}

export function synchronizeCatalogAfterOrderMutation(mutation, refreshCatalog) {
  if (!refreshCatalog || !["cancel", "archive"].includes(mutation)) return Promise.resolve(null);
  return refreshCatalog();
}
