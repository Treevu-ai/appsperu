/**
 * Re-exportada desde `@appsperu/shared-identity` (CX-09, ver
 * docs/adr/0019-alcance-workspace-utilidades-compartidas.md) — este archivo
 * era su única definición hasta que se generalizó para reutilizarla también
 * en identidad-fiscal (estado tributario en la fecha de adjudicación, no
 * solo inhabilitaciones).
 */
export { vigenteEnFecha, consolidarEstadoTemporal, type EstadoTemporal } from "@appsperu/shared-identity";
