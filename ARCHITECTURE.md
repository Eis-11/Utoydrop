# Arquitectura Cloudflare de UTOY DROP

## Flujo de solicitudes

```text
Navegador
  ├─ archivos HTML/CSS/JS ──> Workers Static Assets (frontend/dist)
  ├─ /api/* ────────────────> Hono Worker ──> D1
  └─ /uploads/* ────────────> Hono Worker ──> R2 PRODUCT_IMAGES
```

Static Assets usa `single-page-application`, por lo que una navegación directa o recarga en una ruta interna devuelve `index.html`. Las reglas `_headers` aplican CSP y cabeceras defensivas sin invocar el Worker para cada asset.

## Límites de responsabilidad

- React conserva presentación, navegación, carrito, favoritos y panel.
- El Worker valida origen, sesión, entradas, imágenes y reglas de negocio.
- D1 es la única fuente de verdad para precios, inventario, pedidos, sesiones y límites.
- R2 es la única fuente de imágenes administrables.
- El navegador nunca decide el precio final ni confirma stock.

## Esquema D1

| Tabla | Responsabilidad |
| --- | --- |
| `products` | Producto, precio, visibilidad, colección, categoría e imagen. Usa soft delete. |
| `product_options` | Valores ordenados de las dos opciones configurables. |
| `product_variants` | Stock compartido o por combinación; triggers impiden negativos. |
| `categories` / `collections` | Filtros administrables y datos iniciales. |
| `orders` | Cliente, total, estado, reserva, restauración y archivo. |
| `order_items` | Snapshot inmutable del producto solicitado. |
| `inventory_movements` | Libro auditable de reservas y restauraciones. |
| `order_events` | Historial de creación, estado, cancelación y archivo. |
| `admin_sessions` | Hash del token, actividad y expiración. |
| `rate_limits` | Contadores persistentes por ámbito y cliente. |
| `catalog_state` | Revisión optimista que evita sobrescribir reservas con una edición obsoleta. |

Los índices priorizan catálogo visible, variantes por producto, pedidos activos/estado, sesiones vencidas y ventanas de rate limiting.

## Atomicidad e inventario

D1 ejecuta `D1Database.batch()` como transacción: una sentencia fallida revierte la secuencia completa.

### Reserva

1. Se leen productos/variantes vigentes y se valida la solicitud.
2. La transacción inserta pedido y artículos, descuenta cada variante, registra movimientos negativos y crea el evento.
3. El trigger `product_variants_nonnegative_update` aborta si cualquier descuento produciría stock negativo.
4. El trigger `inactive_variants_cannot_be_reserved` impide reservar una variante retirada mientras se procesaba la solicitud.
5. Un aborto revierte incluso descuentos ejecutados antes del fallo: nunca hay reserva parcial.
6. La reserva incrementa la revisión del catálogo dentro de la misma transacción.

Cada intento iniciado por el frontend incluye un token aleatorio. El Worker almacena solo `SHA-256(token)` en `orders.checkout_token_hash`, protegido por un índice único. Las solicitudes repetidas recuperan el mismo pedido; si dos solicitudes idénticas compiten, la restricción única revierte el segundo batch completo antes de responder con el registro ganador. Así se cubren doble clic, timeout y reintento sin doble reserva.

Las escrituras administrativas incluyen la revisión que el panel leyó. Un trigger aborta el batch con `catalog_revision_conflict` cuando la revisión cambió; el panel recarga D1 y solicita revisar el cambio antes de guardar otra vez.

### Restauración

- Cancelar ejecuta aumentos condicionados a `inventory_state = 'reserved'`, movimientos únicos y cambio terminal dentro del mismo batch.
- Archivar un pedido `nuevo` usa el mismo patrón con `restore_archive`.
- Restricciones únicas `(order_id, variant_id, kind)` y condiciones SQL evitan dobles devoluciones.
- Archivar cualquier otro estado solo escribe `archived_at`.
- El trigger `orders_are_never_physically_deleted` conserva el historial.

## Máquina de estados

Estados operativos: `nuevo`, `confirmado`, `pagado`, `enviado`, `cerrado`.

- Se permiten correcciones entre estados operativos para conservar el comportamiento del panel.
- Cualquier estado operativo puede pasar a `cancelado` y restaurar una vez.
- `cancelado` es terminal; el trigger `cancelled_order_is_terminal` y el Worker rechazan reactivaciones.
- Un cliente que retoma la compra genera un pedido nuevo y una nueva validación transaccional.

## Sesiones y seguridad

El token aleatorio solo existe en la cookie. D1 almacena SHA-256, expiración y última actividad. La cookie usa `HttpOnly`, `Secure`, `SameSite=Strict` y path `/api/admin`.

Las escrituras validan origen. Los contadores de login, pedidos, catálogo e imágenes viven en D1, por lo que sobreviven reinicios y ejecuciones distribuidas. Ninguna ruta administrativa, sesión o pedido permite caché pública.

## Caché

- `/api/catalog`: ETag, 30 segundos públicos y 60 segundos `stale-while-revalidate`.
- `/uploads/*`: un año e immutable; los nombres son aleatorios y el contenido no cambia.
- `/api/admin/*` y `/api/orders`: `private, no-store`.
- Assets con hash Vite: un año e immutable.
- `index.html`: revalidación obligatoria.

## Entornos

Preview y producción tienen nombres de Worker, bases D1, buckets R2, orígenes permitidos y secretos independientes. El UUID de preview ya corresponde a `utoy-drop-preview`; el UUID de producción continúa como marcador y debe reemplazarse manualmente cuando se autorice crear ese entorno. Las pruebas y CI no crean ni despliegan recursos.

## Conservación de imágenes R2

La política de limpieza de objetos huérfanos está pendiente. No existe borrado automático: las imágenes referenciadas por productos, pedidos activos o pedidos archivados se conservan. Antes de implementar una limpieza se requiere un cálculo completo de referencias, ejecución simulada, periodo de gracia y auditoría de cada eliminación.

## Capacidad gratuita

Con unos 200 clientes mensuales, la carga esperada es pequeña frente a Workers Free, D1 Free y R2 Free. El diseño reduce lecturas mediante catálogo unificado, ETag e índices. Las imágenes se optimizan en el navegador antes de R2. Los límites y alertas operativas están documentados en README y deben revisarse antes de producción.
