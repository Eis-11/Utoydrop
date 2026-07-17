import { useEffect, useMemo, useState } from "react";
import { DEFAULT_FEATURED_DROP } from "../services/featuredDrop";
import { FeaturedDropVisual } from "./FeaturedDropVisual";
import { Icon } from "./Icons";

function editableDrop(drop = DEFAULT_FEATURED_DROP) {
  return {
    imageUrl: drop.imageUrl || DEFAULT_FEATURED_DROP.imageUrl,
    imageAlt: drop.imageAlt || DEFAULT_FEATURED_DROP.imageAlt,
    topLabel: drop.topLabel || DEFAULT_FEATURED_DROP.topLabel,
    bottomLabel: drop.bottomLabel || DEFAULT_FEATURED_DROP.bottomLabel,
    cardBrand: drop.cardBrand || DEFAULT_FEATURED_DROP.cardBrand,
    cardFooterLeft: drop.cardFooterLeft || DEFAULT_FEATURED_DROP.cardFooterLeft,
    cardFooterRight: drop.cardFooterRight || DEFAULT_FEATURED_DROP.cardFooterRight,
    verticalLabel: drop.verticalLabel || DEFAULT_FEATURED_DROP.verticalLabel,
    targetType: drop.targetType || "none",
    targetId: drop.targetId || "",
  };
}

function comparable(form) {
  return JSON.stringify({
    ...form,
    targetId: form.targetType === "none" ? "" : form.targetId,
  });
}

function statusLabel(status) {
  return {
    published: "Publicado",
    draft: "Borrador",
    hidden: "Oculto",
    archived: "Histórico",
  }[status] || status;
}

