import { useEffect, useRef } from "react";
import { instagramDirectUrl } from "../config/business";
import { Icon } from "./Icons";
import { SafeImage } from "./SafeImage";

export function Hero({ productCount = 0 }) {
  const visualRef = useRef(null);

  useEffect(() => {
    const visual = visualRef.current;
    if (!visual) return undefined;

    const orbitOne = visual.querySelector(".orbit-one");
    const orbitTwo = visual.querySelector(".orbit-two");
    const mobileQuery = window.matchMedia("(max-width: 560px)");
    let visible = false;
    let animationFrame = 0;
    let previousTime = 0;
    let angleOne = 0;
    let angleTwo = 0;

    function drawFrame(time) {
      if (!previousTime) previousTime = time;
      const elapsed = Math.min(time - previousTime, 50);
      previousTime = time;
      angleOne += elapsed * (360 / 11000);
      angleTwo -= elapsed * (360 / 15000);
      orbitOne.style.transform = `translate3d(0, 0, 0) rotate(${angleOne}deg)`;
      orbitTwo.style.transform = `translate3d(0, 0, 0) rotate(${angleTwo}deg)`;
      visual.dataset.orbitAngle = angleOne.toFixed(2);
      visual.dataset.orbitAngleSecondary = angleTwo.toFixed(2);
      animationFrame = window.requestAnimationFrame(drawFrame);
    }

    function stopOrbit() {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      previousTime = 0;
      visual.dataset.orbitState = "paused";
      if (!mobileQuery.matches) {
        orbitOne.style.transform = "";
        orbitTwo.style.transform = "";
      }
    }

    function syncOrbit() {
      const shouldRun = mobileQuery.matches && visible && !document.hidden;
      if (!shouldRun) {
        stopOrbit();
        return;
      }
      if (animationFrame) return;
      previousTime = 0;
      animationFrame = window.requestAnimationFrame(drawFrame);
      visual.dataset.orbitState = "running";
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncOrbit();
    }, { threshold: 0.05 });

    observer.observe(visual);
    mobileQuery.addEventListener("change", syncOrbit);
    document.addEventListener("visibilitychange", syncOrbit);

    return () => {
      stopOrbit();
      observer.disconnect();
      mobileQuery.removeEventListener("change", syncOrbit);
      document.removeEventListener("visibilitychange", syncOrbit);
    };
  }, []);

  return (
    <section className="hero" id="inicio">
      <div className="hero-noise" />
      <div className="shell hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span /> {productCount > 0 ? "Drop activo" : "Próximo drop"} <b>{productCount > 0 ? "Stock limitado" : "En preparación"}</b></div>
          <h1>EN GUSTOS<br /><em>SE ROMPEN<br />GÉNEROS.</em></h1>
          <p>
            Moda, accesorios y productos seleccionados para tu estilo, con pedido directo por Instagram.
          </p>
          <div className="hero-actions">
            <a className="button" href="#catalogo">Ver piezas <Icon name="arrow" /></a>
            <a
              className="button button-ghost"
              href={instagramDirectUrl()}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="instagram" /> Pedir por Instagram
            </a>
          </div>
          <div className="hero-metrics">
            <div><strong>{String(productCount).padStart(2, "0")}</strong><span>Productos activos</span></div>
            <div><strong>MX</strong><span>Atención directa</span></div>
            <div><strong>Drop</strong><span>Sin vueltas</span></div>
          </div>
        </div>

        <div ref={visualRef} className="hero-visual" aria-label="Identidad visual UTOY DROP">
          <span className="hero-edition">LIMITED / 001</span>
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-logo-card">
            <div className="card-topline"><span>UTOY DROP</span><span>MX / 2026</span></div>
            <SafeImage src="/img/logo-utoy-drop-hero.jpg" alt="Logo UTOY DROP" loading="eager" fetchPriority="high" />
            <div className="card-bottomline"><span>Streetwear selected</span><b>Drop 01</b></div>
          </div>
          <div className="floating-label label-top"><Icon name="spark" size={16} /> Nuevo drop</div>
          <div className="floating-label label-bottom">Oversize / Heavyweight</div>
        </div>
      </div>
      <a className="hero-scroll" href="#catalogo"><span>Descubre el drop</span><i /></a>
      <div className="ticker" aria-hidden="true">
        <div>
          <span>UTOY DROP</span><b>*</b><span>MODA Y ACCESORIOS</span><b>*</b>
          <span>PERFUMES Y COMPLEMENTOS</span><b>*</b><span>PRODUCTOS SELECCIONADOS</span><b>*</b>
          <span>UTOY DROP</span><b>*</b><span>MODA Y ACCESORIOS</span><b>*</b>
          <span>PERFUMES Y COMPLEMENTOS</span><b>*</b><span>PRODUCTOS SELECCIONADOS</span><b>*</b>
        </div>
      </div>
    </section>
  );
}
