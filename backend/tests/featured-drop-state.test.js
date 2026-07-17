import { describe, expect, test, vi } from "vitest";
import {
  DEFAULT_FEATURED_DROP,
  loadFeaturedDrop,
  normalizeFeaturedDropResponse,
} from "../../frontend/src/services/featuredDrop.js";

function publishedDrop() {
  return {
    id: "drop-test",
    imageUrl: "/uploads/drop.webp",
    imageAlt: "Drop de prueba",
    topLabel: "NUEVO DROP",
    bottomLabel: "OVERSIZE",
    cardBrand: "UTOY DROP",
    cardFooterLeft: "STREETWEAR SELECTED",
    cardFooterRight: "DROP 02",
    verticalLabel: "LIMITED / 002",
    targetType: "none",
    targetId: null,
    target: null,
    status: "published",
  };
}

describe("estado público del drop destacado", () => {
  test("acepta un drop publicado y conserva el ocultamiento explícito", () => {
    expect(normalizeFeaturedDropResponse({ drop: publishedDrop() })).toMatchObject({ id: "drop-test" });
    expect(normalizeFeaturedDropResponse({ drop: null })).toBeNull();
  });

  test("usa la portada actual como fallback cuando D1 o la API fallan", async () => {
    const request = vi.fn().mockRejectedValue(new Error("D1 no disponible"));
    const result = await loadFeaturedDrop(request);
    expect(result.usedFallback).toBe(true);
    expect(result.drop).toEqual(DEFAULT_FEATURED_DROP);
  });

  test("no convierte un ocultamiento correcto en fallback", async () => {
    const result = await loadFeaturedDrop(vi.fn().mockResolvedValue(null));
    expect(result).toEqual({ drop: null, usedFallback: false });
  });

  test("rechaza respuestas incompletas para no romper la tarjeta", () => {
    expect(() => normalizeFeaturedDropResponse({ drop: { topLabel: "INCOMPLETO" } })).toThrow(
      "El drop destacado está incompleto.",
    );
  });
});