export function FeaturedDropAdmin({
  products,
  collections,
  onUpload,
  onUnauthorized,
  onPublishedChange,
}) {
  const [drops, setDrops] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(editableDrop());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const activeDrop = drops.find((drop) => drop.status === "published") || null;
  const activeProducts = useMemo(
    () => products.filter((product) => product.active !== false),
    [products],
  );
  const dirty = selected ? comparable(form) !== comparable(editableDrop(selected)) : true;

  function update(field, value) {
    setError("");
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "targetType" ? { targetId: "" } : {}),
    }));
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      onUnauthorized?.();
      throw new Error("La sesión administrativa terminó.");
    }
    if (!response.ok) {
      const requestError = new Error(data.message || "No se pudo completar la acción.");
      requestError.code = data.code;
      throw requestError;
    }
    return data;
  }

  async function loadDrops() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/admin/featured-drops");
      setDrops(data.drops || []);
      const next = data.drops?.find((drop) => drop.status === "published") || data.drops?.[0] || null;
      setSelected(next);
      setForm(editableDrop(next || DEFAULT_FEATURED_DROP));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDrops();
  }, []);

  function selectDrop(drop) {
    if (dirty && selected && !window.confirm("Hay cambios sin guardar. ¿Deseas descartarlos?")) return;
    setSelected(drop);
    setForm(editableDrop(drop));
    setError("");
    setNotice("");
  }

  function newDrop() {
    if (dirty && selected && !window.confirm("Hay cambios sin guardar. ¿Deseas descartarlos?")) return;
    setSelected(null);
    setForm(editableDrop());
    setError("");
    setNotice("Nuevo borrador listo para editar");
  }

  async function saveDraft({ quiet = false } = {}) {
    setSaving(true);
    setError("");
    try {
      const canUpdate = selected?.status === "draft";
      const data = await request(
        canUpdate ? `/api/admin/featured-drops/${encodeURIComponent(selected.id)}` : "/api/admin/featured-drops",
        {
          method: canUpdate ? "PUT" : "POST",
          body: JSON.stringify({
            ...form,
            targetId: form.targetType === "none" ? null : form.targetId,
          }),
        },
      );
      setDrops(data.drops || []);
      setSelected(data.drop);
      setForm(editableDrop(data.drop));
      if (!quiet) setNotice("Borrador guardado sin cambiar la portada");
      return data.drop;
    } catch (saveError) {
      setError(saveError.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setError("");
    setNotice("");
    let candidate = selected;
    if (!candidate || dirty) candidate = await saveDraft({ quiet: true });
    if (!candidate) return;

    const replacing = activeDrop && activeDrop.id !== candidate.id;
    if (replacing && !window.confirm(`¿Reemplazar el drop activo “${activeDrop.topLabel}”? El anterior se conservará en el historial.`)) return;

    setSaving(true);
    try {
      const data = await request(`/api/admin/featured-drops/${encodeURIComponent(candidate.id)}/publish`, {
        method: "POST",
        body: JSON.stringify({ confirmReplace: Boolean(replacing) }),
      });
      setDrops(data.drops || []);
      setSelected(data.drop);
      setForm(editableDrop(data.drop));
      onPublishedChange?.(data.published || data.drop);
      setNotice("Drop publicado en la portada");
    } catch (publishError) {
      if (publishError.code === "featured_drop_replace_confirmation_required"
        && window.confirm("El drop activo cambió. ¿Deseas reemplazarlo de todos modos?")) {
        try {
          const data = await request(`/api/admin/featured-drops/${encodeURIComponent(candidate.id)}/publish`, {
            method: "POST",
            body: JSON.stringify({ confirmReplace: true }),
          });
          setDrops(data.drops || []);
          setSelected(data.drop);
          setForm(editableDrop(data.drop));
          onPublishedChange?.(data.published || data.drop);
          setNotice("Drop publicado en la portada");
          return;
        } catch (retryError) {
          setError(retryError.message);
          return;
        }
      }
      setError(publishError.message);
    } finally {
      setSaving(false);
    }
  }

  async function hideActive() {
    if (!activeDrop) {
      setError("No hay un drop publicado para ocultar.");
      return;
    }
    if (!window.confirm("¿Ocultar el drop destacado de la portada? Se conservará en el historial.")) return;
    setSaving(true);
    setError("");
    try {
      const data = await request(`/api/admin/featured-drops/${encodeURIComponent(activeDrop.id)}/hide`, {
        method: "POST",
        body: "{}",
      });
      setDrops(data.drops || []);
      setSelected(data.drop);
      setForm(editableDrop(data.drop));
      onPublishedChange?.(null);
      setNotice("Drop ocultado de la portada");
    } catch (hideError) {
      setError(hideError.message);
    } finally {
      setSaving(false);
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const imageUrl = await onUpload(file);
      update("imageUrl", imageUrl);
      setNotice("Imagen subida. Guarda el borrador para conservarla en el historial.");
    } catch (uploadError) {
      setError(uploadError.message || "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteCurrentImage() {
    if (!form.imageUrl.startsWith("/uploads/")) return;
    if (!window.confirm("¿Eliminar esta imagen de R2? Solo se permitirá si no tiene referencias.")) return;
    setSaving(true);
    setError("");
    try {
      const key = form.imageUrl.split("/").pop();
      await request(`/api/admin/images/${encodeURIComponent(key)}`, { method: "DELETE" });
      update("imageUrl", DEFAULT_FEATURED_DROP.imageUrl);
      setNotice("Imagen sin referencias eliminada de R2");
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  }

  function cancelChanges() {
    setForm(editableDrop(selected || DEFAULT_FEATURED_DROP));
    setError("");
    setNotice("Cambios descartados");
  }

  const previewDrop = {
    ...form,
    target: form.targetType === "none" || !form.targetId
      ? null
      : { type: form.targetType, id: form.targetId },
  };

  return (
    <section className="admin-catalog featured-drop-admin">
      <div className="admin-catalog-head">
        <div>
          <h2>Drop destacado</h2>
          <p>Edita la tarjeta principal, revisa la vista previa y publícala sin desplegar código.</p>
        </div>
        <button className="button button-ghost" type="button" onClick={newDrop}>
          <Icon name="plus" /> Nuevo drop
        </button>
      </div>

      {loading ? <div className="admin-empty">Cargando historial de portada...</div> : (
        <div className="featured-drop-admin-grid">
          <div className="featured-drop-editor">
            <div className="admin-section-title">
              <span>01</span>
              <div><h3>Contenido de la tarjeta</h3><p>Los textos se publican como HTML seguro, nunca dentro de la imagen.</p></div>
            </div>
            <div className="admin-subgrid">
              <label className="admin-field wide">Imagen principal
                <span className="featured-drop-upload-row">
                  <span>{uploading ? "Optimizando y subiendo..." : form.imageUrl}</span>
                  <label className="button button-ghost">
                    <Icon name="upload" /> Elegir imagen
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={uploading || saving} />
                  </label>
                  {form.imageUrl.startsWith("/uploads/") && (
                    <button type="button" className="admin-image-delete" onClick={deleteCurrentImage} disabled={saving}>
                      Eliminar de R2
                    </button>
                  )}
                </span>
              </label>
              <label className="admin-field wide">Texto alternativo accesible
                <input required maxLength="160" value={form.imageAlt} onChange={(event) => update("imageAlt", event.target.value)} />
              </label>
              <label className="admin-field">Texto superior
                <input required maxLength="40" value={form.topLabel} onChange={(event) => update("topLabel", event.target.value)} />
              </label>
              <label className="admin-field">Etiqueta inferior
                <input required maxLength="80" value={form.bottomLabel} onChange={(event) => update("bottomLabel", event.target.value)} />
              </label>
              <label className="admin-field">Texto interior superior
                <input required maxLength="40" value={form.cardBrand} onChange={(event) => update("cardBrand", event.target.value)} />
              </label>
              <label className="admin-field">Texto interior inferior izquierdo
                <input required maxLength="60" value={form.cardFooterLeft} onChange={(event) => update("cardFooterLeft", event.target.value)} />
              </label>
              <label className="admin-field">Texto interior inferior derecho
                <input required maxLength="40" value={form.cardFooterRight} onChange={(event) => update("cardFooterRight", event.target.value)} />
              </label>
              <label className="admin-field">Texto vertical
                <input required maxLength="40" value={form.verticalLabel} onChange={(event) => update("verticalLabel", event.target.value)} />
              </label>
            </div>

            <div className="admin-section-title featured-drop-target-title">
              <span>02</span>
              <div><h3>Destino</h3><p>La tarjeta puede abrir un producto, una colección o quedar solo como elemento visual.</p></div>
            </div>
            <div className="admin-subgrid">
              <label className="admin-field">Tipo de destino
                <select value={form.targetType} onChange={(event) => update("targetType", event.target.value)}>
                  <option value="none">Sin enlace</option>
                  <option value="product">Producto</option>
                  <option value="collection">Colección</option>
                </select>
              </label>
              {form.targetType === "product" && (
                <label className="admin-field">Producto
                  <select required value={form.targetId} onChange={(event) => update("targetId", event.target.value)}>
                    <option value="">Selecciona un producto</option>
                    {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                </label>
              )}
              {form.targetType === "collection" && (
                <label className="admin-field">Colección
                  <select required value={form.targetId} onChange={(event) => update("targetId", event.target.value)}>
                    <option value="">Selecciona una colección</option>
                    {collections.map((collection) => <option key={collection} value={collection}>{collection}</option>)}
                  </select>
                </label>
              )}
            </div>

            {(error || notice) && (
              <div className={error ? "admin-form-error" : "featured-drop-notice"} role={error ? "alert" : "status"}>
                {error || notice}
              </div>
            )}
            <div className="featured-drop-actions">
              <button className="button button-ghost" type="button" onClick={() => saveDraft()} disabled={saving || uploading}>
                Guardar borrador
              </button>
              <button className="button" type="button" onClick={publish} disabled={saving || uploading}>
                Publicar en portada <Icon name="check" />
              </button>
              <button className="button button-ghost featured-drop-hide" type="button" onClick={hideActive} disabled={saving || !activeDrop}>
                Ocultar de portada
              </button>
              <button className="button button-ghost" type="button" onClick={cancelChanges} disabled={saving}>
                Cancelar cambios
              </button>
            </div>
          </div>

          <aside className="featured-drop-preview-panel">
            <span className="admin-kicker">Vista previa</span>
            <h3>Mismo diseño de la portada</h3>
            <div className="featured-drop-admin-preview">
              <FeaturedDropVisual drop={previewDrop} preview />
            </div>
            <small>Los textos largos se limitan y ajustan para conservar la composición.</small>
          </aside>
        </div>
      )}

      <div className="featured-drop-history">
        <div className="admin-catalog-head">
          <div><h2>Historial</h2><p>Selecciona un drop anterior para revisarlo o volverlo a publicar.</p></div>
          <span className={`featured-drop-active-state ${activeDrop ? "active" : ""}`}>
            {activeDrop ? `En portada: ${activeDrop.topLabel}` : "Portada sin drop destacado"}
          </span>
        </div>
        <div className="featured-drop-history-list">
          {drops.map((drop) => (
            <button
              key={drop.id}
              className={selected?.id === drop.id ? "selected" : ""}
              type="button"
              onClick={() => selectDrop(drop)}
            >
              <img src={drop.imageUrl} alt="" />
              <span><strong>{drop.topLabel}</strong><small>{drop.bottomLabel}</small></span>
              <em className={`featured-drop-status ${drop.status}`}>{statusLabel(drop.status)}</em>
            </button>
          ))}
          {!drops.length && <div className="admin-empty">Todavía no hay drops guardados.</div>}
        </div>
      </div>
    </section>
  );
}
