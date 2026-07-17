# UTOY DROP

Tienda y panel administrativo de UTOY DROP preparados para ejecutarse como una sola aplicación en Cloudflare Workers con Static Assets, D1 y R2.

## Arquitectura

- **Frontend:** React 18 + Vite, publicado desde `frontend/dist` mediante Workers Static Assets.
- **API:** Hono dentro de Cloudflare Workers; conserva las rutas `/api/*`.
- **Datos:** D1 para catálogo, variantes, pedidos, sesiones y rate limiting.
- **Imágenes:** R2 mediante el binding `PRODUCT_IMAGES`, servidas por `/uploads/*`.
- **Secretos:** `ADMIN_PASSWORD` se configura con `wrangler secret`; nunca se guarda en Git.
- **Runtime de herramientas:** Node.js 22 y `pnpm@11.7.0`.

El carrito y los favoritos permanecen en `localStorage` del navegador para conservar la experiencia del cliente. No son datos autoritativos: precios, stock, pedidos, sesiones y catálogo existen únicamente en D1/R2.

## Estructura

```text
backend/
  migrations/             migraciones versionadas y datos iniciales D1
  src/
    worker.js              rutas del Worker
    catalog.js             lectura y escritura del catálogo D1
    orders.js              pedidos, estados e inventario atómico
    images.js              validación y almacenamiento R2
    security.js            sesiones, cookies, CSP, origen y rate limiting
    validation.js          validación de entradas
  tests/                   pruebas en Workers Runtime
frontend/
  public/_headers          CSP y cabeceras para Static Assets
  src/                     tienda y panel administrativo React
scripts/
  wrangler-smoke.mjs       prueba HTTP con Wrangler local
wrangler.jsonc             bindings y entornos de Cloudflare
```

## Preparación local

Requisitos:

