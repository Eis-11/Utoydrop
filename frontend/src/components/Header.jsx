import { useState } from "react";
import { businessConfig } from "../config/business";
import { Icon } from "./Icons";

const links = [
  ["Inicio", "#inicio"],
  ["Catálogo", "#catalogo"],
  ["Guía", "#guia"],
  ["Contacto", "#contacto"],
];

export function Header({ onNavigate, onFavoritesOpen, cartCount, favoriteCount, onCartOpen }) {
  const [open, setOpen] = useState(false);

  function navigate(event, label, href) {
    event.preventDefault();
    onNavigate(label, href);
    setOpen(false);
  }

  return (
    <header className="site-header">
      <div className="header-inner shell">
        <a className="brand" href="#inicio" aria-label={`${businessConfig.brandName}, inicio`}>
          <span className="brand-mark"><img src="/img/logo-utoy-drop-small.jpg" alt="" width="160" height="160" /></span>
          <span className="brand-copy">UTOY <strong>DROP</strong><small>Streetwear / MX</small></span>
        </a>

        <nav className={`main-nav ${open ? "is-open" : ""}`} aria-label="Navegación principal">
          {links.map(([label, href]) => (
            <a key={label} href={href} onClick={(event) => navigate(event, label, href)}>
              {label}
            </a>
          ))}
          <button className="header-status" type="button" onClick={() => { onFavoritesOpen(); setOpen(false); }} title="Ver favoritos guardados" aria-label="Ver favoritos guardados">
            <Icon name="heart" size={17} /><span>{favoriteCount}</span>
          </button>
          <button className="button button-small nav-cta" type="button" onClick={() => { onCartOpen(); setOpen(false); }}>
            <Icon name="bag" size={18} /> Mi pedido <b>{cartCount}</b>
          </button>
        </nav>

        <button
          className="menu-button"
          type="button"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? "close" : "menu"} size={24} />
        </button>
      </div>
    </header>
  );
}
