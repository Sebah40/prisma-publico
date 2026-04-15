#!/usr/bin/env node
/**
 * Scraper de COMPR.AR — v3 optimizado.
 *
 * Fase 1: Recolectar números de proceso paginando el listado (rápido, ~20 min)
 * Fase 2: Para cada proceso, buscar por número → click → detalle (~3s cada uno)
 *
 * Multi-worker, retomable, con progreso en tiempo real.
 *
 * Uso: node scripts/scrape-comprar.js [workers=3]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const NUM_WORKERS = parseInt(process.argv[2] || '5');
const DELAY = 800;
const OUTPUT = path.join(__dirname, '..', 'data', 'comprar-all.jsonl');
const INDEX = path.join(__dirname, '..', 'data', 'process-index.json');

// --- HTTP factory ---
function createClient() {
  const jar = {};
  function parseCk(h) {
    for (const c of (Array.isArray(h['set-cookie']) ? h['set-cookie'] : [h['set-cookie'] || ''])) {
      if (!c) continue; const eq = c.indexOf('='); const sc = c.indexOf(';');
      if (eq > 0) jar[c.substring(0, eq).trim()] = c.substring(eq + 1, sc > 0 ? sc : undefined).trim();
    }
  }
  return {
    req(url, o = {}) {
      return new Promise((res, rej) => {
        const u = new URL(url);
        const r = https.request({
          hostname: u.hostname, path: u.pathname + u.search, method: o.method || 'GET',
          headers: { 'Cookie': Object.entries(jar).map(([k, v]) => k + '=' + v).join('; '),
            'User-Agent': 'Mozilla/5.0', ...(o.headers || {}) },
        }, r2 => { parseCk(r2.headers); let b = ''; r2.on('data', d => b += d);
          r2.on('end', () => res({ status: r2.statusCode, headers: r2.headers, body: b })); });
        r.on('error', rej); r.setTimeout(60000, () => { r.destroy(); rej(new Error('timeout')); });
        if (o.body) r.write(o.body); r.end();
      });
    },
    reset() { Object.keys(jar).forEach(k => delete jar[k]); }
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getVS = b => b.match(/\|hiddenField\|__VIEWSTATE\|([^|]+)/)?.[1] || '';
function dec(s) { return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&'); }

// --- Forms ---
function listSearchForm() {
  const fd = new URLSearchParams();
  fd.append('ctl00$ScriptManager1', 'ctl00$ScriptManager1|ctl00$CPH1$btnListarPliegoAvanzado');
  fd.append('__EVENTTARGET', 'ctl00$CPH1$btnListarPliegoAvanzado');
  fd.append('__EVENTARGUMENT', 'undefined'); fd.append('__LASTFOCUS', '');
  fd.append('__VIEWSTATE', ''); fd.append('__VIEWSTATEGENERATOR', 'AD3B4564');
  for (const [k, v] of [['ddlJurisdicion', '-2'], ['ddlEstadoProceso', '-2'], ['ddlTipoProceso', '-2'],
    ['ddlRubro', '-2'], ['ddlTipoOperacion', '-2'], ['ddlResultadoOrdenadoPor', 'PLI.Pliego.NumeroPliego'],
    ['ddlUnidadEjecutora', '-2'], ['hidEstadoListaPliegos', 'NOREPORTEEXCEL'],
    ['txtNumeroProceso', ''], ['txtExpediente', ''], ['txtNombrePliego', '']])
    fd.append('ctl00$CPH1$' + k, v);
  for (const k of ['devDteEdtFechaAperturaDesde_Raw', 'devDteEdtFechaAperturaDesde',
    'devDteEdtFechaAperturaDesde_DDDWS', 'devDteEdtFechaAperturaDesde_DDD_C_FNPWS',
    'devDteEdtFechaAperturaHasta_Raw', 'devDteEdtFechaAperturaHasta',
    'devDteEdtFechaAperturaHasta_DDDWS', 'devDteEdtFechaAperturaHasta_DDD_C_FNPWS'])
    fd.append('ctl00_CPH1_' + k, k.includes('Hasta_Raw') ? 'N' : k.includes('WS') ? '0:0:-1:0:0:0:0:0:' : '');
  fd.append('ctl00$CPH1$devDteEdtFechaAperturaDesde$DDD$C', '');
  fd.append('ctl00$CPH1$devDteEdtFechaAperturaHasta$DDD$C', '');
  fd.append('ctl00$CPH1$devCbPnlNombreProveedor$txtNombreProveedor', '');
  fd.append('ctl00$CPH1$devCbPnlPopupListarProveedor$txtPopupNombreProveedor', '');
  fd.append('ctl00$CPH1$devCbPnlPopupListarProveedor$txtPopupCuitProveedor', '');
  fd.append('ctl00_CPH1_devPopupListarProveedorWS', '0:0:-1:0:0:0:0:0:');
  fd.append('ctl00$CPH1$hdnFldIdProveedorSeleccionado', '');
  fd.append('ctl00_CPH1_devPopupVistaPreviaProcesoCompraCiudadanoWS', '0:0:-1:0:0:0:0:0:');
  fd.append('ctl00_CPH1_devPopupVistaPreviaPliegoWS', '0:0:-1:0:0:0:0:0:');
  fd.append('DXScript', '1_103,1_105,2_13,2_12,2_7,1_96,1_100,1_83,2_6');
  fd.append('__ASYNCPOST', 'true');
  return fd;
}

function pageForm(vs, n) {
  const fd = new URLSearchParams();
  fd.append('ctl00$ScriptManager1', 'ctl00$ScriptManager1|ctl00$CPH1$GridListaPliegos');
  fd.append('__EVENTTARGET', 'ctl00$CPH1$GridListaPliegos');
  fd.append('__EVENTARGUMENT', 'Page$' + n);
  fd.append('__VIEWSTATE', vs); fd.append('__VIEWSTATEGENERATOR', 'AD3B4564');
  for (const [k, v] of [['ddlEstadoProceso', '-2'], ['ddlJurisdicion', '-2'], ['ddlTipoProceso', '-2'],
    ['ddlRubro', '-2'], ['ddlTipoOperacion', '-2'], ['ddlResultadoOrdenadoPor', 'PLI.Pliego.NumeroPliego'],
    ['ddlUnidadEjecutora', '-2'], ['hidEstadoListaPliegos', 'NOREPORTEEXCEL']])
    fd.append('ctl00$CPH1$' + k, v);
  fd.append('__ASYNCPOST', 'true');
  return fd;
}

function numSearchForm(numero) {
  const fd = new URLSearchParams();
  fd.append('ctl00$ScriptManager1', 'ctl00$ScriptManager1|ctl00$CPH1$btnListarPliegoNumero');
  fd.append('__EVENTTARGET', 'ctl00$CPH1$btnListarPliegoNumero');
  fd.append('__EVENTARGUMENT', ''); fd.append('__VIEWSTATE', '');
  fd.append('__VIEWSTATEGENERATOR', 'AD3B4564');
  fd.append('ctl00$CPH1$txtNumeroProceso', numero);
  fd.append('ctl00$CPH1$hidEstadoListaPliegos', 'NOREPORTEEXCEL');
  fd.append('__ASYNCPOST', 'true');
  return fd;
}

function clickForm(vs) {
  const fd = new URLSearchParams();
  fd.append('__EVENTTARGET', 'ctl00$CPH1$GridListaPliegos$ctl02$lnkNumeroProceso');
  fd.append('__EVENTARGUMENT', ''); fd.append('__VIEWSTATE', vs);
  fd.append('__VIEWSTATEGENERATOR', 'AD3B4564');
  fd.append('ctl00$CPH1$hidEstadoListaPliegos', 'NOREPORTEEXCEL');
  return fd;
}

// --- Parsers ---
function parseListRows(body) {
  const rows = [];
  const re = /<a[^>]*lnk[^>]*>([^<]+)<\/a>\s*<\/td><td>\s*<p>([^<]*)<\/p>\s*<\/td><td>([^<]*)<\/td><td>\s*<p>([^<]*)<\/p>\s*<\/td><td>\s*<p>([^<]*)<\/p>\s*<\/td><td>\s*<p>([^<]*)<\/p>\s*<\/td><td>\s*<p>([^<]*)<\/p>\s*<\/td><td>\s*<p>([^<]*)<\/p>/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    rows.push({ numero: m[1].trim(), exp: m[2].trim(), nombre: dec(m[3].trim()),
      tipo: m[4].trim(), fecha: m[5].trim(), estado: m[6].trim(), uoc: m[7].trim(), saf: m[8].trim() });
  }
  return rows;
}

function parseContracts(body) {
  const contracts = [];
  const idx = body.indexOf('contractual por proveedor');
  if (idx === -1) return contracts;
  const section = body.substring(idx, idx + 10000);
  for (const tr of (section.match(/<tr[^>]*>.*?<\/tr>/gs) || []).slice(1)) {
    const tds = (tr.match(/<td[^>]*>(.*?)<\/td>/gs) || []).map(td => dec(td.replace(/<[^>]+>/g, '').trim()));
    if (tds.length >= 7) {
      const o = tds.length >= 8 ? 1 : 0;
      contracts.push({ oc: o ? tds[0] : '', proveedor: tds[o], cuit: tds[o + 1],
        tipo: tds[o + 2], estado: tds[o + 3], fecha: tds[o + 4], monto: tds[o + 5], moneda: tds[o + 6] || '' });
    }
  }
  return contracts;
}

// === PHASE 1: Collect all process numbers ===
async function collectIndex() {
  if (fs.existsSync(INDEX)) {
    const data = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    console.log(`[INDEX] Loaded ${data.length} process numbers from cache`);
    return data;
  }

  console.log('[INDEX] Collecting all process numbers from listing...');
  const client = createClient();
  await client.req('https://comprar.gob.ar/BuscarAvanzado.aspx');
  await sleep(1000);

  const sr = await client.req('https://comprar.gob.ar/BuscarAvanzado.aspx', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-MicrosoftAjax': 'Delta=true' },
    body: listSearchForm().toString(),
  });

  const total = parseInt(sr.body.match(/encontrado.*?(\d+)/)?.[1] || '0');
  const totalPages = Math.ceil(total / 10);
  let vs = getVS(sr.body);
  const all = parseListRows(sr.body);

  console.log(`[INDEX] ${total} processes, ${totalPages} pages`);

  for (let p = 2; p <= totalPages; p++) {
    await sleep(800); // Fast — just listing, no detail
    try {
      const r = await client.req('https://comprar.gob.ar/BuscarAvanzado.aspx', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-MicrosoftAjax': 'Delta=true' },
        body: pageForm(vs, p).toString(),
      });
      vs = getVS(r.body) || vs;
      const rows = parseListRows(r.body);
      all.push(...rows);

      if (p % 100 === 0) {
        const pct = ((p / totalPages) * 100).toFixed(1);
        const eta = Math.round((totalPages - p) * 0.8 / 60);
        console.log(`[INDEX] Page ${p}/${totalPages} (${pct}%) | ${all.length} collected | ETA: ${eta}min`);
      }
    } catch (err) {
      console.log(`[INDEX] Page ${p} error: ${err.message} — retrying`);
      await sleep(3000);
      client.reset();
      await client.req('https://comprar.gob.ar/BuscarAvanzado.aspx');
      await sleep(1000);
      const resr = await client.req('https://comprar.gob.ar/BuscarAvanzado.aspx', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-MicrosoftAjax': 'Delta=true' },
        body: listSearchForm().toString(),
      });
      vs = getVS(resr.body);
      // Navigate to current page
      await sleep(800);
      const navr = await client.req('https://comprar.gob.ar/BuscarAvanzado.aspx', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-MicrosoftAjax': 'Delta=true' },
        body: pageForm(vs, p).toString(),
      });
      vs = getVS(navr.body) || vs;
      all.push(...parseListRows(navr.body));
    }
  }

  // Save index
  fs.writeFileSync(INDEX, JSON.stringify(all));
  console.log(`[INDEX] Done — ${all.length} processes saved to index`);
  return all;
}

// === PHASE 2: Fetch details with workers ===
async function detailWorker(id, processes, done) {
  const client = createClient();
  const tag = `[W${id}]`;
  let scraped = 0;
  let errors = 0;
  let consecutiveErrors = 0;

  async function init() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        client.reset();
        await client.req('https://comprar.gob.ar/BuscarAvanzado.aspx');
        await sleep(500);
        consecutiveErrors = 0;
        return;
      } catch {
        await sleep(5000 * (attempt + 1));
      }
    }
    // If all 3 attempts fail, just wait longer and try once more
    await sleep(30000);
    client.reset();
    await client.req('https://comprar.gob.ar/BuscarAvanzado.aspx');
  }

  try { await init(); } catch { /* continue anyway */ }

  for (let i = 0; i < processes.length; i++) {
    const proc = processes[i];
    if (done.has(proc.numero)) continue;

    try {
      await sleep(DELAY);

      // 1. Search by process number
      const sr = await client.req('https://comprar.gob.ar/BuscarAvanzado.aspx', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-MicrosoftAjax': 'Delta=true' },
        body: numSearchForm(proc.numero).toString(),
      });

      const vs = getVS(sr.body);
      const count = sr.body.match(/encontrado.*?(\d+)/)?.[1];
      if (!count || count === '0') { errors++; consecutiveErrors++; continue; }

      await sleep(DELAY);

      // 2. Click → redirect
      const cr = await client.req('https://comprar.gob.ar/BuscarAvanzado.aspx', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: clickForm(vs).toString(),
      });

      if (cr.status !== 302 || !cr.headers['location']) {
        errors++; consecutiveErrors++;
        try { await init(); } catch {}
        continue;
      }

      await sleep(800);

      // 3. Fetch detail
      const dr = await client.req('https://comprar.gob.ar' + cr.headers['location']);
      const contracts = dr.body.length > 1000 ? parseContracts(dr.body) : [];

      const record = { ...proc, contratos: contracts, ts: new Date().toISOString() };
      fs.appendFileSync(OUTPUT, JSON.stringify(record) + '\n');
      done.add(proc.numero);
      scraped++;
      consecutiveErrors = 0;

    } catch (err) {
      errors++;
      consecutiveErrors++;

      // Back off more aggressively if many consecutive errors
      const backoff = Math.min(consecutiveErrors * 5000, 60000);
      console.log(`${tag} Error #${errors} (${consecutiveErrors} consecutive): ${err.message} — waiting ${backoff/1000}s`);
      await sleep(backoff);
      try { await init(); } catch {}
    }

    // Progress every 10 items
    if ((scraped + errors) % 10 === 0 && (scraped + errors) > 0) {
      const elapsed = (Date.now() - globalStart) / 1000;
      const totalDone = done.size;
      const rate = totalDone / elapsed;
      const remaining = globalTotal - totalDone;
      const etaMin = rate > 0 ? Math.round(remaining / rate / 60) : '?';
      const etaH = Math.floor(etaMin / 60);
      const etaM = etaMin % 60;
      console.log(
        `${tag} ${totalDone}/${globalTotal} (${(totalDone/globalTotal*100).toFixed(1)}%) | ` +
        `Rate: ${rate.toFixed(2)}/s | Errors: ${errors} | ` +
        `ETA: ${etaH}h${etaM}m`
      );
    }
  }

  console.log(`${tag} DONE — scraped: ${scraped}, errors: ${errors}`);
}

