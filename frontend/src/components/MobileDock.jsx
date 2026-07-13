import { Icon } from "./Icons";

export function MobileDock({ active, cartCount, onHome, onCatalog, onGuide, onCart }) {
  return (
    <nav className="mobile-dock" aria-label="Navegación móvil">
      <button className={active === "home" ? "active" : ""} type="button" onClick={onHome} aria-current={active === "home" ? "page" : undefined}><Icon name="home" size={20} /><span>Inicio</span></button>
      <button className={active === "catalog" ? "active" : ""} type="button" onClick={onCatalog} aria-current={active === "catalog" ? "page" : undefined}><Icon name="grid" size={20} /><span>Catálogo</span></button>
      <button className={active === "guide" ? "active" : ""} type="button" onClick={onGuide} aria-current={active === "guide" ? "page" : undefined}><Icon name="ruler" size={20} /><span>Guía de tallas</span></button>
      <button className={active === "cart" ? "active" : ""} type="button" onClick={onCart} aria-current={active === "cart" ? "page" : undefined}><span className="dock-icon"><Icon name="bag" size={20} />{cartCount > 0 && <b>{cartCount}</b>}</span><span>Pedido</span></button>
    </nav>
  );
}
