import { getTotalStock } from "../utils/inventory";
import { Icon } from "./Icons";
import { SafeImage } from "./SafeImage";

export function ProductCard({ product, onDetails, isFavorite, onFavorite }) {
  const stock = getTotalStock(product);
  return (
    <article className="product-card">
      <div className="product-image-wrap">
        {product.badge && <span className={`badge badge-${product.badge.toLowerCase().replace(" ", "-")}`}>{product.badge === "Mas vendido" ? "Más vendido" : product.badge}</span>}
        <button type="button" className={`favorite-button ${isFavorite ? "active" : ""}`} onClick={onFavorite} aria-label={isFavorite ? `Quitar ${product.name} de favoritos` : `Guardar ${product.name} en favoritos`}>
          <Icon name="heart" size={17} />
        </button>
        <SafeImage src={product.image} alt={product.name} loading="lazy" fetchPriority="low" />
        <button type="button" className="image-detail" onClick={() => onDetails(product)}>
          <Icon name="eye" size={18} /> Vista rápida
        </button>
      </div>
      <div className="product-info">
        <div className="product-meta"><span>{product.collection}</span><span>{product.category}</span></div>
        <h3>{product.name}</h3>
        <div className="product-stock"><i className={stock <= 5 ? "low" : ""} /><span>{stock <= 0 ? "Agotado" : stock <= 5 ? `Últimas ${stock} unidades` : "Disponible ahora"}</span></div>
        <div className="product-bottom">
          <div>
            <span className="price-label">Precio</span>
            <strong>${product.price.toLocaleString("es-MX")} <small>MXN</small></strong>
          </div>
          <div className="sizes" aria-label={`${product.option1Label || "Tallas"} ${product.sizes.join(", ")}`}>
            {product.sizes.slice(0, 4).map((size) => <span key={size}>{size}</span>)}
          </div>
        </div>
        <div className="product-actions">
          <button className="button button-ghost" type="button" onClick={() => onDetails(product)}>
            Ver detalles
          </button>
          <button className="icon-button" type="button" onClick={() => onDetails(product)} aria-label={`Agregar ${product.name} al pedido`}><Icon name="bag" /></button>
        </div>
      </div>
    </article>
  );
}
