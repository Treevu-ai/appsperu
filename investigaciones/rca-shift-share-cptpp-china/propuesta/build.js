const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType,
} = require("docx");

const TABLE_WIDTH = 9360; // DXA, ~6.5in usable width on A4 with default margins

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: "2F5496" },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF" })] })],
  });
}

function cell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun({ text })] })],
  });
}

function table(headers, rows, widths) {
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ children: headers.map((h, i) => headerCell(h, widths[i])), tableHeader: true }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, widths[i])) })),
    ],
  });
}

function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } });
}
function h3(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } });
}
function p(text, opts = {}) {
  return new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 160 } });
}
function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 80 } });
}

const doc = new Document({
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 } } }, // A4
      children: [
        new Paragraph({
          children: [new TextRun({
            text: "Espacio de productos frente a gobernanza institucional en la diversificación exportadora peruana hacia CPTPP y China",
            bold: true, size: 32,
          })],
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: "De una hipótesis de gobernanza a una hipótesis de capacidades: evidencia 2015-2024",
            italics: true, size: 24, color: "444444",
          })],
          spacing: { after: 300 },
        }),

        h2("Pregunta de investigación"),
        p("La pregunta original de este proyecto era si la calidad institucional modera el componente de competitividad real del crecimiento exportador peruano. Cuatro pruebas independientes, bajo el estimador econométrico correcto (PPML) y con los datos de comercio depurados de minerales, metales preciosos y combustibles, no encontraron evidencia de que así sea — ver \"Resultados preliminares\". La pregunta que este proyecto responde ahora es distinta: si no es la gobernanza del socio, ¿qué explica qué productos logra diversificar Perú hacia los mercados de CPTPP y China? La hipótesis que se sostiene con evidencia es la de capacidades productivas — el espacio de productos de Hidalgo y Hausmann (2007, 2009) — no la de calidad institucional del destino."),

        h2("Justificación"),
        p("Perú ha incrementado su participación exportadora en la última década sin una mejora correspondiente en sus indicadores de gobernanza (control de corrupción, estabilidad política, estado de derecho, calidad regulatoria, efectividad gubernamental, voz y rendición de cuentas). Esa disociación motivó la pregunta original del proyecto. La investigación empírica, documentada en detalle en el README del repositorio y resumida en la siguiente sección, mostró que la asociación entre gobernanza y exportaciones que aparecía bajo MCO log-lineal —el estimador que usa buena parte de la literatura aplicada citada originalmente (Abreo Villamizar et al. 2021; Riker 2022)— no sobrevive a PPML (Santos Silva y Tenreyro, 2006), el estimador consistente bajo heterocedasticidad. En cambio, la densidad del espacio de productos —qué tan cerca está un producto de lo que Perú ya sabe producir bien— predice con solidez qué productos nuevos logra exportar Perú, inclusive dentro del panel bilateral restringido a CPTPP y China. Separar un canal real de un artefacto de estimación tiene implicancias directas de política: si el canal es institucional, la política relevante es la reforma regulatoria del socio; si el canal es de capacidades, la política relevante es la diversificación productiva interna."),

        h2("Objetivos"),
        p("General: determinar si la diversificación exportadora peruana hacia los países del CPTPP y China responde a la calidad institucional del socio o a la proximidad de capacidades productivas (espacio de productos).", { bold: false }),
        bullet("Calcular la ventaja comparativa revelada por partida arancelaria y país, 2015-2024 (completado)."),
        bullet("Descomponer el crecimiento exportador en sus componentes de demanda mundial, composición estructural y competitividad real (completado)."),
        bullet("Estimar el efecto de las seis dimensiones de gobernanza (WGI) sobre la competitividad exportadora bajo el estimador correcto (PPML) y con los datos depurados de commodities (completado — resultado nulo en las cuatro pruebas, ver abajo)."),
        bullet("Estimar si la densidad del espacio de productos predice la diversificación exportadora de Perú, en general y específicamente hacia CPTPP y China (completado — resultado positivo y robusto, ver abajo)."),

        h2("Marco metodológico: análisis comparativo de cuatro enfoques"),
        table(
          ["Metodología", "Descripción", "Rol en el proyecto"],
          [
            [
              "Ventaja Comparativa Revelada (Balassa, 1965)",
              "Índice de especialización relativa: participación de un producto en las exportaciones de un país frente a su participación en el comercio mundial.",
              "Panorama descriptivo inicial e insumo del espacio de productos (define qué productos tienen RCA≥1).",
            ],
            [
              "Cuota de Mercado Constante / Shift-Share (Tyszynski, 1951; Leamer y Stern, 1970)",
              "Descompone el crecimiento exportador en demanda mundial, composición estructural y competitividad real (residual).",
              "Primer resultado real del proyecto (demanda 40%, estructura 19%, competitividad real 41% del crecimiento 2015-2024), pero el panel bilateral chico (12 socios) resultó sin poder estadístico suficiente para el análisis de gobernanza.",
            ],
            [
              "Modelo de Gravedad del Comercio, PPML (Tinbergen 1962; Santos Silva y Tenreyro 2006)",
              "Explica los flujos bilaterales por tamaño económico y resistencia (distancia, idioma, frontera), estimado por pseudo-máxima verosimilitud de Poisson, no por MCO sobre el logaritmo.",
              "Metodología central del proyecto. La especificación OLS log-lineal usada en una primera vuelta producía 6/6 dimensiones WGI significativas; bajo PPML, el estimador consistente, ninguna sobrevive (0/6) — ver Resultados preliminares.",
            ],
            [
              "Espacio de Productos (Hidalgo, Klinger, Barabási y Hausmann, 2007; Hidalgo y Hausmann, 2009)",
              "Red de proximidad entre productos basada en co-exportación mundial; la densidad de un producto respecto a la canasta exportadora de un país predice la probabilidad de que ese país lo adquiera.",
              "Hipótesis alternativa que sí encuentra soporte empírico robusto — ver Resultados preliminares.",
            ],
          ],
          [2400, 3600, 3360]
        ),
        p(""),
        p("Metodología seleccionada: modelo de gravedad PPML sobre el panel bilateral de todos los socios comerciales reales de Perú (no solo CPTPP+China) como diseño central, con la densidad del espacio de productos como variable de interés y la gobernanza (WGI) como variable de control que la literatura previa sugería relevante. El shift-share y la ventaja comparativa revelada quedan como insumos descriptivos y como fuente de la variable de densidad, no como la técnica de identificación principal — a diferencia del diseño original de la propuesta."),

        h2("Datos"),
        p("Serie 2015-2024 de indicadores del Banco Mundial (PIB, población y las seis dimensiones de gobernanza WGI) y comercio bilateral de CEPII BACI (vintage 202601) — no Comtrade, cuya extracción se abandonó por límites de cuota con esperas de hasta 52 minutos por lote. El panel de gravedad principal cubre los 184 socios comerciales reales de Perú, no solo los de CPTPP y China; el panel a nivel de producto (HS4, usado para la densidad y el panel bilateral del Pilar B) se restringe a CPTPP y China. CEPII GeoDist aporta distancia, frontera, idioma oficial común y relación colonial. La intensidad contractual de Nunn (2007) y la clasificación de Rauch (1999) se incorporaron para la prueba de exposición diferencial (H3), con resultado nulo — ver abajo."),

        h2("Resultados preliminares"),
        h3("Lo que no se sostuvo: cuatro pruebas de la hipótesis de gobernanza"),
        p("Las cuatro formas en que el proyecto probó la hipótesis original —nivel promedio de WGI, las seis dimensiones de WGI por separado, la interacción gobernanza × intensidad contractual (diseño H3 de exposición diferencial), y un diseño de diferencias-en-diferencias alrededor de la entrada en vigor del CPTPP (set. 2021)— no sobreviven bajo PPML y datos de comercio depurados de minerales (HS26), metales preciosos (HS71) y combustibles (HS27). La tabla siguiente resume el patrón:"),
        table(
          ["Hipótesis", "Bajo OLS log-lineal (diseño original)", "Bajo PPML (estimador correcto)"],
          [
            ["WGI promedio explica exportaciones", "+0.667, p<0.001 (n=1,496)", "+0.150, p=0.35 (misma submuestra exacta)"],
            ["Las 6 dimensiones WGI por separado", "6 de 6 positivas y significativas, p<0.001", "0 de 6 significativas al 5% (la más cercana, estabilidad política, p=0.05)"],
            ["Gobernanza × intensidad contractual (Nunn)", "—", "Nulo o signo contrario a la teoría (interacción negativa, p=0.014 a nivel HS6)"],
            ["DiD de entrada en vigor del CPTPP", "cp_post +0.145, p=0.043 (exportaciones totales)", "+0.154 a +0.167, p=0.11-0.16 (sin commodities, sin hubs de reexportación)"],
          ],
          [3200, 3200, 2960]
        ),
        p(""),
        p("El diagnóstico de por qué: sin controlar por PIB del socio, el WGI promedio sube a +0.658 (p=0.07) — buena parte de lo que el OLS original capturaba como \"efecto de gobernanza\" era el nivel de desarrollo del socio, correlacionado con su puntaje WGI. El VIF de todas las variables es inferior a 2.2 en todas las especificaciones, lo que descarta multicolinealidad como explicación — el problema es el estimador, no la estructura de los regresores."),

        h3("Lo que sí se sostuvo: el espacio de productos"),
        p("Se probó la hipótesis alternativa de dos formas independientes, ambas con resultado positivo y robusto a la misma depuración de commodities que eliminó el efecto de gobernanza:"),
        bullet("Prueba clásica (Hidalgo-Hausmann): de los 1,053 productos HS4 que Perú no exportaba con ventaja comparativa revelada en 2015, la densidad de espacio de productos en 2015 predice cuáles logró adquirir para 2024 (logit, coeficiente 26.8, p<0.001; 25.9, p=0.002 excluyendo commodities)."),
        bullet("Panel bilateral PPML, socios de CPTPP y China, productos no-commodity, 2016-2024: la densidad del producto es el predictor más fuerte del panel (coeficiente 5.68, p<0.001), controlando por PIB del socio, distancia, frontera e idioma común. El WGI promedio en esta muestra acotada (11 socios) sale significativo pero con signo negativo — inestable dado el número reducido de clusters, no se interpreta como evidencia de que la gobernanza perjudique."),

        h2("Rigor metodológico para revisión por pares"),
        bullet("Endogeneidad: gobernanza (t-1) como predictor de competitividad (t); batería completa de pruebas (rezago t-2, primeras diferencias, precedencia inversa) ya implementada sobre el panel de gravedad grande — la asociación en niveles sobrevive al rezago más largo pero no a primeras diferencias, con causalidad reversa significativa, por lo que incluso antes de la corrección PPML ya se reportaba como asociación, nunca como efecto causal."),
        bullet("Corrección de medición: exclusión declarada a priori (no derivada de los residuos) de capítulos arancelarios de commodities y de la lista estándar de la literatura de hubs de reexportación, para evitar que la geografía de la refinación de metales y el tránsito portuario contamine los coeficientes de gravedad."),
        bullet("Posicionamiento en la literatura: la elección de PPML sobre MCO log-lineal sigue a Santos Silva y Tenreyro (2006); la hipótesis de capacidades sigue a Hidalgo, Klinger, Barabási y Hausmann (2007) y Hidalgo y Hausmann (2009)."),

        h2("Plan de trabajo"),
        bullet("Extracción y validación de series WDI, WGI y BACI (completado)."),
        bullet("Cálculo de ventaja comparativa revelada por partida y país, 2015 frente a 2024 (completado)."),
        bullet("Descomposición shift-share del crecimiento exportador (completado)."),
        bullet("Modelo de gravedad PPML, panel mundial de socios reales, con y sin dimensiones WGI (completado — resultado nulo bajo PPML)."),
        bullet("Batería de endogeneidad y prueba H3 de exposición diferencial (intensidad contractual x gobernanza) (completado — resultado nulo o contrario a la teoría)."),
        bullet("Depuración de commodities (HS26/71/27) y hubs de reexportación en el panel de gravedad y en el DiD del CPTPP (completado — confirma que el patrón nulo de gobernanza no es un artefacto de medición)."),
        bullet("Cálculo de ECI/PCI y densidad del espacio de productos; prueba clásica de predicción de diversificación (completado — resultado positivo y robusto)."),
        bullet("Panel bilateral PPML de densidad vs. WGI, socios CPTPP+China (completado — densidad robusta, WGI no)."),
        bullet("Redacción del artículo con la estructura de dos pilares (metodológico + espacio de productos) — en curso."),
        bullet("Extender el panel de densidad bilateral al universo completo de socios (no solo CPTPP+China), para una prueba de robustez fuera de muestra."),
        bullet("Visualización del espacio de productos de Perú (mapa de red) para la sección de hallazgos."),

        h2("Cronograma"),
        table(
          ["Etapa", "Duración"],
          [
            ["Análisis de datos (gravedad PPML, H3, DiD, espacio de productos)", "completado"],
            ["Redacción del artículo con la nueva estructura de dos pilares", "1-2 meses"],
            ["Revisión interna y robustez adicional (panel de densidad fuera de muestra)", "1 mes"],
            ["Primera ronda de revisión por pares", "4-10 meses"],
            ["Rondas adicionales (típico 2-4 en total)", "variable"],
            ["Total estimado hasta aceptación", "9-15 meses desde el envío"],
          ],
          [5360, 4000]
        ),

        h2("Revistas objetivo"),
        bullet("International Journal of Emerging Markets (Scopus/SSCI) — sigue vigente: mercados emergentes y competitividad exportadora."),
        bullet("Journal of Economic Structures (Scopus) — encaja mejor que antes: publica trabajo aplicado de espacio de productos/complejidad económica."),
        bullet("The Journal of International Trade & Economic Development (Scopus/SSCI) — encaja con el diseño de gravedad PPML y el enfoque bilateral CPTPP/China."),
        p("Nota: la lista de 2026-10-15 incluía Review of International Business and Strategy, orientada a estrategia de negocio internacional; con el giro hacia espacio de productos y gravedad PPML, se reemplaza por una revista más alineada al método.", { italics: true }),

        h2("Fuentes metodológicas"),
        p("Balassa, B. (1965). Trade Liberalisation and “Revealed” Comparative Advantage. The Manchester School, 33(2), 99-123."),
        p("Tinbergen, J. (1962). Shaping the World Economy: Suggestions for an International Economic Policy. The Twentieth Century Fund."),
        p("Tyszynski, H. (1951). World Trade in Manufactured Commodities, 1899-1950. Manchester School of Economic and Social Studies, 19(3), 272-304; refinamiento en Leamer, E. E., y Stern, R. M. (1970). Quantitative International Economics."),
        p("Santos Silva, J. M. C., y Tenreyro, S. (2006). The Log of Gravity. Review of Economics and Statistics, 88(4), 641-658. DOI: 10.1162/rest.88.4.641"),
        p("Hidalgo, C. A., Klinger, B., Barabási, A.-L., y Hausmann, R. (2007). The Product Space Conditions the Development of Nations. Science, 317(5837), 482-487. DOI: 10.1126/science.1144581"),
        p("Hidalgo, C. A., y Hausmann, R. (2009). The Building Blocks of Economic Complexity. Proceedings of the National Academy of Sciences, 106(26), 10570-10575. DOI: 10.1073/pnas.0900943106"),
        p("Nunn, N. (2007). Relationship-Specificity, Incomplete Contracts, and the Pattern of Trade. Quarterly Journal of Economics, 122(2), 569-600. DOI: 10.1162/qjec.122.2.569"),
        p("Rauch, J. E. (1999). Networks Versus Markets in International Trade. Journal of International Economics, 48(1), 7-35."),
        p("Abreo Villamizar, C. A., Bustillo, G., y Rodríguez González, J. (2021). Journal of Economic Structures, 10:28."),
        p("Riker, D. (2022). USITC Working Paper 2022-10-A."),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  require("fs").writeFileSync("Propuesta-Gobernanza-Competitividad-CPTPP.docx", buf);
  console.log("Escrito Propuesta-Gobernanza-Competitividad-CPTPP.docx");
});
