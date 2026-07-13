import { Icon } from "./Icons";
import { SafeImage } from "./SafeImage";

export function About() {
  return (
    <section className="about section shell" id="marca">
      <div className="about-art">
        <div className="about-mark">UTOY</div>
        <SafeImage src="/img/logo-utoy-drop-hero.jpg" alt="Identidad UTOY DROP" loading="lazy" />
        <span>EST. 2026 / MX</span>
      </div>
      <div className="about-copy">
        <p className="section-kicker">Sobre la marca</p>
        <h2>TU ESTILO<br /><span>HABLA PRIMERO.</span></h2>
        <p>
          UTOY DROP reúne moda, accesorios y productos con identidad para acompañar tu estilo todos los días.
        </p>
        <div className="about-values">
          <div><Icon name="spark" /><span><strong>Selección cuidada</strong>Productos elegidos por calidad, estilo y actitud.</span></div>
          <div><Icon name="spark" /><span><strong>Compra directa</strong>Arma tu pedido y confírmalo por Instagram.</span></div>
          <div><Icon name="spark" /><span><strong>Drops vivos</strong>El catálogo cambia según la disponibilidad real.</span></div>
        </div>
      </div>
    </section>
  );
}
