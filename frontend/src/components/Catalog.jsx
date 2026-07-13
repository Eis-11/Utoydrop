import { useEffect, useMemo, useState } from "react";
import { CategoryFilters } from "./CategoryFilters";
import { CustomSelect } from "./CustomSelect";
import { Icon } from "./Icons";
import { ProductCard } from "./ProductCard";

const sortOptions = [
  { value: "featured", label: "Destacados" },
  { value: "low", label: "Precio bajo" },
  { value: "high", label: "Precio alto" },
];
const PAGE_SIZE = 12;

export function Catalog({ quickFilter, onQuickFilter, onDetails, favorites, onFavorite, onlyFavorites, onOnlyFavoritesChange, products, categories = [], collections = [] }) {
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState("Colecciones");
  const [category, setCategory] = useState("Todos");
  const [sort, setSort] = useState("featured");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const availableCollections = useMemo(() => [...new Set([...collections, ...products.map((product) => product.collection).filter(Boolean)])].sort(), [collections, products]);
  const availableCategories = useMemo(() => [...new Set([...categories, ...products.map((product) => product.category).filter(Boolean)])].sort(), [categories, products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products
      .filter((product) => {
        const matchesText = !term || `${product.name} ${product.collection} ${product.category}`.toLowerCase().includes(term);
        const matchesCollection = collection === "Colecciones" || product.collection === collection;
        const matchesCategory = category === "Todos" || product.category === category;
        const matchesQuick =
          quickFilter === "Todo" ||
          product.category === quickFilter ||
          (quickFilter === "Nuevos drops" && product.badge === "Nuevo") ||
          (quickFilter === "Mas vendidos" && product.badge === "Mas vendido");
        const matchesFavorite = !onlyFavorites || favorites.includes(product.id);
        return matchesText && matchesCollection && matchesCategory && matchesQuick && matchesFavorite;
      })
      .sort((a, b) => {
        if (sort === "low") return a.price - b.price;
        if (sort === "high") return b.price - a.price;
        return Number(b.featured) - Number(a.featured);
      });
  }, [category, collection, favorites, onlyFavorites, products, quickFilter, search, sort]);
  const visibleProducts = filteredProducts.slice(0, visibleLimit);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [category, collection, favorites, onlyFavorites, products, quickFilter, search, sort]);

  return (
    <section className="catalog section shell" id="catalogo">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Explora el drop / {String(products.length).padStart(2, "0")} piezas listas</p>
          <h2>ELIGE TU<br /><span>PRÓXIMA PIEZA.</span></h2>
        </div>
        <p>Busca por estilo, guarda tus favoritas y arma un pedido claro antes de escribirnos.</p>
      </div>

      <CategoryFilters active={quickFilter} onChange={onQuickFilter} categories={availableCategories} />

      <div className="catalog-tools">
        <label className="search-box">
          <Icon name="search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar prenda o colección..." aria-label="Buscar en el catálogo" />
        </label>
        <CustomSelect
          icon="grid"
          label="Filtrar por tipo de producto"
          value={category}
          options={["Todos", ...availableCategories]}
          onChange={(value) => { setCategory(value); if (value !== "Todos") onQuickFilter("Todo"); }}
          className="category-select"
        />
        <CustomSelect
          icon="filter"
          label="Filtrar por colección"
          value={collection}
          options={["Colecciones", ...availableCollections]}
          onChange={setCollection}
        />
        <button type="button" className={`favorite-filter ${onlyFavorites ? "active" : ""}`} onClick={() => onOnlyFavoritesChange((value) => !value)}>
          <Icon name="heart" size={17} /> Favoritos <b>{favorites.length}</b>
        </button>
        <CustomSelect
          label="Ordenar productos"
          value={sort}
          options={sortOptions}
          onChange={setSort}
          className="sort-select"
        />
      </div>

      <div className="catalog-result-line">
        <span>{String(filteredProducts.length).padStart(2, "0")} productos encontrados</span>
        <i />
      </div>

      {filteredProducts.length > 0 ? (
        <>
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onDetails={onDetails}
                isFavorite={favorites.includes(product.id)}
                onFavorite={() => onFavorite(product.id)}
              />
            ))}
          </div>
          {visibleProducts.length < filteredProducts.length && (
            <div className="catalog-load-more">
              <span>Mostrando {visibleProducts.length} de {filteredProducts.length}</span>
              <button className="button button-ghost" type="button" onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}>Mostrar más productos <Icon name="plus" /></button>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <Icon name="search" size={34} />
          <h3>{products.length === 0 ? "Próximamente nuevas piezas" : "Ese drop todavía no aparece"}</h3>
          <p>{products.length === 0 ? "Estamos preparando el próximo drop. Vuelve pronto para descubrirlo." : "Prueba con otra búsqueda, categoría o colección."}</p>
          {products.length > 0 && (
            <button type="button" className="button button-ghost" onClick={() => { setSearch(""); setCategory("Todos"); setCollection("Colecciones"); onOnlyFavoritesChange(false); onQuickFilter("Todo"); }}>
              Limpiar filtros
            </button>
          )}
        </div>
      )}
    </section>
  );
}
