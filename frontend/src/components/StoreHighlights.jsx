import { Icon } from "./Icons";
import { SafeImage } from "./SafeImage";

const benefits = [
  ["01", "Selección cuidada", "Piezas elegidas por identidad, fit y actitud."],
  ["02", "Pedido directo", "Arma tu selección y confirma por Instagram."],
  ["03", "Drops limitados", "Colecciones que cambian, piezas que destacan."],
];

export function StoreHighlights({ products, onDetails }) {
  const featured = products.filter((product) => product.featured).slice(0, 2);

  return (
    <>
      <section className="store-benefits shell" aria-label="Beneficios de la tienda">
        {benefits.map(([number, title, text]) => (
          <article key={number}>
            <span>{number}</span>
            <div><strong>{title}</strong><p>{text}</p></div>
          </article>
        ))}
      </section>
      {featured.length > 0 && (
        <section className="spotlight shell">
          <div className="spotlight-heading">
            <span className="section-kicker">Selected by UTOY / 2026</span>
          <h2>ENCUENTRA TU<br /><em>PRÓXIMO FIT.</em></h2>
            <p>Una selección corta para quienes entienden que el outfit también es una declaración.</p>
            <a href="#catalogo">Explorar todo el catálogo <Icon name="arrow" /></a>
          </div>
          <div className="spotlight-products">
            {featured.map((product, index) => (
              <button type="button" className="spotlight-card" key={product.id} onClick={() => onDetails(product)}>
                <SafeImage src={product.image} alt={product.name} loading="eager" fetchPriority="low" />
                <span className="spotlight-number">0{index + 1}</span>
                <span className="spotlight-tag">{product.collection}</span>
                <div><strong>{product.name}</strong><small>${product.price.toLocaleString("es-MX")} MXN</small></div>
                <i><Icon name="arrow" /></i>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
