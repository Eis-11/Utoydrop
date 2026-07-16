import { useEffect, useState } from "react";
import { getVariantStock } from "../utils/inventory";
import { Icon } from "./Icons";
import { SafeImage } from "./SafeImage";

export function ProductModal({ product, onClose, onAdd, isFavorite, onFavorite }) {
  const [size, setSize] = useState(product.sizes[0]);
  const [color, setColor] = useState(product.colors[0]);
  const [quantity, setQuantity] = useState(1);
  const available = getVariantStock(product, size, color);
  const showColorDot = /color/i.test(product.option2Label || "Color");

  useEffect(() => {
    function closeWithEscape(event) {
      if (event.key === "Escape") onClose();
    }
    document.body.classList.add("modal-open");
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [onClose]);

  if (!product) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="product-modal" role="dialog" aria-modal="true" aria-label={`Detalles de ${product.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar detalles">
          <Icon name="close" />
        </button>
        <button className={`modal-favorite ${isFavorite ? "active" : ""}`} type="button" onClick={onFavorite} aria-label="Guardar en favoritos">
          <Icon name="heart" />
        </button>
        <div className="modal-image">
          <SafeImage src={product.image} alt={product.name} loading="eager" fetchPriority="high" />
          <span>{product.collection} / {product.category}</span>
        </div>
        <div className="modal-content">
          {product.badge && <span className="modal-badge">{product.badge}</span>}
          <p className="section-kicker">Pieza seleccionada</p>
          <h2>{product.name}</h2>
          <strong className="modal-price">${product.price.toLocaleString("es-MX")} <small>MXN</small></strong>
          <p className="modal-description">{product.description}</p>
          <div className="option-group">
            <span>Elige {String(product.option1Label || "talla").toLowerCase()}</span>
            <div className="option-list">
              {product.sizes.map((item) => <button type="button" className={size === item ? "active" : ""} key={item} onClick={() => { setSize(item); setQuantity(1); }}>{item}</button>)}
            </div>
          </div>
          <div className="option-group">
            <span>Elige {String(product.option2Label || "color").toLowerCase()}</span>
            <div className="color-list">
              {product.colors.map((item) => <button type="button" className={color === item ? "active" : ""} key={item} onClick={() => { setColor(item); setQuantity(1); }}>{showColorDot && <i />}{item}</button>)}
            </div>
          </div>
          <p className={`variant-availability ${available <= 3 ? "low" : ""}`}>{available > 0 ? `${available} unidades disponibles en esta variante` : "Variante agotada"}</p>
          <div className="modal-buy-row">
            <div className="quantity-control modal-quantity">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Reducir cantidad"><Icon name="minus" size={15} /></button>
              <b>{quantity}</b>
              <button type="button" onClick={() => setQuantity((value) => Math.min(available || 1, value + 1))} aria-label="Aumentar cantidad" disabled={available <= quantity}><Icon name="plus" size={15} /></button>
            </div>
            <button className="button modal-action" type="button" onClick={() => onAdd(product, { size, color, quantity, stock: available })} disabled={!available}>
              <Icon name="bag" /> {available ? "Agregar al pedido" : "Agotado"} <Icon name="arrow" />
            </button>
          </div>
          <p className="modal-note">Tu selección se guarda; podrás enviar el pedido completo por Instagram.</p>
        </div>
      </section>
    </div>
  );
}
