# Prisma Público

Plataforma de seguimiento del gasto público argentino. Cruza datos de presupuesto nacional, contrataciones del Estado y aportes de campaña para mostrar dónde va el dinero público y quiénes son sus beneficiarios.

Despliegue: https://prisma-publico.vercel.app

## Stack

- **Next.js 16** (App Router) + React 19
- **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (Postgres + auth) como backend
- Ingesta de datasets vía `csv-parse` y `xlsx`
- Desplegado en **Vercel**

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # variables de Supabase
npm run dev
```

Abrir http://localhost:3000.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servir el build |
| `npm run lint` | ESLint |

## Fuentes de datos

Los datasets provienen de organismos públicos argentinos (presupuesto abierto, contrataciones, cámara nacional electoral). Los scripts de carga viven en el repo y normalizan los archivos oficiales antes de insertarlos en Supabase.

## Autor

Sebastián Haoys
