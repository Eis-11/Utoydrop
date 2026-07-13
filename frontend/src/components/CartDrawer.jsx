import { useEffect, useMemo, useRef, useState } from "react";
import { businessConfig, instagramDirectUrl } from "../config/business";
import { createOrder } from "../services/api";
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

function buildOrderMessage(order, customer, items) {
  const orderItems = order?.items || items;
  const orderCustomer = order?.customer || customer;
  const total = order?.total ?? orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return [
    `Hola ${businessConfig.instagramHandle}, quiero confirmar este pedido:`,
    order?.id ? `Folio: ${order.id}` : null,
    "",
    `Cliente: ${orderCustomer.name}`,
    `Instagram: ${orderCustomer.instagram}`,
    `Ciudad: ${orderCustomer.city}`,
    `Entrega: ${orderCustomer.delivery}`,
    `Pago: ${orderCustomer.payment}`,
    orderCustomer.notes ? `Notas: ${orderCustomer.notes}` : null,
    "",
    ...orderItems.map((item, index) => `${index + 1}. ${item.name} | ${item.option1Label || "Talla"}: ${item.size} | ${item.option2Label || "Color"}: ${item.color} | Cant. ${item.quantity} | ${money(item.price * item.quantity)}`),
    "",
    `Total estimado: ${money(total)}`,
    "",
    "¿Me ayudan a confirmar disponibilidad, total final y entrega?",
  ].filter((line) => line !== null).join("\n");
}

export function CartDrawer({ open, items, onClose, onQuantity, onRemove, onClear }) {
  const [customer, setCustomer] = useState(emptyCustomer);
  const [sending, setSending] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [preparedOrder, setPreparedOrder] = useState(null);
  const [copied, setCopied] = useState(false);
  const closeButtonRef = useRef(null);
  const totalPieces = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const orderMessage = useMemo(() => buildOrderMessage(preparedOrder, customer, items), [preparedOrder, customer, items]);

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
  }, [items]);

  function updateCustomer(field, value) {
    setCustomer((current) => ({ ...current, [field]: value }));
    setCheckoutError("");
    setPreparedOrder(null);
  }

  async function submitCheckout(event) {
    event.preventDefault();
    if (!items.length) return;
    if (!customer.name.trim() || !customer.instagram.trim() || !customer.city.trim()) {
      setCheckoutError("Completa nombre, usuario de Instagram y ciudad.");
      return;
    }
    setSending(true);
    setCheckoutError("");
    try {
      const order = await createOrder(customer, items);
      const message = buildOrderMessage(order, customer, items);
      setPreparedOrder(order);
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        window.location.assign(instagramDirectUrl());
      } catch {
        setCopied(false);
        setCheckoutError("El pedido está listo, pero el navegador no permitió copiarlo. Usa el botón para copiar y abrir el chat.");
      }
    } catch (error) {
      setCheckoutError(error.message);
    } finally {
      setSending(false);
    }
  }

  async function handoffToInstagram() {
    try {
      await navigator.clipboard.writeText(orderMessage);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open(instagramDirectUrl(), "_blank", "noopener,noreferrer");
  }

  function finishOrder() {
    onClear();
    setPreparedOrder(null);
    setCustomer(emptyCustomer);
    setCopied(false);
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
                  <span className="checkout-step">Pedido preparado</span>
                  <h3>{preparedOrder.id}</h3>
                  <p>Guardamos la solicitud. Copia el resumen y abre el chat directo de <strong>{businessConfig.instagramHandle}</strong> para confirmar.</p>
                  <button className="button checkout-button" type="button" onClick={handoffToInstagram}>
                    <Icon name="instagram" /> Copiar y abrir {businessConfig.instagramHandle} <Icon name="arrow" />
                  </button>
                  {checkoutError && <span className="checkout-error" role="alert">{checkoutError}</span>}
                  <small>{copied ? "Resumen copiado. Pégalo en el chat y pulsa Enviar." : "Instagram no permite que una tienda web envíe el DM por ti."}</small>
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
