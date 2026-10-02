-- Denominador poblacional para tasas por 100k habitantes (SID-01 a SID-04).
-- NO es el censo INEI de población total: son los totales del padrón
-- electoral RENIEC 2026 (ciudadanos peruanos de 18+ años con DNI vigente),
-- la única fuente de población por departamento ya ingerida en Rastro con
-- datos reales y verificables (ver apps/reniec-padron). Excluye menores de
-- edad y extranjeros residentes, así que subestima la población total real
-- -- aceptable como denominador relativo para comparar un mismo
-- departamento contra sí mismo a través del tiempo, no para reportar
-- "población total" en términos absolutos.
--
-- Cifras reproducibles contra Neon (db reniec_padron):
--   SELECT departamento, SUM(cantidad) FROM padron_electoral_2026
--   GROUP BY departamento;
-- Lima se reparte en LIMA METROPOLITANA (provincia='Lima') y REGION LIMA
-- (las otras 9 provincias) para calzar con las etiquetas de departamento
-- que usa `police_reports` (SIDPOL), que no coinciden 1:1 con las de RENIEC
-- (sin tildes, Callao como "PROV. CONST. DEL CALLAO", Lima partido en dos).

CREATE TABLE IF NOT EXISTS poblacion_departamental (
  departamento TEXT PRIMARY KEY,
  poblacion INTEGER NOT NULL CHECK (poblacion > 0),
  fuente TEXT NOT NULL,
  vintage TEXT NOT NULL,
  observed_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO poblacion_departamental (departamento, poblacion, fuente, vintage, observed_at) VALUES
  ('AMAZONAS', 345245, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('ANCASH', 971385, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('APURIMAC', 361338, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('AREQUIPA', 1226525, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('AYACUCHO', 520238, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('CAJAMARCA', 1198773, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('CUSCO', 1133754, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('HUANCAVELICA', 339448, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('HUANUCO', 656517, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('ICA', 713997, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('JUNIN', 1062500, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('LA LIBERTAD', 1552691, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('LAMBAYEQUE', 1051350, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('LIMA METROPOLITANA', 7822555, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy; provincia=Lima)', '2026', CURRENT_DATE),
  ('REGION LIMA', 828473, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy; resto de provincias de Lima)', '2026', CURRENT_DATE),
  ('LORETO', 775923, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('MADRE DE DIOS', 147577, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('MOQUEGUA', 164628, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('PASCO', 223695, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('PIURA', 1534085, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('PROV. CONST. DEL CALLAO', 858968, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('PUNO', 963489, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('SAN MARTIN', 723605, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('TACNA', 302615, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('TUMBES', 181317, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE),
  ('UCAYALI', 453928, 'RENIEC - Padrón Electoral 2026 (18+ años, proxy)', '2026', CURRENT_DATE)
ON CONFLICT (departamento) DO NOTHING;
