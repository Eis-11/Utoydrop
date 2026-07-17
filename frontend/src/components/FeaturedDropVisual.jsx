import { Icon } from "./Icons";
import { SafeImage } from "./SafeImage";

export function FeaturedDropVisual({
  drop,
  visualRef,
  onActivate,
  preview = false,
}) {
  if (!drop) return null;
  const target = drop.target || (
    drop.targetType && drop.targetType !== "none" && drop.targetId
      ? { type: drop.targetType, id: drop.targetId }
      : null
  );
  const interactive = Boolean(target && onActivate && !preview);
  const className = [
    "hero-visual",
    interactive ? "hero-drop-link" : "hero-drop-static",
    preview ? "hero-drop-preview" : "",
  ].filter(Boolean).join(" ");
  const content = (
    <>
      <span className="hero-edition">{drop.verticalLabel}</span>
      <div className="hero-orbit orbit-one" />
      <div className="hero-orbit orbit-two" />
      <div className="hero-logo-card">
        <div className="card-topline"><span>{drop.cardBrand}</span><span>MX / 2026</span></div>
        <SafeImage src={drop.imageUrl} alt={drop.imageAlt} loading="eager" fetchPriority="high" />
        <div className="card-bottomline"><span>{drop.cardFooterLeft}</span><b>{drop.cardFooterRight}</b></div>
      </div>
      <div className="floating-label label-top"><Icon name="spark" size={16} /> {drop.topLabel}</div>
      <div className="floating-label label-bottom">{drop.bottomLabel}</div>
    </>
  );

  if (interactive) {
    return (
      <button
        ref={visualRef}
        className={className}
        type="button"
        onClick={() => onActivate(target)}
        aria-label={`Abrir ${target.type === "product" ? "producto" : "colección"} ${target.id}`}
      >
        {content}
      </button>
    );
  }
  return <div ref={visualRef} className={className} aria-label={drop.imageAlt}>{content}</div>;
}
