# Arquitectura y ruta de escalamiento

## Capas actuales

```text
frontend/src/
  components/       interfaz y flujos de tienda/administración
  config/           identidad y canales oficiales del negocio
  data/             catálogo inicial para recuperación
  hooks/            estado persistente del navegador
  services/         cliente HTTP centralizado
  utils/            reglas reutilizables de inventario

backend/
  src/config.js     configuración de entorno
  src/app.js        rutas HTTP y composición de la aplicación
  src/middleware/   seguridad, origen y límites de solicitudes
  src/repositories/ persistencia intercambiable
  src/services/     reglas de negocio y validación de pedidos
  tests/            pruebas unitarias y de integración
```

El frontend nunca decide el precio final. El servidor reconstruye cada línea desde el catálogo, valida talla/color/cantidad y calcula el total. La persistencia JSON usa escrituras atómicas y serializadas para evitar archivos parciales durante solicitudes simultáneas.

## Capacidades actuales

1. Base escalable: configuración, middleware, repositorios, servicios y cliente HTTP separados.
2. Experiencia: checkout de dos pasos, mensajes de error útiles, folio, semántica accesible, carga diferida y metadatos sociales.
   El alta administrativa incluye plantillas de producto, categorías libres, variantes con etiquetas configurables, inventario por combinación, duplicación, búsqueda, filtros y paginación.
3. Instagram: los botones de pedido apuntan al chat directo configurado de UTOY DROP y los enlaces sociales al perfil `https://www.instagram.com/utoy_drop/`; el resumen se copia y requiere envío explícito del comprador.
4. Calidad: compilación de producción, pruebas de reglas de pedido e integración HTTP.

## Siguiente escala recomendada

- Sustituir `JsonRepository` por `PostgresProductRepository` y `PostgresOrderRepository` sin cambiar la capa HTTP.
- Guardar imágenes en S3, Cloudflare R2 o equivalente con URLs firmadas.
- Mover las sesiones administrativas a Redis o a un proveedor de identidad.
- Incorporar reservas de inventario con caducidad y transacciones cuando exista pago en línea.
- Conectar Meta Webhooks para asociar el folio del pedido con una conversación iniciada por el comprador.
- Desplegar detrás de HTTPS permanente, observabilidad, copias de seguridad y alertas.

## Seguridad operativa

- Nunca subir `backend/.env`, pedidos ni uploads de clientes al repositorio.
- Configurar una contraseña única mediante `ADMIN_PASSWORD`; el servidor no inicia si falta.
- La sesión administrativa usa una cookie `HttpOnly`, `SameSite=Strict` y `Secure` sobre HTTPS; no se guardan tokens en `localStorage`.
- Las rutas de escritura validan origen, sesión, límites de frecuencia, estructura del catálogo y contenido real de las imágenes.
- La aplicación envía CSP restrictiva, HSTS sobre HTTPS, protección contra iframes, MIME sniffing y políticas de recursos/permisos.
- Respaldar `backend/data` antes de migrar o editar en lote.
