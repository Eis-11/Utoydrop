# UTOY DROP

Tienda y panel administrativo para UTOY DROP. Incluye catálogo, inventario, variantes, favoritos, carrito, pedidos por Instagram y gestión de productos, categorías, colecciones y pedidos.

El repositorio parte con el catálogo y los pedidos vacíos. Los productos reales se publican desde `/#admin`; las fotografías subidas y los datos de clientes se guardan localmente y están excluidos de Git.

## Requisitos

- Node.js 20 o superior.
- pnpm 11.

## Instalación local

```bash
pnpm install
copy backend\.env.example backend\.env
pnpm run build
pnpm run serve
```

Edita `backend/.env` antes de iniciar y define una contraseña privada:

```env
PORT=4000
NODE_ENV=development
ADMIN_PASSWORD=una-frase-larga-y-unica
ADMIN_SESSION_TTL_MINUTES=5
```

La tienda queda disponible en `http://localhost:4000` y el panel en `http://localhost:4000/#admin`.

Para desarrollo con recarga automática, ejecuta `pnpm run dev` y `pnpm run backend` en terminales separadas.

## Comandos

- `pnpm run dev`: inicia Vite para desarrollo del frontend.
- `pnpm run backend`: inicia la API y sirve la compilación existente.
- `pnpm run build`: genera el frontend de producción.
- `pnpm run serve`: inicia la aplicación completa.
- `pnpm test`: compila y ejecuta las pruebas automatizadas.
- `pnpm run check`: valida la sintaxis del servidor.

## Datos locales

- `backend/data/products.json`: catálogo publicado desde el administrador.
- `backend/data/categories.json`: categorías disponibles.
- `backend/data/collections.json`: colecciones disponibles.
- `backend/data/orders.json`: pedidos y datos de clientes; excluido de Git.
- `backend/uploads/`: fotografías publicadas; excluidas de Git.

No subas `backend/.env`, pedidos, fotografías de clientes ni respaldos al repositorio.

## Antes de desplegar

1. Configura `NODE_ENV=production` y una contraseña administrativa única.
2. Usa HTTPS permanente.
3. Configura almacenamiento persistente para `backend/data` y `backend/uploads` o migra a una base de datos y almacenamiento de objetos.
4. Ejecuta `pnpm install --frozen-lockfile` y `pnpm test`.
5. Conserva copias de seguridad fuera del repositorio.

La arquitectura y las recomendaciones de escalamiento están documentadas en [ARCHITECTURE.md](./ARCHITECTURE.md).
