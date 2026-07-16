import { businessConfig, instagramDirectUrl } from "../config/business";
import { Icon } from "./Icons";

export function Contact() {
  return (
    <section className="contact section shell" id="contacto">
      <div className="contact-panel">
        <div>
          <p className="section-kicker">¿Tienes una pieza en mente?</p>
          <h2>CIERRA TU<br /><span>PEDIDO.</span></h2>
          <p>Mándanos tu selección, ciudad y talla. Confirmamos disponibilidad, total y forma de entrega.</p>
          <a className="button" href={instagramDirectUrl()} target="_blank" rel="noreferrer">
            <Icon name="instagram" /> Confirmar por Instagram <Icon name="arrow" />
          </a>
          <div className="contact-promise"><span>Respuesta directa</span><span>Variantes verificadas</span><span>Pedido claro</span></div>
        </div>
        <div className="contact-links">
          <a href={instagramDirectUrl()} target="_blank" rel="noreferrer">
            <Icon name="instagram" /><span><small>Instagram Direct</small>Confirmar pedido</span><Icon name="chevron" />
          </a>
          <a href={businessConfig.instagram} target="_blank" rel="noreferrer">
            <Icon name="instagram" /><span><small>Instagram</small>{businessConfig.instagramHandle}</span><Icon name="chevron" />
          </a>
          <a href={businessConfig.tiktok} target="_blank" rel="noreferrer">
            <Icon name="tiktok" /><span><small>TikTok</small>{businessConfig.tiktokHandle}</span><Icon name="chevron" />
          </a>
          <a href={`mailto:${businessConfig.email}`}>
            <Icon name="mail" /><span><small>Correo</small>{businessConfig.email}</span><Icon name="chevron" />
          </a>
          <div>
            <Icon name="pin" /><span><small>Ubicación</small>{businessConfig.location}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
