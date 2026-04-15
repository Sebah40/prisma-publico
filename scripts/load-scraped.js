#!/usr/bin/env node
/**
 * Carga los 84K procesos scrapeados de COMPR.AR a Supabase.
 * - Normaliza CUITs (XX-XXXXXXXX-X)
 * - Parsea montos (formato argentino 85.200,00 → 85200.00)
 * - Upsert proveedores + adjudicaciones
 * - Actualiza métricas de proveedores
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'data', 'comprar-all.jsonl');
const BATCH = 500;

function normalizeCuit(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

function parseMonto(raw) {
  if (!raw || typeof raw !== 'string') return 0;
  // "85.200,00" → 85200.00 | "3.838,00" → 3838.00
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseSafId(safStr) {
  const match = safStr?.match(/^(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

async function main() {
  const client = new Client({
    host: 'aws-1-us-east-2.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.sfecaatmpqppyoyaqksq',
    password: 'Sanandre@scapuchinos9876',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to Supabase');

  const lines = fs.readFileSync(INPUT, 'utf8').split('\n').filter(l => l.trim());
  console.log(`Loaded ${lines.length} processes from JSONL`);

  // Collect all unique CUITs and adjudicaciones
  const proveedores = new Map(); // cuit → { razon_social, ... }
  const adjudicaciones = [];
  let skippedNoCuit = 0;
  let skippedNoMonto = 0;

  for (const line of lines) {
    let proc;
    try { proc = JSON.parse(line); } catch { continue; }

    for (const c of (proc.contratos || [])) {
      const cuit = normalizeCuit(c.cuit);
      if (!cuit) { skippedNoCuit++; continue; }

      const monto = parseMonto(c.monto);
      if (monto <= 0) { skippedNoMonto++; continue; }

      if (!proveedores.has(cuit)) {
        proveedores.set(cuit, {
          cuit,
          razon_social: c.proveedor || 'Desconocido',
          tipo_personeria: null,
          localidad: null,
          provincia: null,
          codigo_postal: null,
          rubros: '{}',
          fecha_inscripcion: null,
        });
      }

      const safId = parseSafId(proc.saf);
      const yearMatch = proc.numero?.match(/(\d{2})$/);
      const ejercicio = yearMatch ? 2000 + parseInt(yearMatch[1]) : 0;

      // Parse fecha "13/01/2026 09:00 Hrs." → "2026-01-13"
      let fecha = null;
      const fechaMatch = proc.fecha?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (fechaMatch) fecha = `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}`;

      adjudicaciones.push({
        numero_procedimiento: proc.numero || '',
        saf_id: safId,
        saf_desc: proc.saf || '',
        uoc_id: null,
        uoc_desc: proc.uoc || null,
        tipo_procedimiento: proc.tipo || '',
        modalidad: '',
        ejercicio,
        fecha_adjudicacion: fecha,
        rubros: '{}',
        cuit_proveedor: cuit,
        proveedor_desc: c.proveedor || '',
        documento_contractual: c.oc || `${proc.numero}-${cuit}`,
        monto,
        moneda: (c.moneda || '').includes('Dolar') ? 'USD' : 'ARS',
      });
    }
  }

  console.log(`Proveedores: ${proveedores.size}`);
  console.log(`Adjudicaciones: ${adjudicaciones.length}`);
  console.log(`Skipped (no CUIT): ${skippedNoCuit}`);
  console.log(`Skipped (no monto): ${skippedNoMonto}`);

  // --- Upsert proveedores ---
  console.log('\nUpserting proveedores...');
  const provList = Array.from(proveedores.values());
  for (let i = 0; i < provList.length; i += BATCH) {
    const batch = provList.slice(i, i + BATCH);
    const values = batch.map((p, j) => {
      const off = j * 8;
      return `($${off+1}, $${off+2}, $${off+3}, $${off+4}, $${off+5}, $${off+6}, $${off+7}, $${off+8})`;
    }).join(',');
    const params = batch.flatMap(p => [
      p.cuit, p.razon_social, p.tipo_personeria, p.localidad,
      p.provincia, p.codigo_postal, p.rubros, p.fecha_inscripcion
    ]);
    try {
      await client.query(`
        INSERT INTO proveedores (cuit, razon_social, tipo_personeria, localidad, provincia, codigo_postal, rubros, fecha_inscripcion)
        VALUES ${values}
        ON CONFLICT (cuit) DO UPDATE SET razon_social = EXCLUDED.razon_social
      `, params);
    } catch (err) {
      console.log(`  WARN prov batch ${i}: ${err.message.slice(0, 80)}`);
    }
    if (i % 5000 === 0) process.stdout.write(`  ${i}/${provList.length}\r`);
  }
  console.log(`  ${provList.length} proveedores done`);

  // --- Upsert adjudicaciones ---
  console.log('Upserting adjudicaciones...');
  let inserted = 0;
  for (let i = 0; i < adjudicaciones.length; i += BATCH) {
    const batch = adjudicaciones.slice(i, i + BATCH);
    const values = batch.map((a, j) => {
      const off = j * 15;
      return `($${off+1},$${off+2},$${off+3},$${off+4},$${off+5},$${off+6},$${off+7},$${off+8},$${off+9},$${off+10},$${off+11},$${off+12},$${off+13},$${off+14},$${off+15})`;
    }).join(',');
    const params = batch.flatMap(a => [
      a.numero_procedimiento, a.saf_id, a.saf_desc, a.uoc_id, a.uoc_desc,
      a.tipo_procedimiento, a.modalidad, a.ejercicio, a.fecha_adjudicacion,
      a.rubros, a.cuit_proveedor, a.proveedor_desc, a.documento_contractual,
      a.monto, a.moneda
    ]);
    try {
      await client.query(`
        INSERT INTO adjudicaciones_historicas
        (numero_procedimiento, saf_id, saf_desc, uoc_id, uoc_desc, tipo_procedimiento, modalidad, ejercicio, fecha_adjudicacion, rubros, cuit_proveedor, proveedor_desc, documento_contractual, monto, moneda)
        VALUES ${values}
        ON CONFLICT (numero_procedimiento, cuit_proveedor, documento_contractual) DO NOTHING
      `, params);
      inserted += batch.length;
    } catch (err) {
      console.log(`  WARN adj batch ${i}: ${err.message.slice(0, 100)}`);
    }
    if (i % 5000 === 0) process.stdout.write(`  ${i}/${adjudicaciones.length}\r`);
  }
  console.log(`  ${inserted} adjudicaciones done`);

  // --- Update SAF mapping ---
  console.log('Updating SAF mapping...');
  const safMap = new Map();
  for (const a of adjudicaciones) {
    if (a.saf_id && a.saf_desc && !safMap.has(a.saf_id)) {
      safMap.set(a.saf_id, a.saf_desc);
    }
  }
  for (const [safId, safDesc] of safMap) {
    try {
      await client.query(`
        INSERT INTO map_saf_jurisdiccion (saf_id, saf_desc, jurisdiccion_id, jurisdiccion_desc)
        VALUES ($1, $2, 0, 'Sin mapear')
        ON CONFLICT (saf_id) DO UPDATE SET saf_desc = EXCLUDED.saf_desc
      `, [safId, safDesc]);
    } catch {}
  }
  console.log(`  ${safMap.size} SAFs`);

  // --- Update proveedor metrics ---
  console.log('Updating proveedor metrics...');
  await client.query(`
    UPDATE proveedores p SET
      total_adjudicado = sub.total,
      cantidad_contratos = sub.cnt,
      anios_activo = sub.anios,
      jurisdicciones_distintas = sub.jurs
    FROM (
      SELECT
        cuit_proveedor,
        SUM(monto) as total,
        COUNT(*) as cnt,
        COUNT(DISTINCT ejercicio) as anios,
        COUNT(DISTINCT saf_id) as jurs
      FROM adjudicaciones_historicas
      GROUP BY cuit_proveedor
    ) sub
    WHERE p.cuit = sub.cuit_proveedor
  `);
  console.log('  Done');

  // --- Final counts ---
  const { rows: [counts] } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM proveedores WHERE cantidad_contratos > 0) as proveedores,
      (SELECT COUNT(*) FROM adjudicaciones_historicas) as adjudicaciones,
      (SELECT COUNT(*) FROM map_saf_jurisdiccion) as safs
  `);
  console.log(`\n=== LOADED ===`);
  console.log(`Proveedores: ${counts.proveedores}`);
  console.log(`Adjudicaciones: ${counts.adjudicaciones}`);
  console.log(`SAFs: ${counts.safs}`);

  await client.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