- Node.js 22.
- Corepack habilitado o pnpm 11.7.0.

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
```

Para probar login localmente, crea un archivo **no versionado** `.dev.vars.preview`:

```text
ADMIN_PASSWORD=<DEFINE_UN_VALOR_LOCAL_NO_REUTILIZADO>
```

Nunca copies una contraseña real en `wrangler.jsonc`, archivos `.env`, documentación, commits o Pull Requests.

## Comandos

| Comando | Función |
| --- | --- |
| `pnpm dev` | Compila y abre Worker + Assets + D1 + R2 locales con Wrangler. |
| `pnpm dev:frontend` | Ejecuta solamente Vite para trabajo visual. |
| `pnpm run build` | Genera `frontend/dist`. |
| `pnpm run check` | Compila, revisa sintaxis y ejecuta un bundle Wrangler `--dry-run`. |
| `pnpm test` | Compila y ejecuta pruebas en Workers Runtime. |
| `pnpm test:wrangler` | Aplica migraciones locales y prueba API, assets y fallback SPA con `wrangler dev`. |
| `pnpm db:migrate:local` | Aplica migraciones a D1 local. |
| `pnpm db:migrate:preview` | Aplica migraciones a D1 preview. |
| `pnpm db:migrate:production` | Aplica migraciones a D1 producción. |
| `pnpm deploy:preview` | Compila y despliega preview. Requiere autorización. |
| `pnpm deploy:production` | Compila y despliega producción. Requiere autorización explícita. |

## Catálogo y caché

`GET /api/catalog` entrega productos, categorías y colecciones en una sola solicitud, con `ETag` y:

```text
Cache-Control: public, max-age=30, stale-while-revalidate=60
```

El frontend ya no consulta tres endpoints cada 30 segundos. Carga el catálogo unificado al iniciar y vuelve a validarlo cuando la pestaña recupera visibilidad. Las rutas administrativas, pedidos y sesiones usan siempre `private, no-store`.

Los endpoints públicos anteriores (`/api/products`, `/api/categories` y `/api/collections`) se conservan por compatibilidad.

## Política de pedidos e inventario

La reserva sucede al crear el pedido:

1. El servidor reconstruye precios y variantes desde D1.
2. Todos los artículos se reservan en un único `D1Database.batch()` transaccional.
3. Cada variante se descuenta mediante SQL y un trigger impide stock negativo.
4. Si una sola variante es insuficiente, D1 revierte pedido, artículos, movimientos y descuentos completos.
5. `inventory_movements`, `inventory_state`, `inventory_reserved_at` e `inventory_restored_at` permiten auditar cada reserva o devolución.

El navegador genera una clave criptográfica por intento de compra. D1 guarda únicamente su hash SHA-256 bajo un índice único. Un doble clic o un reintento tras perder la respuesta devuelve el pedido ya creado (`replayed: true`) sin insertar otro pedido ni descontar inventario por segunda vez.

Durante el clic original, la tienda inicia `navigator.clipboard.write()` con un `ClipboardItem` cuyo `Blob` queda pendiente. Solo después de que D1 crea el pedido se resuelve ese contenido con el folio real, variantes, cantidades, total y entrega. Instagram se abre únicamente cuando el navegador confirma la copia. Si `ClipboardItem` no está disponible o la escritura falla, el pedido permanece guardado y aparece `COPIAR Y ABRIR INSTAGRAM`, además del resumen en texto como último respaldo. Instagram nunca recibe credenciales ni texto mediante parámetros.

Cada cambio de stock incrementa `catalog_state.revision`. El panel envía la revisión que leyó; si un pedido reservó inventario mientras el administrador editaba, D1 rechaza el guardado obsoleto y el panel recarga el catálogo. Así una edición administrativa nunca puede volver a introducir stock ya reservado.

Reglas de restauración:

- Cancelar restaura una sola vez y convierte el pedido en terminal.
- Archivar un pedido `nuevo` restaura una sola vez.
- Archivar pedidos `confirmado`, `pagado`, `enviado`, `cerrado` o `cancelado` nunca restaura stock.
- Ningún pedido se elimina físicamente; todos usan `archived_at`.
- No existe vencimiento automático. El administrador cancela pedidos abandonados manualmente.

### Máquina de estados

```text
nuevo ───────────────┐
confirmado ──────────┤
pagado ──────────────┼──> cancelado (terminal)
enviado ─────────────┤
cerrado ─────────────┘

nuevo <──> confirmado <──> pagado <──> enviado <──> cerrado
```

Los estados operativos pueden corregirse entre sí para conservar el comportamiento actual del panel. Una vez cancelado, el backend rechaza cualquier reactivación. Si el cliente retoma la compra, debe crear un pedido nuevo y validar otra vez el stock.

## Seguridad

- Solo hashes SHA-256 de tokens de sesión se guardan en D1.
- Cookie administrativa `HttpOnly`, `Secure`, `SameSite=Strict` y limitada a `/api/admin`.
- Sesiones con expiración por inactividad persistida.
- Rate limiting persistente por cliente y ámbito en D1.
- Validación de origen para escrituras.
- CSP, HSTS, protección contra iframes y MIME sniffing.
- Imágenes limitadas a 2 MB, con verificación binaria real de JPG, PNG y WebP.
- Nombres R2 aleatorios y `Content-Type` seguro al servir.
- Pedidos archivados e imágenes históricas se conservan para auditoría.

## Configuración manual de Cloudflare

Estos pasos **no están automatizados** para evitar crear recursos o desplegar sin autorización.

### 1. Autenticar Wrangler

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

### 2. Crear las bases D1 separadas

```bash
pnpm exec wrangler d1 create utoy-drop-preview
pnpm exec wrangler d1 create utoy-drop-production
```

Copia cada `database_id` devuelto en el entorno correspondiente de `wrangler.jsonc`. Sustituye únicamente los UUID de marcador:

- Preview: `00000000-0000-0000-0000-000000000000`
- Producción: `11111111-1111-1111-1111-111111111111`

### 3. Crear buckets R2 Standard separados

```bash
pnpm exec wrangler r2 bucket create utoy-drop-product-images-preview
pnpm exec wrangler r2 bucket create utoy-drop-product-images-production
```

No selecciones Infrequent Access: su uso no entra en la capa gratuita de R2 y tiene duración mínima.

### 4. Configurar secretos por entorno

```bash
pnpm exec wrangler secret put ADMIN_PASSWORD --env preview
pnpm exec wrangler secret put ADMIN_PASSWORD --env production
```

Usa contraseñas diferentes. Wrangler solicitará el valor sin guardarlo en archivos.

### 5. Configurar dominios permitidos

El origen exacto de preview ya está registrado como `https://utoy-drop-preview.utoydrop.workers.dev`. Antes de producción, reemplaza `https://REPLACE_WITH_PRODUCTION_DOMAIN` por el origen HTTPS exacto de producción.

