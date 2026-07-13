import { businessConfig } from "../config/business";
import { Icon } from "./Icons";

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <a className="footer-brand" href="#inicio">
          <img src="/img/logo-utoy-drop-small.jpg" alt="UTOY DROP" width="160" height="160" />
          <span>STREETWEAR READY TO WEAR</span>
        </a>
        <div className="footer-links">
          <strong>Explorar</strong>
          <a href="#inicio">Inicio</a>
          <a href="#catalogo">Catálogo</a>
          <a href="#guia">Guía y políticas</a>
          <a href="#marca">La marca</a>
          <a href="#contacto">Contacto</a>
        </div>
        <div className="footer-social">
          <strong>Síguenos</strong>
          <a href={businessConfig.instagram} target="_blank" rel="noreferrer"><Icon name="instagram" /> Instagram</a>
          <a href={`mailto:${businessConfig.email}`}><Icon name="mail" /> Correo</a>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 UTOY DROP. Todos los derechos reservados.</span>
        <span>Hecho para la calle / México</span>
      </div>
      <div className="footer-statement" aria-hidden="true">UTOY DROP</div>
    </footer>
  );
}
