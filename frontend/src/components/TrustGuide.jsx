const sizeGuide = [
  ["S", "48 cm", "68 cm", "Fit relajado"],
  ["M", "52 cm", "71 cm", "Oversize ligero"],
  ["L", "56 cm", "74 cm", "Oversize"],
  ["XL", "60 cm", "77 cm", "Oversize amplio"],
];

const policies = [
  ["Envíos", "Te damos costo y tiempo estimado según tu ciudad antes de confirmar."],
  ["Cambios", "Si la talla no queda, revisamos el cambio siempre y cuando la prenda este sin uso."],
  ["Pagos", "Confirmamos disponibilidad antes de pedir transferencia, depósito o efectivo."],
];

export function TrustGuide() {
  return (
    <section className="trust-guide section shell" id="guia">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Antes de pedir</p>
          <h2>ELIGE BIEN<br /><span>DESDE EL INICIO.</span></h2>
        </div>
        <p>Medidas, políticas y detalles clave para que tu mensaje llegue completo y podamos responder más rápido.</p>
      </div>

      <div className="trust-layout">
        <div className="size-guide">
          <div className="trust-block-head">
            <span>01</span>
            <div>
              <strong>Guía de tallas</strong>
              <p>Medidas aproximadas para playeras oversize. Si dudas entre dos tallas, te ayudamos por Instagram.</p>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Talla</th><th>Pecho</th><th>Largo</th><th>Caída</th></tr>
            </thead>
            <tbody>
              {sizeGuide.map(([size, chest, length, fit]) => (
                <tr key={size}><td>{size}</td><td>{chest}</td><td>{length}</td><td>{fit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="policy-list">
          {policies.map(([title, text], index) => (
            <article key={title}>
              <span>{String(index + 2).padStart(2, "0")}</span>
              <div><strong>{title}</strong><p>{text}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
