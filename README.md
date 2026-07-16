# UTOY DROP

Tienda web y panel administrativo de UTOY DROP. El proyecto incluye catálogo, inventario por variantes, favoritos, carrito, pedidos por Instagram y administración de productos, categorías, colecciones y pedidos.

El repositorio se publica con el catálogo y los pedidos vacíos. Las fotografías subidas, los pedidos y los datos de clientes se conservan fuera de Git.

## Tecnologías

- Frontend: React 19 y Vite 8.
- Backend: Node.js 20 y Express 4.
- Persistencia local actual: archivos JSON y almacenamiento de imágenes en disco.
- Gestor del monorepo: pnpm workspaces.

## Estructura

```text
.
├── backend/
│   ├── index.js                 # Entrada del servidor
│   ├── .env.example             # Variables requeridas sin secretos
│   ├── src/
│   │   ├── app.js               # API, sesiones, catálogo y archivos estáticos
│   │   ├── config.js            # Configuración desde variables de entorno
│   │   ├── middleware/          # Seguridad, origen y límites
│   │   ├── repositories/        # Persistencia JSON
│   │   └── services/            # Lógica de pedidos e inventario
│   ├── tests/                    # Pruebas del backend
│   ├── data/                     # Catálogo base y configuración visible
│   └── uploads/.gitkeep          # Directorio local; archivos ignorados
├── frontend/
│   ├── public/img/               # Logos públicos de la marca
│   ├── src/
│   │   ├── components/          # Tienda, carrito, guías y administrador
│   │   ├── config/              # Datos públicos del negocio
│   │   ├── hooks/               # Estado persistente del navegador
│   │   ├── services/            # Cliente de la API
│   │   ├── styles/              # Estilos globales
│   │   └── utils/               # Utilidades de inventario
│   └── vite.config.js
├── ARCHITECTURE.md
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

## Requisitos

- Node.js 20 o superior.
- pnpm 11.7.0 o una versión compatible con el lockfile.

## Instalación reproducible

```bash
pnpm install --frozen-lockfile
```

Crea la configuración local del backend sin versionarla:

```bash
cp backend/.env.example backend/.env
```

En PowerShell:

```powershell
Copy-Item backend\.env.example backend\.env
```

Edita `backend/.env` y define una contraseña administrativa única:

```env
PORT=4000
NODE_ENV=development
ADMIN_PASSWORD=usa-una-frase-larga-y-unica
ADMIN_SESSION_TTL_MINUTES=5
```

`ADMIN_PASSWORD` es obligatoria. El servidor no inicia si falta; nunca debe guardarse en Git.

## Desarrollo local

Ejecuta el backend y Vite en terminales separadas:

```bash
pnpm run backend
pnpm run dev
```

Vite usa su puerto de desarrollo y redirige `/api` a `http://localhost:4000`.

## Ejecución de producción local

```bash
pnpm run build
pnpm run serve
```

- Tienda: `http://localhost:4000/`
- Administrador: `http://localhost:4000/#admin`

## Comandos

| Comando | Función |
| --- | --- |
| `pnpm install --frozen-lockfile` | Instala exactamente las dependencias del lockfile. |
| `pnpm run dev` | Inicia Vite para desarrollar el frontend. |
| `pnpm run backend` | Inicia el backend con Node.js. |
| `pnpm run build` | Compila el frontend en `frontend/dist`. |
| `pnpm run preview` | Previsualiza el build con Vite. |
| `pnpm run serve` | Sirve API y frontend compilado desde el backend. |
| `pnpm run check` | Valida la sintaxis de los archivos principales del backend. |
| `pnpm test` | Compila el frontend y ejecuta las pruebas automatizadas. |

## Datos y archivos excluidos

- `backend/data/products.json`: se publica vacío; el administrador agrega el catálogo real.
- `backend/data/categories.json`: categorías base visibles en la tienda.
- `backend/data/collections.json`: colecciones base visibles en la tienda.
- `backend/data/orders.json`: pedidos y datos de clientes; ignorado por Git.
- `backend/uploads/`: fotografías subidas; sólo `.gitkeep` se versiona.
- `backend/.env` y cualquier `.env.*`: configuración privada; ignorada por Git.
- `node_modules/`, `frontend/dist/`, logs, cachés y temporales: generados localmente e ignorados.

Las únicas imágenes versionadas son los logos públicos ubicados en `frontend/public/img/`.

## Seguridad

- La sesión administrativa usa cookies `HttpOnly`, `SameSite=Strict` y `Secure` sobre HTTPS.
- Las escrituras verifican el mismo origen y tienen límites de solicitudes.
- Las imágenes se validan y optimizan antes de guardarse.
- No se almacenan contraseñas ni tokens administrativos en el navegador o el repositorio.
- No deben publicarse pedidos, datos de clientes, archivos `.env`, cargas reales ni respaldos.

## Validación antes de publicar

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run build
```

## Migración prevista a Cloudflare

El proyecto actual usa Express, archivos JSON y almacenamiento local. La migración pendiente contempla:

- Cloudflare Pages para el frontend compilado.
- Cloudflare Workers para sustituir la API Express.
- Cloudflare D1 para catálogo, configuración y pedidos.
- Cloudflare R2 para las imágenes de productos.
- Secrets/variables de Cloudflare para la contraseña y configuración privada.

No se debe desplegar el backend actual en Pages sin adaptar previamente la API y la persistencia. Consulta [ARCHITECTURE.md](./ARCHITECTURE.md) para el diseño actual y las recomendaciones de migración.