// --- Main ---
let globalStart, globalTotal;

async function main() {
  if (!fs.existsSync(path.dirname(OUTPUT))) fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  // Load done
  const done = new Set();
  if (fs.existsSync(OUTPUT)) {
    for (const line of fs.readFileSync(OUTPUT, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { done.add(JSON.parse(line).numero); } catch {}
    }
    console.log(`Resuming — ${done.size} already scraped`);
  }

  // Phase 1: Collect index
  const allProcesses = await collectIndex();

  // Sort: most recent first (process numbers ending in 26, 25, 24...)
  allProcesses.sort((a, b) => {
    const ya = parseInt(a.numero.match(/(\d{2})$/)?.[1] || '0');
    const yb = parseInt(b.numero.match(/(\d{2})$/)?.[1] || '0');
    return yb - ya; // 26 first, then 25, etc.
  });

  const remaining = allProcesses.filter(p => !done.has(p.numero));
  globalTotal = allProcesses.length;
  globalStart = Date.now();

  console.log(`\n=== PHASE 2: Fetching details ===`);
  console.log(`Total: ${globalTotal} | Already done: ${done.size} | Remaining: ${remaining.length}`);
  console.log(`Workers: ${NUM_WORKERS} | ~3s per process | ETA: ~${Math.round(remaining.length * 3 / NUM_WORKERS / 3600)}h`);
  console.log('---');

  // Distribute (interleaved)
  const chunks = Array.from({ length: NUM_WORKERS }, () => []);
  remaining.forEach((p, i) => chunks[i % NUM_WORKERS].push(p));

  await Promise.allSettled(chunks.map((chunk, i) => detailWorker(i + 1, chunk, done)));

  console.log(`\n=== COMPLETE ===`);
  console.log(`Total: ${done.size} | File: ${OUTPUT}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
