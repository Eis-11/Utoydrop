import { useState } from "react";

const sizeGuides = [
  {
    id: "normal",
    title: "Corte normal",
    description: "Playera de corte normal. Medidas de pecho y largo total.",
    columns: ["Talla", "Pecho", "Largo total"],
    rows: [
      ["S / CH", "48.2 cm", "72 cm"],
      ["M", "50.8 cm", "73 cm"],
      ["L / G", "55.8 cm", "75.8 cm"],
      ["XL / EG", "60.9 cm", "78.1 cm"],
      ["2XL / EEG", "66 cm", "80.9 cm"],
    ],
    note: "Pecho medido de lado a lado sobre la prenda extendida.",
  },
  {
    id: "semioversize",
    title: "Semioversize",
    description: "Playera semioversize. A = ancho, B = largo, C = hombro y D = manga.",
    columns: ["Talla", "A · Ancho", "B · Largo", "C · Hombro", "D · Manga"],
    rows: [
      ["S", "57 cm", "67.5 cm", "19 cm", "18 cm"],
      ["M", "59 cm", "70 cm", "20 cm", "20 cm"],
      ["L", "61 cm", "73 cm", "21 cm", "22 cm"],
      ["XL", "63 cm", "75.5 cm", "22 cm", "24 cm"],
      ["2XL", "67 cm", "79 cm", "23 cm", "26 cm"],
    ],
    note: "Las letras corresponden a los puntos de medición mostrados en la referencia de la prenda.",
  },
  {
    id: "oversize",
    title: "Oversize",
    description: "Playera de corte oversize con medidas amplias de cuerpo y hombro.",
    columns: ["Talla", "Ancho", "Hombro", "Alto"],
    rows: [
      ["M", "63.5 cm", "66 cm", "71 cm"],
      ["L", "68.5 cm", "71 cm", "76.2 cm"],
      ["XL", "73.6 cm", "76.2 cm", "81.3 cm"],
    ],
    note: "Esta referencia sólo incluye las tallas M, L y XL.",
  },
  {
    id: "sudadera",
    title: "Sudadera normal",
    description: "Sudadera de corte normal. Medidas de ancho y largo.",
    columns: ["Talla", "Ancho", "Largo"],
    rows: [
      ["S / CH", "50.8 cm", "68.6 cm"],
      ["M", "55.9 cm", "71.1 cm"],
      ["L / G", "61 cm", "73.7 cm"],
      ["XL / EG", "66 cm", "76.2 cm"],
      ["2XL / EEG", "71.1 cm", "78.7 cm"],
    ],
    note: "Medidas tomadas sobre la sudadera extendida.",
  },
];

const policies = [
  ["Envíos", "Te damos costo y tiempo estimado según tu ciudad antes de confirmar."],
  ["Cambios", "Si la talla no queda, revisamos el cambio siempre y cuando la prenda este sin uso."],
  ["Pagos", "Confirmamos disponibilidad antes de pedir transferencia, depósito o efectivo."],
];

export function TrustGuide() {
  const [activeGuideId, setActiveGuideId] = useState(sizeGuides[0].id);
  const activeGuide = sizeGuides.find((guide) => guide.id === activeGuideId) || sizeGuides[0];

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
              <p>Consulta el tipo de corte de cada prenda. Si dudas entre dos tallas, te ayudamos por Instagram.</p>
            </div>
          </div>
          <div className="size-guide-tabs" role="tablist" aria-label="Tipo de prenda">
            {sizeGuides.map((guide) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeGuide.id === guide.id}
                className={activeGuide.id === guide.id ? "active" : ""}
                key={guide.id}
                onClick={() => setActiveGuideId(guide.id)}
              >
                {guide.title}
              </button>
            ))}
          </div>
          <div className="size-guide-table-head">
            <span>Tabla activa</span>
            <h3>{activeGuide.title}</h3>
            <p>{activeGuide.description}</p>
          </div>
          <div className="size-guide-table-scroll">
            <table>
              <thead>
                <tr>{activeGuide.columns.map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {activeGuide.rows.map((row) => (
                  <tr key={`${activeGuide.id}-${row[0]}`}>{row.map((value, index) => <td key={`${row[0]}-${activeGuide.columns[index]}`}>{value}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="size-guide-note"><strong>Nota:</strong> {activeGuide.note} Las medidas son de referencia y pueden variar ligeramente.</p>
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
