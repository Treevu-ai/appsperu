# Análisis — Cusco: brechas y competitividad (2026-08)

Memo Rastro Fase 2 para **Cusco** (UBIGEO `08`), plantilla
[`docs/plantilla-memo-regional-rastro-v1.md`](plantilla-memo-regional-rastro-v1.md).

## Resumen ejecutivo

| Dimensión | Estado preflight | Hallazgo principal |
|---|---|---|
| Territorio (ceplan-geo) | ✅ COMPLETA_VERIFICADA | 112 distritos; **27 aeropuertos** (máximo del piloto); 1 puerto |
| Ejecución MEF | 🟡 PARCIAL_INGESTA | Scan cloud incompleto; usar `ingest:mef:pilot:ejecutora` en local |
| Obras INFOBRAS | ⏸ PENDIENTE_INGESTA | Timeout red cloud agent |
| Inversiones Invierte | ✅ COMPLETA_VERIFICADA | 10,567 proyectos; 55.4% sobrecosto; 10.9% cartera productiva |
| Marco CEPLAN | ✅ NACIONAL | GN/GR agregado |
| **Preflight global** | **🟡 PARCIAL** | Geo + marco nacional |

**Lectura preliminar:** Cusco combina **turismo/cultura** (Machu Picchu, corredor arqueológico) con
**conectividad aérea dispersa** (27 aeropuertos en capa CEPLAN — muchos aeródromos altoandinos).
La infraestructura logística registrada supera a todos los demás departamentos piloto en red aérea.

---

## 1. Preflight territorial

| Fuente | Estado | Evidencia |
|---|---|---|
| ceplan-geo | ✅ | 112 distritos; 27 aeropuertos; 1 puerto |
| radar-ejecucion | ⏸ | `MEF_DEPARTAMENTO=CUSCO npm run ingest:mef` |
| infobras | ⏸ | `INFOBRAS_DEPARTAMENTOS=CUSCO npm run ingest:infobras` |
| radar-inversiones | ✅ | 10,567 proyectos; corrida full 2026-08-26 |

```sql
SELECT t.departamento, i.infra_type, COUNT(*)
FROM infrastructure i
JOIN territories t ON ST_Within(i.geometry, t.geometry)
WHERE t.departamento = 'CUSCO'
GROUP BY 1, 2;
-- aeropuerto: 27, puerto: 1
```

---

## 2. Ejecución presupuestal — pendiente

| Nivel | PIM | Devengado | Avance % |
|---|---|---|---|
| Gobierno Regional Cusco | — | — | — |
| Gobiernos Locales | — | — | — |

**Referencia La Libertad:** GR 49.2%, GL 39.9%.

---

## 3. Obras e inversiones

**INFOBRAS:** ⏸ pendiente (timeout red cloud agent).

**Invierte (verificado 2026-08-26):**

- **10,567** proyectos activos — el mayor del piloto.
- **55.4%** con sobrecosto — el más alto del piloto.
- Cartera productiva directa: **10.9%** (1,152 proyectos).

Referencia La Libertad: 2.5% paralización INFOBRAS; 39.4% sobrecosto Invierte.

---

## 4. Marco CEPLAN (nacional)

| Nivel | SEG (pp) |
|---|---|
| GN | 18.4 |
| GR | 21.4 |

`GET /api/crossref/territorial?departamento=CUSCO`

---

## 5. Contexto geo comparado (verificado)

| Depto | Distritos | Aeropuertos | Puertos |
|---|---|---|---|
| **Cusco** | 112 | **27** | 1 |
| Cajamarca | 127 | 3 | 0 |
| La Libertad | 83 | 7 | 1 |
| Piura | 65 | 3 | 0 |
| Lambayeque | 38 | 1 | 1 |

**Nota:** 27 aeropuertos incluye aeródromos distritales en capa `cn_aeropuertosx` — no implica
hub internacional equivalente a Lima; validar categoría en atributos de capa.

---

## 6. Competitividad — marco contextual

- **Turismo:** principal motor exportador de servicios; estacionalidad y shocks (pandemia, conflictos)
  afectan ejecución de inversión en cultura/turismo.
- **Agro altoandino:** quinua, maíz, café en valles interandinos — complemento al turismo.
- **Complejidad territorial:** 112 distritos + 13 provincias — gobernanza similar a Cajamarca.

---

## 7. Indicadores derivados

```bash
npm run indicators:regional -- --departamento=CUSCO
```

---

## 8. Caveats

1. Aeropuertos CEPLAN ≠ conectividad turística internacional sin validar tipo de infraestructura.
2. Turismo puede concentrar inversión en función CULTURA/TURISMO — ver PBA post-ingesta.
3. Preflight PARCIAL hasta AL2-03.

## Reproducibilidad

- Turismo y desarrollo productivo: [`docs/analisis-cusco-turismo-desarrollo-2026-08.md`](analisis-cusco-turismo-desarrollo-2026-08.md)
- Índice: [`docs/indice-analisis-5-regiones-2026-08.md`](indice-analisis-5-regiones-2026-08.md)
