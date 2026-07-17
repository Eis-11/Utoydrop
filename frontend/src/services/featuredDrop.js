import { apiRequest } from "./api";

export const DEFAULT_FEATURED_DROP = Object.freeze({
  id: "fallback-current-drop",
  imageUrl: "/img/logo-utoy-drop-hero.jpg",
  imageAlt: "Logo UTOY DROP",
  topLabel: "NUEVO DROP",
  bottomLabel: "OVERSIZE / HEAVYWEIGHT",
  cardBrand: "UTOY DROP",
  cardFooterLeft: "STREETWEAR SELECTED",
  cardFooterRight: "DROP 01",
  verticalLabel: "LIMITED / 001",
  targetType: "none",
  targetId: null,
  target: null,
  status: "fallback",
});

const REQUIRED_FIELDS = [
  "imageUrl",
  "imageAlt",
  "topLabel",
  "bottomLabel",
  "cardBrand",
  "cardFooterLeft",
  "cardFooterRight",
  "verticalLabel",
];

export function normalizeFeaturedDropResponse(payload) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, "drop")) {
    throw new Error("La respuesta del drop destacado no es válida.");
  }
  if (payload.drop === null) return null;
  if (!REQUIRED_FIELDS.every((field) => typeof payload.drop[field] === "string" && payload.drop[field].trim())) {
    throw new Error("El drop destacado está incompleto.");
  }
  return payload.drop;
}

export async function getFeaturedDrop(options = {}) {
  return normalizeFeaturedDropResponse(await apiRequest("/api/featured-drop", {
    cache: options.cache || "no-store",
  }));
}

export async function loadFeaturedDrop(request = getFeaturedDrop) {
  try {
    return { drop: await request(), usedFallback: false };
  } catch {
    return { drop: DEFAULT_FEATURED_DROP, usedFallback: true };
  }
}
