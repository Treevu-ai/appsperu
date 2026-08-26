# Análisis — Agro e hidráulica: Piura (2026-08)

Memo sector focal Piura — **agro costero e infraestructura hidráulica**, ticket AL2-28.

## Resumen ejecutivo

| Fuente | Estado |
|---|---|
| ceplan-geo territorio | ✅ 65 distritos |
| ceplan-geo puertos | ✅ 0 en polígono dept. |
| Red hídrica `cb_redhidricaprinx` | 🟡 ingesta MVP pendiente |
| INFOBRAS / Invierte riego | ⏸ PENDIENTE_INGESTA |
| **Preflight** | **🟡 PARCIAL** |

---

## 1. Contexto hidráulico (marco público, no DB)

Piura concentra cuencas costeras (Chira, Piura, Zaña) con alta exposición a **El Niño**. La
gestión de infraestructura de riego y defensa ribereña es eje de competitividad agroexportadora.

**Distinción geográfica:** el Proyecto Especial **Chavimochic** opera principalmente en La
Libertad (valle Virú/Chao/Moche) pero articula dinámica hidráulica del norte — no confundir
sede administrativa con impacto hidrológico en Piura. Para Piura, priorizar proyectos **Chira-Piura**
y riego de valle bajo en ingesta Invierte/INFOBRAS.

---

## 2. Territorio verificado (ceplan-geo)

| Métrica | Valor |
|---|---|
| Distritos | 65 |
| Aeropuertos | 3 |
| Puertos (CEPLAN WFS) | 0 |

```bash
curl "http://localhost:4005/api/territories/summary?departamento=PIURA"
```

---

## 3. Red hídrica CEPLAN — spike

| Capa | Decisión |
|---|---|
| `cb_redhidricax` (345k) | POSPONER |
| `cb_redhidricaprinx` (1,744) | AUTOMATIZABLE |

Filtro departamental post-ingesta: `iddpto = '20'` o intersección espacial con `territories`.

---

## 4. Obras riego INFOBRAS — pendiente

```bash
INFOBRAS_DEPARTAMENTOS=PIURA npm run ingest:infobras
```

Métricas objetivo (réplica memo LL):

- Obras riego por provincia
- % paralizadas
- Avance físico promedio
- Correlación con eventos climáticos en causales de paralización

**Expectativa a validar:** mayor incidencia climática que Lambayeque en causales de parálisis.

---

## 5. Inversión hidráulica Invierte — pendiente

```sql
-- Post-ingesta
SELECT COUNT(*), SUM(costo_actualizado)
FROM investments
WHERE departamento = 'PIURA'
  AND (nombre ILIKE '%RIEGO%' OR nombre ILIKE '%IRRIGAC%' OR nombre ILIKE '%HIDRA%')
  AND estado NOT ILIKE '%cerrado%';
```

---

## 6. Capas `ip_prysecagr` (geo)

28 features nacionales con `departamen` — cruce exploratorio; universo pequeño vs Invierte.

---

## 7. Indicadores y crossref

```bash
npm run indicators:regional -- --departamento=PIURA
curl "http://localhost:4004/api/crossref/territorial?departamento=PIURA"
```

---

## 8. Caveats

1. Hidráulica mayor puede no aparecer en cartera **activa** Invierte.
2. 0 puertos en geo — validar Paita/San Andrés contra fuente MTC si el análisis logístico es central.
3. Proxy SEG dept requiere MEF+INFOBRAS — no disponible en esta corrida.

## Reproducibilidad

- Spike: [`docs/spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md`](spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md)
- Memo brechas: [`docs/analisis-piura-2026-08.md`](analisis-piura-2026-08.md)
