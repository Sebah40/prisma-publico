<div align="center">

# Prisma Público

### Cross-referencing Argentina's national budget, public contracts, and campaign donations — in one tool.

<p align="center">
  <em>What happens when you connect what the state spends, who gets paid, and who funded the people deciding.</em>
</p>

<p align="center">
  <a href="https://prismapublico.firstcommit.io"><img alt="Live" src="https://img.shields.io/badge/Live-prismapublico.firstcommit.io-f6c177?style=for-the-badge&logo=vercel&logoColor=black"></a>
  <a href="https://github.com/Sebah40/prisma-publico"><img alt="License" src="https://img.shields.io/badge/License-Open_Source-eb6f92?style=for-the-badge"></a>
  <img alt="Argentina" src="https://img.shields.io/badge/Argentina-9ccfd8?style=for-the-badge">
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React_19-61dafb?style=flat-square&logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-336791?style=flat-square&logo=postgresql&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3ecf8e?style=flat-square&logo=supabase&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind_v4-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white">
  <img alt="Canvas" src="https://img.shields.io/badge/Canvas_API-e34f26?style=flat-square&logo=html5&logoColor=white">
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white">
</p>

<p align="center">
  <a href="https://prismapublico.firstcommit.io"><b>Live site</b></a> ·
  <a href="#-what-this-actually-does"><b>What it does</b></a> ·
  <a href="#-data-sources"><b>Data sources</b></a> ·
  <a href="#-local-development"><b>Run it locally</b></a>
</p>

</div>

---

## What this actually does

**Three Argentine government datasets, normally fragmented, finally crossed:**

| Source | What it has | Records |
|---|---|---|
| **SITIF** (Presupuesto Abierto) | The national budget — what the state plans to spend, what it actually spent | Daily snapshots since launch |
| **COMPR.AR** | Public procurement — every adjudicated contract, who got it, for what | **110,000+** records, 2015–2026 |
| **CNE** (Cámara Nacional Electoral) | Campaign donations — who funded the politicians who now decide the budget | **74,000+** records |

Plus **INDEC IPC** for 11 years of inflation normalization — because comparing ARS values across years without it is malpractice.

The result: anyone can ask questions like *"Which suppliers received public contracts after donating to the parties that ended up running the relevant ministry?"* — and get an answer with one click instead of a six-month FOIA dance.

---

## ✦ Key features

<table>
<tr>
<td width="50%">

**Daily budget pulse**
Cron-driven snapshot ingestion. Each day's budget state is immutable. A delta engine emits *BOOST / HALT / RECT* events so journalists can spot overnight changes.

</td>
<td width="50%">

**Procurement at scale**
Resumable multi-worker scraper for the DevExpress/ViewState COMPR.AR portal. Five parallel sessions, cookie juggling, PostBack simulation.

</td>
</tr>
<tr>
<td width="50%">

**Provider profiles**
Every adjudicated supplier gets a profile linking their historical contracts to current budget programs and (where applicable) to their political donations.

</td>
<td width="50%">

**Custom Canvas charts**
Seven insight visualizations on raw Canvas with custom hit detection — distribution histogram, scatter, boxplot, before/after donations, heatmap, cumulative timeline, co-occurrence network. **No chart libraries.**

</td>
</tr>
<tr>
<td width="50%">

**Inflation-normalized**
INDEC IPC series spanning 119 months. ARS values from 2015 are comparable to 2026 without lying with averages.

</td>
<td width="50%">

**Mobile-first**
Audited 23 files for mobile issues — 8-9px fonts, 6-column grids on 375px screens, accidental chart taps. All fixed.

</td>
</tr>
</table>

---

## ✦ Data sources

| API / Source | Use |
|---|---|
| [Presupuesto Abierto](https://www.presupuestoabierto.gob.ar/) | National budget JSON — token-gated, polite scraping |
| [COMPR.AR](https://comprar.gob.ar/) | Public procurement — ASP.NET/ViewState portal, scraped |
| [CNE](https://www.electoral.gob.ar/) | Campaign donations — CSV exports |
| [INDEC IPC](https://www.indec.gob.ar/) | Inflation index for ARS normalization |
| [datos.gob.ar](https://datos.gob.ar/) | Reference datasets |

---

## ✦ Stack

<table>
<tr>
<td>

**Frontend**
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Canvas API (custom charts)

</td>
<td>

**Backend / Data**
- PostgreSQL via Supabase
- `pg` (node-postgres) for raw SQL
- Cron-driven ingestion
- CSV / XLSX parsers
- ISR caching with hourly revalidation

</td>
<td>

**Scraping / Infra**
- Multi-worker ASP.NET scraper
- ViewState / PostBack simulation
- Vercel deployment
- OAuth 2.0 where required

</td>
</tr>
</table>

---

## ✦ Local development

```bash
# 1. Clone
git clone https://github.com/Sebah40/prisma-publico.git
cd prisma-publico

# 2. Install
npm install

# 3. Environment
cp .env.example .env.local
# Fill in: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
#         NEXT_PUBLIC_SUPABASE_ANON_KEY, PRESUPUESTO_ABIERTO_TOKEN

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## ✦ Build story

This was built over 11 stages, fully documented:
**[Read the build story on First Commit →](https://firstcommit.io/guide/a059c65a-6cf9-40d2-adf9-dc86ac133732)**

Includes: data source discovery, terminal-aesthetic UI decisions, daily pulse + delta engine, COMPR.AR scraper wars, custom Canvas chart engine, data integrity passes, and the long Vercel deployment war.

---

## ✦ Author

Built by **[Sebastián Haoys](https://firstcommit.io/profile/sebah40)** ([@sebah40](https://github.com/Sebah40)).

[`firstcommit.io`](https://firstcommit.io) · [`linkedin`](https://linkedin.com/in/sebastian-haoys) · [`résumé`](https://firstcommit.io/resume/sebah40)

<div align="center">
<sub>Built in public from Concordia, Argentina.</sub>
</div>