### Política pendiente para imágenes R2 huérfanas

La limpieza automática de imágenes R2 huérfanas queda pendiente. Hasta definirla y probarla, la limpieza debe ser manual y conservadora: nunca se elimina una imagen referenciada por un producto, un pedido activo o un pedido archivado. Una futura tarea deberá calcular referencias, generar un reporte en modo simulación, conservar un periodo de gracia y dejar un registro auditable antes de eliminar objetos.

### 6. Aplicar migraciones

```bash
pnpm db:migrate:preview
pnpm db:migrate:production
```

Aplica primero preview, valida la tienda y respalda producción antes de cada migración futura.

### 7. Desplegar solamente con autorización

```bash
pnpm deploy:preview
# Después de validar y recibir autorización explícita:
pnpm deploy:production
```

Luego configura el dominio personalizado desde **Workers & Pages > Worker > Settings > Domains & Routes**.

## Plan gratuito y alertas

Para aproximadamente 200 clientes al mes, esta arquitectura debe quedar muy por debajo de las cuotas gratuitas si las imágenes se optimizan y no se crean integraciones externas. Los límites oficiales pueden cambiar; compruébalos antes del despliegue:

- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/): 100,000 solicitudes dinámicas al día y 10 ms de CPU por invocación en Free; Static Assets se sirven gratis.
- [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/): 5 millones de filas leídas/día, 100,000 filas escritas/día y 5 GB totales en Free.
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/): 10 GB-mes, 1 millón de operaciones Class A y 10 millones Class B al mes para almacenamiento Standard; egreso gratuito.

En Free, superar límites diarios de Workers/D1 normalmente produce errores hasta el reinicio de cuota; no se debe asumir que el servicio escalará automáticamente.

Configura alertas en **Manage Account > Billing > Billable Usage > Budget alerts**. Crea al menos una advertencia de gasto total y revisa las notificaciones de Workers/R2 disponibles. Consulta [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/). Mantén el plan Workers Free y no habilites Workers Paid, R2 Infrequent Access ni productos facturables sin autorización.

## Recuperación y rollback

Antes de una migración remota:

```bash
pnpm exec wrangler d1 export DB --remote --env production --output utoy-drop-backup.sql
```

No subas el respaldo a Git: contiene pedidos y datos de clientes.

Si una versión del Worker falla:

1. Detén nuevos cambios administrativos.
2. Usa el historial de versiones de Workers o `wrangler rollback --env production` para regresar al Worker anterior.
3. Si hubo cambios incompatibles de esquema, restaura el respaldo D1 en una base nueva y actualiza el binding; no edites pedidos manualmente.
4. R2 permanece separado del código y no debe borrarse durante el rollback.
5. Corrige en una rama nueva, valida preview y publica mediante otro Pull Request.

El backend Node/Express anterior no debe reactivarse después de que D1 reciba pedidos, porque produciría dos fuentes de verdad y riesgo de sobreventa.
