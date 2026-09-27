# Indice de Vulnerabilidad Portuaria — Metodologia v1

> **Fuente:** Inventario MTC 2025 — Terminales Portuarios y Embarcaderos  
> **Version:** 1.0 — 2026-09-26

---

## 1. Objetivo

Cuantificar que tan expuesto esta un terminal portuario peruano a riesgos de abandono,
deterioro operativo o falta de supervision, usando unicamente el inventario disponible
del MTC (sin datos de volumen de carga de APN).

El resultado es un score donde **mas alto = mas vulnerable**.

---

## 2. Poblacion

Todos los terminales portuarios y embarcaderos del corte mas reciente disponible en
`terminales_portuarios` (fecha_corte = MAX). Total: 151 terminales.

---

## 3. Formula

```
score = estado_score    * 0.25
      + concesion_score * 0.20
      + alcance_score   * 0.15
      + ambito_score    * 0.10
      + geo_score       * 0.10
```

### 3.1 Scoring detallado por componente

| Campo fuente       | Valor encontrado              | Score base | Peso  |
|--------------------|-----------------------------|------------|-------|
| **estado_conservacion** | "Bueno"                     | 10         | 25%   |
|                    | "Regular"                   | 25         |       |
|                    | "Malo"                      | 50         |       |
|                    | "Muy malo"                  | 75         |       |
|                    | null / "Informacion no disponible" | 50   |       |
| **es_concesionado**    | true                        | 5          | 20%   |
|                    | false / null                | 30         |       |
| **alcance**             | "Nacional"                  | 5          | 15%   |
|                    | "Regional"                  | 15         |       |
|                    | "Local"                     | 25         |       |
|                    | null                        | 20         |       |
| **ambito**               | "Maritimo"                  | 15         | 10%   |
|                    | "Fluvial"                   | 20         |       |
|                    | "Lacustre"                  | 10         |       |
|                    | null                        | 15         |       |
| **geolocalizacion**     | true (lat y long presentes) | 0          | 10%   |
|                    | false (falta al menos una) | 20         |       |

### 3.2 Razonamiento de cada componente

**Estado de conservacion (25%)**  
El indicador mas directo de riesgo operativo. Mal estado = mayor probabilidad de deterioro acelerado.
"Regular" se trata como riesgo medio-alto (25 pts) para forzar atencion.
El default de 50 para null reconoce que **dato faltante es riesgo, no seguridad**.

**Concesion (20%)**  
Terminales concedidos tienen contratos de mantenimiento con supervision contractual.
Operadores estatales/municipales tienden a menor mantenimiento sostenido.
El gap de 25 puntos (5 vs 30) refleja esa diferencia institucional.

**Alcance geografico (15%)**  
Terminales de alcance Nacional tienen importancia estrategica y presupuestal.
Alcance Local en zonas rurales/aisladas son los que tipicamente se abandonan primero.

**Ambito (10%)**  
Fluvial (Amazonia/Loreto) presenta los mayores desafios logisticos y de supervision.
Maritimo tiene mas visibilidad y trafico, lo que incentiva mantenimiento.
Lacustre (Titicaca) es un caso intermedio.

**Geolocalizacion (10%)**  
Si un terminal no tiene coordenadas en el inventario, no puede:
- Ser supervisado remotamente por satelite
- Ser incluido en mapas oficiales de inversion
- Ser cruzado con datos de Prefecturas u otras agencias
- Ser visitado sin conocimiento previo de ubicacion exacta

El score de 20 puntos para "sin geo" refleja ese riesgo sistemico de invisibilidad.

---

## 4. Resultados observados

| Metrica                          | Valor    |
|----------------------------------|----------|
| Total terminales indexados       | 151      |
| Score promedio                   | 16.58    |
| Mediana                          | 16.50    |
| Score minimo                     | 5.75     |
| Score maximo                     | 22.75    |

### Top vulnerable: 50 terminales con score 22.75

Todos fluviales en Loreto (UBIGEO 16) y Ucayali (UBIGEO 25), sin geo,
no concedidos, estado "Informacion no disponible" o "Malo".

La combinacion perfecta de vulnerabilidad:
- estado=50 + concesion=30 + alcance=15 + ambito=20 + geo=0
- Score: 50*0.25 + 30*0.20 + 15*0.15 + 20*0.10 + 0*0.10 = **22.75**

### Mas resilientes: 8 terminales con score 5.75

Todos maritimos, concedidos, estado Bueno, alcance Nacional, con geo:
- Callao (3 terminales del TC), Matarani, Salaverry, Paita, Pisco, San Martin

La combinacion perfecta de resiliencia:
- estado=10 + concesion=5 + alcance=5 + ambito=15 + geo=0
- Score: 10*0.25 + 5*0.20 + 5*0.15 + 15*0.10 + 0*0.10 = **5.75**

---

## 5. Limitaciones de la metodologia v1

| Limitacion                       | Impacto                                   |
|----------------------------------|-------------------------------------------|
| No incluye volumen de carga       | Puerto sin uso puede ser menos prioritario |
| No incluye datos de Prefecturas  | No sabemos si la DIC esta operativa       |
| No incluye ingresos o presupuesto | No sabemos cuanto invierte el operador    |
| Scoring ordinal, no cardinal      | "Bueno"=10 es convencion, no medicion     |
| No hay validacion de campo       | Datos son lo que reporta el MTC           |

---

## 6. Archivos generados

- `docs/indice-vulnerabilidad-portuaria-v1.csv` — tabla completa con desglose por componente
- `src/db/migrations/002_indice_vulnerabilidad_portuaria.sql` — schema
- `src/routes/vulnerabilidad-portuaria.ts` — API + logica de calculo
- `__tests__/vulnerabilidad.test.ts` — tests (8/8 passing)
