const labels = { "Mas vendidos": "Más vendidos" };

export function CategoryFilters({ active, onChange, categories = [] }) {
  const quickFilters = ["Playeras", "Sudaderas", "Shorts", "Mas vendidos"];
  return (
    <div className="quick-filters" aria-label="Filtros rápidos">
      {quickFilters.map((filter) => (
        <button
          type="button"
          key={filter}
          className={active === filter ? "active" : ""}
          onClick={() => onChange(filter)}
        >
          {labels[filter] || filter}
        </button>
      ))}
    </div>
  );
}
