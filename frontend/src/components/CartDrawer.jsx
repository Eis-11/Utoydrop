import { useEffect, useMemo, useRef, useState } from "react";
import { businessConfig, instagramDirectUrl } from "../config/business";
import { createOrder } from "../services/api";
import {
  buildOrderSummary,
  closeReservedWindow,
  COPIED_ORDER_MESSAGE,
  copyOrderSummary,
  createCheckoutToken,
  openInstagram,
  reserveInstagramWindow,
  sendReservedWindowToInstagram,
} from "../services/orderHandoff";
import { Icon } from "./Icons";
import { SafeImage } from "./SafeImage";

function money(value) {
  return Number(value).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

const emptyCustomer = {
  name: "",
  instagram: "",
  city: "",
  delivery: "Envío",
  payment: "Transferencia",
  notes: "",
};

export function CartDrawer({ open, items, onClose, onQuantity, onRemove, onClear }) {
  const [customer, setCustomer] = useState(emptyCustomer);
  const [sending, setSending] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [preparedOrder, setPreparedOrder] = useState(null);
  const [copied, setCopied] = useState(false);
  const [clipboardFailed, setClipboardFailed] = useState(false);
  const [instagramBlocked, setInstagramBlocked] = useState(false);
  const closeButtonRef = useRef(null);
  const submitInFlightRef = useRef(false);
  const checkoutTokenRef = useRef(null);
  const totalPieces = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const orderMessage = useMemo(() => buildOrderSummary({
    order: preparedOrder,
    customer,
    items,
    instagramHandle: businessConfig.instagramHandle,
  }), [preparedOrder, customer, items]);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();
    function closeWithEscape(event) {
      if (event.key === "Escape") onClose();
    }
    document.body.classList.add("drawer-open");
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.body.classList.remove("drawer-open");
      window.removeEventListener("keydown", closeWithEscape);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  useEffect(() => {
    setPreparedOrder(null);
    setCopied(false);
    setClipboardFailed(false);
    setInstagramBlocked(false);
    checkoutTokenRef.current = null;
  }, [items]);

  function resetAttempt() {
    checkoutTokenRef.current = null;
    setCheckoutError("");
    setPreparedOrder(null);
    setCopied(false);
    setClipboardFailed(false);
    setInstagramBlocked(false);
  }

  function updateCustomer(field, value) {
    setCustomer((current) => ({ ...current, [field]: value }));
    resetAttempt();
  }

  async function submitCheckout(event) {
    event.preventDefault();
    if (!items.length || submitInFlightRef.current) return;
    if (!customer.name.trim() || !customer.instagram.trim() || !customer.city.trim()) {
      setCheckoutError("Completa nombre, usuario de Instagram y ciudad.");
      return;
    }

    submitInFlightRef.current = true;
    setSending(true);
    setCheckoutError("");
    const reservedInstagramWindow = reserveInstagramWindow();

    try {
      if (!checkoutTokenRef.current) checkoutTokenRef.current = createCheckoutToken();
      const order = await createOrder(customer, items, checkoutTokenRef.current);
      const message = buildOrderSummary({ order, customer, items, instagramHandle: businessConfig.instagramHandle });
      const wasCopied = await copyOrderSummary(message);
      const instagramOpened = sendReservedWindowToInstagram(reservedInstagramWindow, instagramDirectUrl());

      setPreparedOrder(order);
      setCopied(wasCopied);
      setClipboardFailed(!wasCopied);
      setInstagramBlocked(!instagramOpened);
      if (!wasCopied) {
        setCheckoutError("No pudimos copiar el pedido automáticamente. El resumen está abajo para copiarlo manualmente.");
      }
    } catch (error) {
      closeReservedWindow(reservedInstagramWindow);
      setCheckoutError(error.message);
    } finally {
      submitInFlightRef.current = false;
      setSending(false);
    }
  }

  async function copyAgain() {
    const wasCopied = await copyOrderSummary(orderMessage);
    setCopied(wasCopied);
    setClipboardFailed(!wasCopied);
    setCheckoutError(wasCopied ? "" : "No pudimos copiar el pedido. Selecciona el resumen y cópialo manualmente.");
  }

  function openInstagramAgain() {
    setInstagramBlocked(!openInstagram(instagramDirectUrl()));
  }

  function finishOrder() {
    onClear();
    setPreparedOrder(null);
    setCustomer(emptyCustomer);
    setCopied(false);
    setClipboardFailed(false);
    setInstagramBlocked(false);
    setCheckoutError("");
    checkoutTokenRef.current = null;
    onClose();
  }

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <span className="section-kicker">Pedido directo</span>
            <h2 id="cart-title">Tu pedido <b>{String(totalPieces).padStart(2, "0")}</b></h2>
          </div>
          <button ref={closeButtonRef} className="round-button" type="button" onClick={onClose} aria-label="Cerrar pedido"><Icon name="close" /></button>
        </div>

        {items.length ? (
          <>
            <div className="cart-items">
              {items.map((item) => (
                <article className="cart-item" key={item.cartId}>
                  <SafeImage src={item.image} alt="" loading="eager" />
                  <div className="cart-item-copy">
                    <span>{item.collection}</span><h3>{item.name}</h3><small>{item.option1Label || "Talla"}: {item.size} / {item.option2Label || "Color"}: {item.color}</small>
                    <strong>{money(item.price * item.quantity)}</strong>
                    <div className="quantity-control" aria-label={`Cantidad de ${item.name}`}>
                      <button type="button" onClick={() => onQuantity(item.cartId, -1)} aria-label="Reducir cantidad" disabled={Boolean(preparedOrder)}><Icon name="minus" size={14} /></button>
                      <b>{item.quantity}</b>
                      <button type="button" onClick={() => onQuantity(item.cartId, 1)} aria-label="Aumentar cantidad" disabled={Boolean(preparedOrder)}><Icon name="plus" size={14} /></button>
                    </div>
                  </div>
                  <button className="remove-item" type="button" onClick={() => onRemove(item.cartId)} disabled={Boolean(preparedOrder)} aria-label={`Eliminar ${item.name}`}><Icon name="trash" size={17} /></button>
                </article>
              ))}
            </div>
            <form className="drawer-summary checkout-form" onSubmit={submitCheckout}>
              <div className="summary-line"><span>Productos</span><strong>{totalPieces}</strong></div>
              <div className="summary-line drawer-total"><span>Total estimado</span><strong>{money(total)}</strong></div>

              {preparedOrder ? (
                <div className="checkout-handoff" role="status">
                  <span className="checkout-step">Pedido creado</span>
                  <h3>{preparedOrder.id}</h3>
                  {copied ? (
                    <p className="checkout-copy-success"><strong>{COPIED_ORDER_MESSAGE}</strong></p>
                  ) : (
                    <p>No se copió el pedido. Usa el resumen y el botón manual antes de enviarlo a <strong>{businessConfig.instagramHandle}</strong>.</p>
                  )}

                  {clipboardFailed && (
                    <label className="checkout-manual-copy">
                      <span>Resumen del pedido</span>
                      <textarea readOnly rows="10" value={orderMessage} onFocus={(event) => event.target.select()} />
                    </label>
                  )}

                  <button className="button checkout-button" type="button" onClick={copyAgain}>
                    <Icon name="copy" /> {copied ? "Copiar pedido otra vez" : "Copiar pedido"}
                  </button>

                  {instagramBlocked && (
                    <span className="checkout-error" role="alert">Instagram fue bloqueado por el navegador. Tu pedido sigue guardado.</span>
                  )}
                  <button className="button button-ghost checkout-finish" type="button" onClick={openInstagramAgain}>
                    <Icon name="instagram" /> {instagramBlocked ? "Abrir Instagram" : "Abrir Instagram otra vez"}
                  </button>

                  {checkoutError && <span className="checkout-error" role="alert">{checkoutError}</span>}
                  <small>La tienda no envía mensajes por ti ni usa credenciales de Instagram.</small>
                  <button className="button button-ghost checkout-finish" type="button" onClick={finishOrder}>Ya envié el mensaje</button>
                </div>
              ) : (
                <>
                  <div className="checkout-intro"><strong>Pedido directo a UTOY DROP</strong><p>Validaremos precios e inventario, copiaremos el resumen y te llevaremos directamente al chat oficial. En Instagram solo tendrás que pegarlo y pulsar Enviar.</p></div>
                  <div className="checkout-fields">
                    <label>Nombre<input required autoComplete="name" value={customer.name} onChange={(event) => updateCustomer("name", event.target.value)} placeholder="Tu nombre" /></label>
                    <label>Usuario de Instagram<input required autoComplete="off" value={customer.instagram} onChange={(event) => updateCustomer("instagram", event.target.value)} placeholder="@tu_usuario" /></label>
                    <label>Ciudad / estado<input required autoComplete="address-level2" value={customer.city} onChange={(event) => updateCustomer("city", event.target.value)} placeholder="Ciudad / estado" /></label>
                    <label>Entrega<select value={customer.delivery} onChange={(event) => updateCustomer("delivery", event.target.value)}><option>Envío</option><option>Entrega local</option><option>Por confirmar</option></select></label>
                    <label>Pago<select value={customer.payment} onChange={(event) => updateCustomer("payment", event.target.value)}><option>Transferencia</option><option>Depósito</option><option>Efectivo</option><option>Por confirmar</option></select></label>
                    <label className="wide">Notas<textarea rows="3" value={customer.notes} onChange={(event) => updateCustomer("notes", event.target.value)} placeholder="Referencias, horarios o dudas" /></label>
                  </div>
                  {checkoutError && <span className="checkout-error" role="alert">{checkoutError}</span>}
                  <button className="button checkout-button" type="submit" disabled={sending}><Icon name="instagram" /> {sending ? "Preparando chat..." : "Ir al chat y confirmar"} <Icon name="arrow" /></button>
                  <button className="clear-cart" type="button" onClick={onClear}>Vaciar pedido</button>
                </>
              )}
            </form>
          </>
        ) : (
          <div className="drawer-empty"><Icon name="bag" size={38} /><h3>Tu selección está vacía</h3><p>Agrega tus piezas favoritas y arma tu pedido.</p><button className="button button-ghost" type="button" onClick={onClose}>Explorar catálogo</button></div>
        )}
      </aside>
    </div>
  );
}
