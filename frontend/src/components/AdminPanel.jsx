import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { variantKey } from "../utils/inventory";
import { Icon } from "./Icons";
import { SafeImage } from "./SafeImage";

const emptyProduct = {
  name: "",
  category: "Playeras",
  collection: "UTOY DROP",
  price: 349,
  stock: 10,
  sizes: ["S", "M", "L", "XL"],
  colors: ["Negro"],
  option1Label: "Talla",
  option2Label: "Color",
  image: "",
  badge: "",
  featured: false,
  active: true,
  variantStock: {},
  description: "",
};

const PRODUCT_PRESETS = [
  { id: "playera", label: "Playera", category: "Playeras", option1Label: "Talla", option2Label: "Color", sizes: ["S", "M", "L", "XL"], colors: ["Negro"] },
  { id: "camisa", label: "Camisa", category: "Camisas", option1Label: "Talla", option2Label: "Color", sizes: ["S", "M", "L", "XL"], colors: ["Blanco"] },
  { id: "short", label: "Short", category: "Shorts", option1Label: "Talla", option2Label: "Color", sizes: ["S", "M", "L", "XL"], colors: ["Negro"] },
  { id: "gorra", label: "Gorra", category: "Gorras", option1Label: "Talla", option2Label: "Color", sizes: ["Unitalla"], colors: ["Negro"] },
  { id: "perfume", label: "Perfume", category: "Perfumes", option1Label: "Presentación", option2Label: "Aroma", sizes: ["50 ml", "100 ml"], colors: ["Original"] },
  { id: "custom", label: "Otro producto", category: "Otros", option1Label: "Opción", option2Label: "Variante", sizes: ["Única"], colors: ["Único"] },
];
const ADMIN_PAGE_SIZE = 20;

function money(value) {
  return Number(value).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

function parseList(value) {
  return [...new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean))];
}

