import { useCallback, useEffect, useState } from "react";
import { About } from "./components/About";
import { AdminPanel } from "./components/AdminPanel";
import { CartDrawer } from "./components/CartDrawer";
import { Catalog } from "./components/Catalog";
import { Contact } from "./components/Contact";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { ProductModal } from "./components/ProductModal";
import { StoreHighlights } from "./components/StoreHighlights";
import { TrustGuide } from "./components/TrustGuide";
import { Icon } from "./components/Icons";
import { MobileDock } from "./components/MobileDock";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { products as initialProducts } from "./data/products";
import { getCatalog } from "./services/api";

const initialCategories = [...new Set(initialProducts.map((product) => product.category).filter(Boolean))].sort();
const initialCollections = [...new Set(initialProducts.map((product) => product.collection).filter(Boolean))].sort();
const STORAGE_VERSION = "clean-catalog-v1";

export default function App() {
  const [route, setRoute] = useState(window.location.hash);
  const [quickFilter, setQuickFilter] = useState("Todo");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileSection, setMobileSection] = useState("home");
  const [cart, setCart] = useLocalStorage("utoy-cart", []);
  const [favorites, setFavorites] = useLocalStorage("utoy-favorites", []);
  const [catalogProducts, setCatalogProducts] = useState(initialProducts);
  const [catalogCategories, setCatalogCategories] = useState(initialCategories);
  const [catalogCollections, setCatalogCollections] = useState(initialCollections);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const closeModal = useCallback(() => setSelectedProduct(null), []);
  const refreshCatalog = useCallback(async () => {
    const catalog = await getCatalog();
    setCatalogProducts(catalog.products);
    setCatalogCategories(catalog.categories);
    setCatalogCollections(catalog.collections);
    setCatalogRevision(catalog.revision || 0);
    return catalog;
  }, []);

  useEffect(() => {
    if (window.localStorage.getItem("utoy-storage-version") === STORAGE_VERSION) return;
    window.localStorage.removeItem("utoy-cart");
    window.localStorage.removeItem("utoy-favorites");
    window.localStorage.setItem("utoy-storage-version", STORAGE_VERSION);
    setCart([]);
    setFavorites([]);
  }, [setCart, setFavorites]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function updateRoute() {
      const nextRoute = window.location.hash;
      setRoute(nextRoute);
      if (nextRoute === "#admin") window.scrollTo({ top: 0 });
    }
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  useEffect(() => {
    let active = true;
    function refreshIfActive() {
      if (active) refreshCatalog().catch(() => {});
    }
    refreshIfActive();
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") refreshIfActive();
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshCatalog]);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 780px)");
    let frame = 0;

    function syncMobileSection() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!mobileQuery.matches) return;
        const catalog = document.querySelector("#catalogo");
        const guide = document.querySelector("#guia");
        if (!catalog || !guide) return;

        const readingLine = window.scrollY + Math.min(window.innerHeight * 0.36, 300);
        const nextSection = readingLine >= guide.offsetTop
          ? "guide"
          : readingLine >= catalog.offsetTop
            ? "catalog"
            : "home";
        setMobileSection((current) => current === nextSection ? current : nextSection);
      });
    }

    syncMobileSection();
    window.addEventListener("scroll", syncMobileSection, { passive: true });
    window.addEventListener("resize", syncMobileSection);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", syncMobileSection);
      window.removeEventListener("resize", syncMobileSection);
    };
  }, []);

  function scrollToSection(selector) {
    const behavior = window.matchMedia("(max-width: 780px)").matches ? "auto" : "smooth";
    window.setTimeout(() => document.querySelector(selector)?.scrollIntoView({ behavior, block: "start" }), 20);
  }

  function setCategoryFromNavigation(category) {
    setQuickFilter(category);
    setOnlyFavorites(false);
    scrollToSection("#catalogo");
  }

  function handleHeaderNavigation(label, href) {
    if (label === "Inicio") {
      setOnlyFavorites(false);
      setQuickFilter("Todo");
      window.history.replaceState(null, "", "#inicio");
      window.scrollTo({ top: 0, behavior: window.matchMedia("(max-width: 780px)").matches ? "auto" : "smooth" });
      return;
    }
    if (label === "Catálogo") {
      setQuickFilter("Todo");
      setOnlyFavorites(false);
      window.history.replaceState(null, "", href);
      scrollToSection("#catalogo");
      return;
    }
    if (label === "Playeras" || label === "Sudaderas") {
      window.history.replaceState(null, "", href);
      setCategoryFromNavigation(label);
      return;
    }
    window.history.replaceState(null, "", href);
    scrollToSection(href);
  }

  function showFavoritesFromHeader() {
    setQuickFilter("Todo");
    setOnlyFavorites(true);
    window.history.replaceState(null, "", "#catalogo");
    scrollToSection("#catalogo");
  }

  function toggleFavorite(productId) {
    setFavorites((current) => {
      const active = current.includes(productId);
      setToast(active ? "Eliminado de favoritos" : "Guardado en favoritos");
      return active ? current.filter((id) => id !== productId) : [...current, productId];
    });
  }

  function addToCart(product, options) {
    const cartId = `${product.id}-${options.size}-${options.color}`;
    setCart((current) => {
      const exists = current.find((item) => item.cartId === cartId);
      if (exists) {
        return current.map((item) => item.cartId === cartId ? { ...item, quantity: Math.min(item.stock || 999, item.quantity + options.quantity) } : item);
      }
      return [...current, { ...product, ...options, cartId }];
    });
    setToast(`${product.name} agregado al pedido`);
    setSelectedProduct(null);
    setCartOpen(true);
  }

  function changeQuantity(cartId, difference) {
    setCart((current) =>
      current
        .map((item) => item.cartId === cartId ? { ...item, quantity: item.quantity + difference } : item)
        .map((item) => item.cartId === cartId ? { ...item, quantity: Math.min(item.stock || 999, item.quantity) } : item)
        .filter((item) => item.quantity > 0),
    );
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const adminRoute = route === "#admin";
  if (adminRoute) {
    return <AdminPanel products={catalogProducts} categories={catalogCategories} collections={catalogCollections} catalogRevision={catalogRevision} onProductsChange={setCatalogProducts} onCategoriesChange={setCatalogCategories} onCollectionsChange={setCatalogCollections} onRevisionChange={setCatalogRevision} onCatalogRefresh={refreshCatalog} />;
  }

  const activeProducts = catalogProducts.filter((product) => product.active !== false);

  return (
    <>
      <Header onNavigate={handleHeaderNavigation} onFavoritesOpen={showFavoritesFromHeader} cartCount={cartCount} favoriteCount={favorites.length} onCartOpen={() => setCartOpen(true)} />
      <main>
        <Hero productCount={activeProducts.length} />
        <StoreHighlights products={activeProducts} onDetails={setSelectedProduct} />
        <Catalog
          quickFilter={quickFilter}
          onQuickFilter={setQuickFilter}
          onDetails={setSelectedProduct}
          favorites={favorites}
          onFavorite={toggleFavorite}
          onlyFavorites={onlyFavorites}
          onOnlyFavoritesChange={setOnlyFavorites}
          products={activeProducts}
          categories={catalogCategories}
          collections={catalogCollections}
        />
        <TrustGuide />
        <About />
        <Contact />
      </main>
      <Footer />
      <MobileDock
        active={cartOpen ? "cart" : mobileSection}
        cartCount={cartCount}
        onHome={() => { setMobileSection("home"); handleHeaderNavigation("Inicio", "#inicio"); }}
        onCatalog={() => { setMobileSection("catalog"); handleHeaderNavigation("Catálogo", "#catalogo"); }}
        onGuide={() => { setMobileSection("guide"); setOnlyFavorites(false); handleHeaderNavigation("Guía", "#guia"); }}
        onCart={() => setCartOpen(true)}
      />
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={closeModal}
          onAdd={addToCart}
          isFavorite={favorites.includes(selectedProduct.id)}
          onFavorite={() => toggleFavorite(selectedProduct.id)}
        />
      )}
      <CartDrawer
        open={cartOpen}
        items={cart}
        onClose={() => setCartOpen(false)}
        onQuantity={changeQuantity}
        onRemove={(cartId) => setCart((current) => current.filter((item) => item.cartId !== cartId))}
        onClear={() => setCart([])}
      />
      {toast && <div className="toast" role="status"><Icon name="check" size={17} /> {toast}</div>}
    </>
  );
}
