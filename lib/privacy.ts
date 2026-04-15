/**
 * Protección de datos personales — Ley 25.326.
 *
 * Los CUITs que empiezan con 20, 23, 24, 27 son personas físicas.
 * Los que empiezan con 30, 33, 34 son personas jurídicas (empresas).
 *
 * Las personas físicas se EXCLUYEN de las queries a nivel servidor.
 * Nunca llegan al frontend.
 */

/** SQL fragments para filtrar solo personas jurídicas en queries */
export const EMPRESAS = {
  cuit: "(cuit LIKE '30-%' OR cuit LIKE '33-%' OR cuit LIKE '34-%')",
  proveedor: "(cuit_proveedor LIKE '30-%' OR cuit_proveedor LIKE '33-%' OR cuit_proveedor LIKE '34-%')",
  donante: "(cuit_donante LIKE '30-%' OR cuit_donante LIKE '33-%' OR cuit_donante LIKE '34-%')",
};