async function optimizeProductImage(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Usa una imagen JPG, PNG o WebP.");
  if (file.size > 25 * 1024 * 1024) throw new Error("La imagen original no puede superar 25 MB.");

  let source;
  let objectUrl;
  try {
    if ("createImageBitmap" in window) {
      source = await window.createImageBitmap(file);
    } else {
      objectUrl = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("No se pudo procesar la imagen."));
        image.src = objectUrl;
      });
    }
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d", { alpha: true });
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .84));
    if (!blob) throw new Error("No se pudo optimizar la imagen.");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("No se pudo leer la imagen optimizada."));
      reader.readAsDataURL(blob);
    });
  } finally {
    source?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function editorForm(product) {
  const source = product || emptyProduct;
  return {
    ...source,
    sizesText: source.sizes.join(", "),
    colorsText: source.colors.join(", "),
    variantStock: { ...(source.variantStock || {}) },
    variantStockEnabled: Object.keys(source.variantStock || {}).length > 0,
  };
}

function Login({ onLogin, notice }) {
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      onLogin(true);
    } catch (requestError) {
      setError(requestError.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login">
      <section className="admin-login-card">
        <a className="admin-logo" href="#inicio"><img src="/img/logo-utoy-drop-hero.jpg" alt="UTOY DROP" /></a>
        <span className="admin-kicker">Panel privado</span>
        <h1>ADMINISTRADOR<br /><em>DE UTOY DROP.</em></h1>
        <p>Gestiona catálogo, precios, inventario y visibilidad desde un solo lugar.</p>
        {notice && <span className="admin-error">{notice}</span>}
        <form onSubmit={submit}>
          <label>Contraseña
            <span className="admin-password-field">
              <input type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ingresa tu contraseña" autoFocus />
              <button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"} title={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}>
                <Icon name="eye" />
              </button>
            </span>
          </label>
          {error && <span className="admin-error">{error}</span>}
          <button className="button" type="submit" disabled={loading}>{loading ? "Validando..." : "Entrar al panel"} <Icon name="arrow" /></button>
        </form>
      </section>
    </main>
  );
}

function ProductEditor({ product, onSave, onClose, onUpload, collectionOptions, categoryOptions }) {
  const [form, setForm] = useState(() => editorForm(product));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const onCloseRef = useRef(onClose);
  const sizes = useMemo(() => parseList(form.sizesText), [form.sizesText]);
  const colors = useMemo(() => parseList(form.colorsText), [form.colorsText]);
  const variantTotal = useMemo(() => sizes.reduce((total, size) => total + colors.reduce(
    (subtotal, color) => subtotal + Math.max(0, Number(form.variantStock[variantKey(size, color)] || 0)),
    0,
  ), 0), [colors, form.variantStock, sizes]);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    document.body.classList.add("modal-open");
    function closeWithEscape(event) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", closeWithEscape);
      previouslyFocused?.focus?.();
    };
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError("");
  }

  function updateVariant(size, color, value) {
    const key = variantKey(size, color);
    setForm((current) => ({
      ...current,
      variantStock: { ...current.variantStock, [key]: Math.max(0, Number(value || 0)) },
    }));
  }

  function applyPreset(preset) {
    setForm((current) => ({
      ...current,
      category: preset.category,
      option1Label: preset.option1Label,
      option2Label: preset.option2Label,
      sizesText: preset.sizes.join(", "),
      colorsText: preset.colors.join(", "),
      image: current.image || "",
      variantStock: {},
      variantStockEnabled: false,
    }));
    setFormError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.category.trim() || !form.collection.trim()) {
      setFormError("Completa nombre, categoría y colección.");
      return;
    }
    if (!sizes.length || !colors.length) {
      setFormError("Agrega al menos una talla y un color.");
      return;
    }
    const { sizesText, colorsText, variantStockEnabled, ...productFields } = form;
    const cleanVariantStock = sizes.reduce((stock, size) => {
      colors.forEach((color) => { stock[variantKey(size, color)] = Math.max(0, Number(form.variantStock[variantKey(size, color)] || 0)); });
      return stock;
    }, {});
    setSaving(true);
    try {
      const saved = await onSave({
        ...productFields,
        name: form.name.trim(),
        category: form.category.trim(),
        collection: form.collection.trim(),
        option1Label: String(form.option1Label || "Opción").trim(),
        option2Label: String(form.option2Label || "Variante").trim(),
        price: Math.max(0, Number(form.price)),
        stock: variantStockEnabled ? variantTotal : Math.max(0, Number(form.stock)),
        variantStock: variantStockEnabled ? cleanVariantStock : {},
        sizes,
        colors,
        image: form.image.trim(),
        description: form.description.trim(),
      });
      if (!saved) setFormError("No se pudo guardar. Revisa la conexión e intenta otra vez.");
    } catch (error) {
      setFormError(error.message || "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const imageUrl = await onUpload(file);
      update("image", imageUrl);
    } catch (error) {
      setUploadError(error.message || "No se pudo subir la imagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" onMouseDown={onClose}>
      <form className="admin-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="admin-editor-head">
          <div><span className="admin-kicker">{product ? "Editar producto" : "Nueva pieza"}</span><h2 id="product-editor-title">{form.name || "Agregar al catálogo"}</h2></div>
          <button type="button" className="round-button" onClick={onClose} aria-label="Cerrar editor"><Icon name="close" /></button>
        </div>
        <div className="admin-form-grid">
          {!product?.id && (
            <section className="admin-product-starter wide">
              <div><span className="admin-kicker">Inicio rápido</span><h3>¿Qué quieres publicar?</h3><p>Elige una plantilla y ajusta cualquier dato después.</p></div>
              <div className="admin-preset-grid">
                {PRODUCT_PRESETS.map((preset) => <button type="button" key={preset.id} onClick={() => applyPreset(preset)}><Icon name="plus" size={15} /><span>{preset.label}</span><small>{preset.option1Label} / {preset.option2Label}</small></button>)}
              </div>
            </section>
          )}
          <section className="admin-form-section wide">
            <div className="admin-section-title"><span>01</span><div><h3>Información principal</h3><p>Identidad, precio y descripción del producto.</p></div></div>
            <div className="admin-subgrid">
              <label className="admin-field wide">Nombre<input required maxLength="120" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ej. Playera Oversize UTOY" /></label>
              <label className="admin-field">Categoría<select required value={form.category} onChange={(event) => update("category", event.target.value)}><option value="" disabled>Selecciona una categoría</option>{categoryOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
              <label className="admin-field">Colección<select required value={form.collection} onChange={(event) => update("collection", event.target.value)}><option value="" disabled>Selecciona una colección</option>{collectionOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
              <label className="admin-field">Precio MXN<input required type="number" min="0" step="1" value={form.price} onChange={(event) => update("price", event.target.value)} /></label>
              <label className="admin-field">Etiqueta<input list="badge-options" value={form.badge} onChange={(event) => update("badge", event.target.value)} placeholder="Sin etiqueta" /><datalist id="badge-options"><option value="Nuevo" /><option value="Mas vendido" /><option value="Oferta" /><option value="Exclusivo" /></datalist></label>
              <label className="admin-field wide">Descripción<textarea required rows="4" maxLength="800" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Características, contenido, material, aroma, medidas o detalles relevantes" /></label>
            </div>
          </section>

          <section className="admin-form-section wide">
            <div className="admin-section-title"><span>02</span><div><h3>Fotografía</h3><p>Sube la imagen real o define una ruta disponible.</p></div></div>
            <div className="admin-image-upload">
              <SafeImage src={form.image} alt="Vista previa del producto" loading="eager" />
              <div>
                <h3>{uploading ? "Subiendo imagen..." : "Sube una foto propia"}</h3>
                <p>JPG, PNG o WebP de hasta 25 MB. La imagen se optimiza automáticamente antes de subirla.</p>
                <label className="button button-ghost"><Icon name="upload" /> Elegir fotografía<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage} disabled={uploading} /></label>
                {uploadError && <span className="admin-error">{uploadError}</span>}
              </div>
            </div>
            <div className="admin-subgrid image-options">
              <label className="admin-field wide">Ruta de imagen<input required value={form.image} onChange={(event) => update("image", event.target.value)} placeholder="Sube una fotografía para completar este campo" /></label>
            </div>
          </section>

          <section className="admin-form-section wide">
            <div className="admin-section-title"><span>03</span><div><h3>Variantes e inventario</h3><p>Personaliza todas las tallas, colores y existencias.</p></div></div>
            <div className="admin-subgrid">
              <label className="admin-field">Nombre de la primera variante<input required value={form.option1Label || "Talla"} onChange={(event) => update("option1Label", event.target.value)} placeholder="Talla, Presentación, Contenido..." /><small>Ejemplos: Talla para ropa o Presentación para perfumes.</small></label>
              <label className="admin-field">Nombre de la segunda variante<input required value={form.option2Label || "Color"} onChange={(event) => update("option2Label", event.target.value)} placeholder="Color, Aroma, Tipo..." /><small>Ejemplos: Color, Aroma, Fragancia o Acabado.</small></label>
              <label className="admin-field">Opciones de {form.option1Label || "Talla"}, separadas por coma<input required value={form.sizesText} onChange={(event) => update("sizesText", event.target.value)} placeholder="S, M, L, XL o 50 ml, 100 ml" /><small>{sizes.length ? `${sizes.length} opción(es): ${sizes.join(" · ")}` : "Agrega al menos una opción"}</small></label>
              <label className="admin-field">Opciones de {form.option2Label || "Color"}, separadas por coma<input required value={form.colorsText} onChange={(event) => update("colorsText", event.target.value)} placeholder="Negro, Blanco o Floral, Amaderado" /><small>{colors.length ? `${colors.length} opción(es): ${colors.join(" · ")}` : "Agrega al menos una opción"}</small></label>
              <label className="admin-field">Inventario general<input required type="number" min="0" value={form.stock} disabled={form.variantStockEnabled} onChange={(event) => update("stock", event.target.value)} /><small>Se usa cuando el inventario por variante está desactivado.</small></label>
              <label className="admin-check admin-variant-toggle"><input type="checkbox" checked={form.variantStockEnabled} onChange={(event) => update("variantStockEnabled", event.target.checked)} /><span><strong>Inventario por combinación</strong><small>Controla cada {String(form.option1Label || "opción").toLowerCase()} y {String(form.option2Label || "variante").toLowerCase()}.</small></span></label>
            </div>
            {form.variantStockEnabled && (
              <div className="variant-editor">
                <div className="variant-editor-head"><strong>Existencias por variante</strong><span>Total: {variantTotal} pieza(s)</span></div>
                <div className="variant-grid">
                  {sizes.flatMap((size) => colors.map((color) => {
                    const key = variantKey(size, color);
                    return <label key={key}><span><strong>{size}</strong>{color}</span><input type="number" min="0" value={form.variantStock[key] || 0} onChange={(event) => updateVariant(size, color, event.target.value)} aria-label={`Inventario ${size} ${color}`} /></label>;
                  }))}
                </div>
              </div>
            )}
          </section>

          <section className="admin-form-section wide compact">
            <div className="admin-section-title"><span>04</span><div><h3>Publicación</h3><p>Controla cómo aparece la prenda en la tienda.</p></div></div>
            <div className="admin-publication-options">
              <label className="admin-check"><input type="checkbox" checked={form.featured} onChange={(event) => update("featured", event.target.checked)} /> Producto destacado</label>
              <label className="admin-check"><input type="checkbox" checked={form.active} onChange={(event) => update("active", event.target.checked)} /> Visible en la tienda</label>
            </div>
          </section>
          {formError && <div className="admin-form-error wide" role="alert">{formError}</div>}
        </div>
        <div className="admin-editor-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={saving}>Cancelar</button><button className="button" type="submit" disabled={saving || uploading}>{saving ? "Guardando..." : product?.id ? "Guardar cambios" : "Publicar producto"} <Icon name="check" /></button></div>
      </form>
    </div>
  );
}

export function AdminPanel({ products, categories = [], collections = [], onProductsChange, onCategoriesChange, onCollectionsChange }) {
  const [authenticated, setAuthenticated] = useState(null);
  const [loginNotice, setLoginNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editorProduct, setEditorProduct] = useState(undefined);
  const [editorOpen, setEditorOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeView, setActiveView] = useState("overview");
  const [orderFilter, setOrderFilter] = useState("todos");
  const [productCategory, setProductCategory] = useState("Todas");
  const [productVisibility, setProductVisibility] = useState("todos");
  const [productPage, setProductPage] = useState(1);
  const [newCategory, setNewCategory] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [newCollection, setNewCollection] = useState("");
  const [collectionSaving, setCollectionSaving] = useState(false);
  const closeEditor = useCallback(() => setEditorOpen(false), []);

  useEffect(() => {
    window.localStorage.removeItem("utoy-admin-session");
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => setAuthenticated(response.ok))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (!authenticated || editorOpen) return undefined;
    loadOrders();
    const interval = window.setInterval(loadOrders, 6000);
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") loadOrders();
    }
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [authenticated, editorOpen]);

  useEffect(() => {
    if (!authenticated) return undefined;
    const idleLimit = 5 * 60 * 1000;
    const heartbeatInterval = 30 * 1000;
    const activityRenewInterval = 10 * 1000;
    let idleTimer = 0;
    let heartbeatTimer = 0;
    let lastActivityAt = Date.now();
    let lastRenewedAt = 0;
    let renewalInFlight = false;
    let endingSession = false;

    function endForInactivity() {
      if (endingSession) return;
      endingSession = true;
      window.clearTimeout(idleTimer);
      fetch("/api/admin/logout", { method: "POST", keepalive: true }).catch(() => {});
      setLoginNotice("La sesión se cerró después de 5 minutos sin actividad.");
      setAuthenticated(false);
    }

    function armIdleTimer() {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(endForInactivity, idleLimit);
    }

    function recordActivity() {
      lastActivityAt = Date.now();
      armIdleTimer();
      if (lastActivityAt - lastRenewedAt >= activityRenewInterval) renewActiveSession();
    }

    function renewActiveSession() {
      if (renewalInFlight || endingSession) return;
      if (Date.now() - lastActivityAt >= idleLimit) {
        endForInactivity();
        return;
      }
      renewalInFlight = true;
      fetch("/api/admin/activity", { method: "POST", cache: "no-store", credentials: "same-origin" })
        .then((response) => {
          if (response.status === 401) endForInactivity();
          else if (response.ok) lastRenewedAt = Date.now();
        })
        .catch(() => {})
        .finally(() => { renewalInFlight = false; });
    }

    const activityEvents = ["pointerdown", "pointermove", "keydown", "input", "scroll", "touchstart"];
    armIdleTimer();
    renewActiveSession();
    heartbeatTimer = window.setInterval(renewActiveSession, heartbeatInterval);
    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    return () => {
      window.clearTimeout(idleTimer);
      window.clearInterval(heartbeatTimer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
    };
  }, [authenticated]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    return products.filter((product) => {
      const matchesTerm = !term || `${product.name} ${product.collection} ${product.category}`.toLowerCase().includes(term);
      const matchesCategory = productCategory === "Todas" || product.category === productCategory;
      const matchesVisibility = productVisibility === "todos" || (productVisibility === "visibles" ? product.active !== false : product.active === false);
      return matchesTerm && matchesCategory && matchesVisibility;
    });
  }, [productCategory, productVisibility, products, query]);
  const collectionOptions = useMemo(() => [...new Set([...collections, ...products.map((item) => item.collection).filter(Boolean)])].sort(), [collections, products]);
  const categoryOptions = useMemo(() => [...new Set([...categories, ...products.map((item) => item.category).filter(Boolean)])].sort(), [categories, products]);
  const productPageCount = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const visibleProducts = filtered.slice((productPage - 1) * ADMIN_PAGE_SIZE, productPage * ADMIN_PAGE_SIZE);

  useEffect(() => setProductPage(1), [productCategory, productVisibility, query]);
  useEffect(() => {
    if (productPage > productPageCount) setProductPage(productPageCount);
  }, [productPage, productPageCount]);

  if (authenticated === null) return <main className="admin-login"><section className="admin-login-card"><span className="admin-kicker">Panel privado</span><h1>VERIFICANDO<br /><em>SESIÓN.</em></h1><p>Comprobando el acceso seguro al administrador...</p></section></main>;
  if (!authenticated) return <Login notice={loginNotice} onLogin={(value) => { setLoginNotice(""); setAuthenticated(value); }} />;

  const inventory = products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const activeCount = products.filter((product) => product.active !== false).length;
  const lowStockProducts = products.filter((product) => Number(product.stock || 0) <= 5);
  const lowStock = lowStockProducts.length;
  const openOrders = orders.filter((order) => !["cerrado", "cancelado"].includes(order.status)).length;
  const orderTotal = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const filteredOrders = orders.filter((order) => orderFilter === "todos" || order.status === orderFilter);
  const recentOrders = orders.slice(0, 4);

  async function persistProducts(updater) {
    const next = typeof updater === "function" ? updater(products) : updater;
    const response = await fetch("/api/admin/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: next }),
    });
    if (response.status === 401) {
      setAuthenticated(false);
      return false;
    }
    if (!response.ok) return false;
    onProductsChange(next);
    return true;
  }

  async function uploadProductImage(file) {
    const image = await optimizeProductImage(file);
    const response = await fetch("/api/admin/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    return data.url;
  }

  async function persistCategories(nextCategories) {
    setCategorySaving(true);
    try {
      const response = await fetch("/api/admin/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: nextCategories }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthenticated(false);
        return false;
      }
      if (!response.ok) {
        setNotice(data.message || "No se pudieron guardar las categorías");
        return false;
      }
      onCategoriesChange(data.categories);
      return true;
    } finally {
      setCategorySaving(false);
    }
  }

  async function addCategory(event) {
    event.preventDefault();
    const category = newCategory.trim();
    if (!category) return;
    if (categoryOptions.some((item) => item.toLocaleLowerCase("es-MX") === category.toLocaleLowerCase("es-MX"))) {
      setNotice("Esa categoría ya existe");
      return;
    }
    if (await persistCategories([...categories, category].sort())) {
      setNewCategory("");
      setNotice("Categoría agregada y visible en la tienda");
    }
  }

  async function removeCategory(category) {
    if (products.some((product) => product.category === category)) {
      setNotice("Mueve o elimina los productos de esta categoría antes de borrarla");
      return;
    }
    if (!window.confirm(`Eliminar la categoría ${category}?`)) return;
    if (await persistCategories(categories.filter((item) => item !== category))) setNotice("Categoría eliminada");
  }

  async function persistCollections(nextCollections) {
    setCollectionSaving(true);
    try {
      const response = await fetch("/api/admin/collections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collections: nextCollections }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthenticated(false);
        return false;
      }
      if (!response.ok) {
        setNotice(data.message || "No se pudieron guardar las colecciones");
        return false;
      }
      onCollectionsChange(data.collections);
      return true;
    } finally {
      setCollectionSaving(false);
    }
  }

  async function addCollection(event) {
    event.preventDefault();
    const collection = newCollection.trim();
    if (!collection) return;
    if (collectionOptions.some((item) => item.toLocaleLowerCase("es-MX") === collection.toLocaleLowerCase("es-MX"))) {
      setNotice("Esa colección ya existe");
      return;
    }
    if (await persistCollections([...collections, collection].sort())) {
      setNewCollection("");
      setNotice("Colección agregada y visible en la tienda");
    }
  }

  async function removeCollection(collection) {
    if (products.some((product) => product.collection === collection)) {
      setNotice("Mueve o elimina los productos de esta colección antes de borrarla");
      return;
    }
    if (!window.confirm(`¿Eliminar la colección ${collection}?`)) return;
    if (await persistCollections(collections.filter((item) => item !== collection))) setNotice("Colección eliminada");
  }

  async function loadOrders() {
    setOrdersLoading(true);
    try {
      const response = await fetch("/api/admin/orders", { cache: "no-store" });
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (response.ok) setOrders(await response.json());
    } finally {
      setOrdersLoading(false);
    }
  }

  async function updateOrderStatus(id, status) {
    const response = await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) return;
    const updated = await response.json();
    setOrders((current) => current.map((order) => order.id === id ? updated : order));
    setNotice("Pedido actualizado");
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function removeOrder(order) {
    if (!window.confirm(`¿Eliminar permanentemente el pedido ${order.id}?`)) return;
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setAuthenticated(false);
      return;
    }
    if (!response.ok) {
      setNotice(data.message || "No se pudo eliminar el pedido");
      return;
    }
    setOrders((current) => current.filter((item) => item.id !== order.id));
    setNotice("Pedido eliminado");
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function saveProduct(form) {
    let saved;
    if (form.id) {
      saved = await persistProducts((current) => current.map((item) => item.id === form.id ? { ...form } : item));
      if (!saved) return false;
      setNotice("Producto actualizado");
    } else {
      saved = await persistProducts((current) => [{ ...form, id: Date.now() }, ...current]);
      if (!saved) return false;
      setNotice("Producto creado");
    }
    setEditorOpen(false);
    window.setTimeout(() => setNotice(""), 2400);
    return true;
  }

  function edit(product) {
    setEditorProduct(product);
    setEditorOpen(true);
  }

  function duplicate(product) {
    setEditorProduct({ ...product, id: undefined, name: `${product.name} - copia`, active: false });
    setEditorOpen(true);
  }

  function toggleActive(id) {
    persistProducts((current) => current.map((item) => item.id === id ? { ...item, active: item.active === false } : item));
  }

  function remove(id) {
    if (!window.confirm("Eliminar este producto permanentemente?")) return;
    persistProducts((current) => current.filter((item) => item.id !== id));
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    setAuthenticated(false);
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <a className="admin-sidebar-brand" href="#inicio"><img src="/img/logo-utoy-drop-small.jpg" alt="" /><span>UTOY <b>ADMIN</b></span></a>
        <nav>
          <button className={activeView === "overview" ? "active" : ""} type="button" onClick={() => setActiveView("overview")}><Icon name="grid" /> Resumen</button>
          <button className={activeView === "products" ? "active" : ""} type="button" onClick={() => setActiveView("products")}><Icon name="bag" /> Productos</button>
          <button className={activeView === "orders" ? "active" : ""} type="button" onClick={() => setActiveView("orders")}><Icon name="check" /> Pedidos</button>
          <a href="#inicio"><Icon name="eye" /> Ver tienda</a>
        </nav>
        <button type="button" onClick={logout}><Icon name="logout" /> Cerrar sesión</button>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-kicker">Control central</span><h1>{activeView === "overview" ? "Resumen operativo" : activeView === "products" ? "Catálogo" : "Pedidos"}</h1></div>
          <div className="admin-top-actions">
            <span className="admin-live-status"><i /> Pedidos en vivo</span>
            <button className="button button-ghost" type="button" onClick={loadOrders}>{ordersLoading ? "Actualizando..." : "Actualizar"}</button>
            <a className="button button-ghost" href="#inicio"><Icon name="eye" /> Ver tienda</a>
          </div>
        </header>
        <div className="admin-metrics">
          <article><span>Productos</span><strong>{products.length}</strong><small>{activeCount} visibles</small></article>
          <article><span>Inventario total</span><strong>{inventory}</strong><small>piezas disponibles</small></article>
          <article><span>Stock bajo</span><strong>{lowStock}</strong><small>productos con 5 o menos</small></article>
          <article><span>Valor catálogo</span><strong>{money(products.reduce((sum, item) => sum + item.price * (item.stock || 0), 0))}</strong><small>valor estimado</small></article>
          <article><span>Pedidos abiertos</span><strong>{openOrders}</strong><small>pendientes de cerrar</small></article>
          <article><span>Total pedidos</span><strong>{money(orderTotal)}</strong><small>registrado en panel</small></article>
        </div>
        {activeView === "overview" && (
          <section className="admin-overview-grid">
            <article className="admin-panel-block">
              <div className="admin-catalog-head">
                <div><h2>Acciones rápidas</h2><p>Lo más usado para operar el drop.</p></div>
              </div>
              <div className="admin-quick-actions">
                <button className="button" type="button" onClick={() => { setEditorProduct(undefined); setEditorOpen(true); }}><Icon name="plus" /> Nuevo producto</button>
                <button className="button button-ghost" type="button" onClick={() => setActiveView("orders")}><Icon name="check" /> Revisar pedidos</button>
                <button className="button button-ghost" type="button" onClick={() => setActiveView("products")}><Icon name="bag" /> Editar catálogo</button>
              </div>
            </article>
            <article className="admin-panel-block">
              <div className="admin-catalog-head">
                <div><h2>Stock bajo</h2><p>Productos que requieren atencion.</p></div>
              </div>
              <div className="admin-alert-list">
                {lowStockProducts.slice(0, 5).map((product) => (
                  <button key={product.id} type="button" onClick={() => { edit(product); setActiveView("products"); }}>
                    <SafeImage src={product.image} alt="" loading="eager" />
                    <span><strong>{product.name}</strong><small>{product.stock ?? 0} piezas</small></span>
                  </button>
                ))}
                {!lowStockProducts.length && <div className="admin-empty">Inventario saludable por ahora.</div>}
              </div>
            </article>
            <article className="admin-panel-block wide">
              <div className="admin-catalog-head">
                <div><h2>Pedidos recientes</h2><p>Últimas solicitudes recibidas desde la tienda.</p></div>
                <button className="button button-ghost" type="button" onClick={() => setActiveView("orders")}>Ver todos</button>
              </div>
              <div className="admin-order-cards">
                {recentOrders.map((order) => (
                  <button key={order.id} type="button" onClick={() => setActiveView("orders")}>
                    <span className={`order-pill ${order.status}`}>{order.status}</span>
                    <strong>{order.customer.name}</strong>
                    <small>{order.items.length} producto(s) / {money(order.total)}</small>
                  </button>
                ))}
                {!recentOrders.length && <div className="admin-empty">Todavia no hay pedidos registrados.</div>}
              </div>
            </article>
          </section>
        )}
        {activeView === "products" && <section className="admin-catalog">
          <div className="admin-catalog-head">
            <div><h2>Productos</h2><p>Administra la informacion que aparece en la tienda.</p></div>
            <button className="button" type="button" onClick={() => { setEditorProduct(undefined); setEditorOpen(true); }}><Icon name="plus" /> Nuevo producto</button>
          </div>
          <div className="admin-category-manager">
            <div><strong>Categorías de la tienda</strong><small>Se usan al registrar productos y en el filtro visible para clientes.</small></div>
            <form onSubmit={addCategory}><input maxLength="60" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Nueva categoría, ej. Accesorios" /><button type="submit" disabled={categorySaving || !newCategory.trim()}><Icon name="plus" /> Agregar</button></form>
            <div className="admin-category-list">{categories.map((category) => <span key={category}>{category}<button type="button" onClick={() => removeCategory(category)} aria-label={`Eliminar categoría ${category}`}><Icon name="close" size={13} /></button></span>)}</div>
          </div>
          <div className="admin-category-manager admin-collection-manager">
            <div><strong>Colecciones de la tienda</strong><small>Son las mismas colecciones que aparecen en el filtro del catálogo para clientes.</small></div>
            <form onSubmit={addCollection}><input maxLength="80" value={newCollection} onChange={(event) => setNewCollection(event.target.value)} placeholder="Nueva colección, ej. Drop verano" /><button type="submit" disabled={collectionSaving || !newCollection.trim()}><Icon name="plus" /> Agregar</button></form>
            <div className="admin-category-list">{collections.map((collection) => <span key={collection}>{collection}<button type="button" onClick={() => removeCollection(collection)} aria-label={`Eliminar colección ${collection}`}><Icon name="close" size={13} /></button></span>)}</div>
          </div>
          <div className="admin-product-tools">
            <label className="admin-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, categoría o colección..." /></label>
            <label className="admin-tool-select">Categoría<select value={productCategory} onChange={(event) => setProductCategory(event.target.value)}><option>Todas</option>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="admin-tool-select">Visibilidad<select value={productVisibility} onChange={(event) => setProductVisibility(event.target.value)}><option value="todos">Todos</option><option value="visibles">Visibles</option><option value="ocultos">Ocultos</option></select></label>
          </div>
          <div className="admin-results-line"><span>{filtered.length} producto(s)</span><span>Página {productPage} de {productPageCount}</span></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Producto</th><th>Precio</th><th>Stock</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>{visibleProducts.map((product) => (
                <tr key={product.id}>
                  <td><div className="admin-product"><SafeImage src={product.image} alt="" loading="eager" /><span><strong>{product.name}</strong><small>{product.collection} / {product.category}</small></span></div></td>
                  <td><strong>{money(product.price)}</strong></td>
                  <td><span className={product.stock <= 5 ? "stock-low" : ""}>{product.stock ?? 0} piezas</span></td>
                  <td><button className={`status-toggle ${product.active !== false ? "active" : ""}`} type="button" onClick={() => toggleActive(product.id)}>{product.active !== false ? "Visible" : "Oculto"}</button></td>
                  <td><div className="admin-actions"><button type="button" onClick={() => edit(product)} aria-label={`Editar ${product.name}`} title="Editar"><Icon name="edit" /></button><button type="button" onClick={() => duplicate(product)} aria-label={`Duplicar ${product.name}`} title="Duplicar"><Icon name="plus" /></button><button type="button" onClick={() => remove(product.id)} aria-label={`Eliminar ${product.name}`} title="Eliminar"><Icon name="trash" /></button></div></td>
                </tr>
              ))}{!visibleProducts.length && <tr><td colSpan="5"><div className="admin-empty">No hay productos con estos filtros.</div></td></tr>}</tbody>
            </table>
          </div>
          {productPageCount > 1 && <div className="admin-pagination"><button type="button" disabled={productPage === 1} onClick={() => setProductPage((page) => page - 1)}>Anterior</button><span>{productPage} / {productPageCount}</span><button type="button" disabled={productPage === productPageCount} onClick={() => setProductPage((page) => page + 1)}>Siguiente</button></div>}
        </section>}
        {activeView === "orders" && <section className="admin-catalog admin-orders">
          <div className="admin-catalog-head">
            <div><h2>Pedidos recientes</h2><p>Consulta solicitudes enviadas desde el carrito y actualiza su estado.</p></div>
            <label className="admin-order-filter">Estado
              <select value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)}>
                <option value="todos">Todos</option>
                <option value="nuevo">Nuevo</option>
                <option value="confirmado">Confirmado</option>
                <option value="pagado">Pagado</option>
                <option value="enviado">Enviado</option>
                <option value="cerrado">Cerrado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </label>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Pedido</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td><strong>{order.id}</strong><small className="order-date">{new Date(order.createdAt).toLocaleString("es-MX")}</small></td>
                    <td><div className="order-customer"><strong>{order.customer.name}</strong><small>IG: {order.customer.instagram || order.customer.phone} / {order.customer.city}</small><small>{order.customer.delivery} / {order.customer.payment}</small></div></td>
                    <td><div className="order-items">{order.items.map((item) => <span key={`${order.id}-${item.name}-${item.size}-${item.color}`}>{item.quantity}x {item.name} ({item.option1Label || "Talla"}: {item.size}, {item.option2Label || "Color"}: {item.color})</span>)}</div></td>
                    <td><strong>{money(order.total)}</strong></td>
                    <td>
                      <select className="order-status" value={order.status} onChange={(event) => updateOrderStatus(order.id, event.target.value)}>
                        <option value="nuevo">Nuevo</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="pagado">Pagado</option>
                        <option value="enviado">Enviado</option>
                        <option value="cerrado">Cerrado</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </td>
                    <td><div className="admin-actions"><button className="danger" type="button" onClick={() => removeOrder(order)} aria-label={`Eliminar pedido ${order.id}`} title="Eliminar pedido"><Icon name="trash" /></button></div></td>
                  </tr>
                ))}
                {!filteredOrders.length && (
                  <tr><td colSpan="6"><div className="admin-empty">{ordersLoading ? "Cargando pedidos..." : "No hay pedidos con este filtro."}</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>}
      </section>
      {editorOpen && <ProductEditor product={editorProduct} categoryOptions={categoryOptions} collectionOptions={collectionOptions} onSave={saveProduct} onClose={closeEditor} onUpload={uploadProductImage} />}
      {notice && <div className="toast"><Icon name="check" /> {notice}</div>}
    </main>
  );
}
