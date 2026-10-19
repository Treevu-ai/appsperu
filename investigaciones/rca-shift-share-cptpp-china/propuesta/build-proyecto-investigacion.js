const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType,
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
function h1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 } });
}
function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 } });
}
function p(text, opts = {}) {
  return new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 160 } });
}
function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 80 } });
}
function numbered(items) {
  return items.map((text, i) => new Paragraph({
    children: [new TextRun({ text: `${i + 1}. ${text}` })],
    spacing: { after: 100 },
  }));
}

const doc = new Document({
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 } } }, // A4
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "PROYECTO DE INVESTIGACIÓN", bold: true, size: 22, color: "666666" })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: "Capacidades productivas frente a gobernanza institucional en la diversificación exportadora peruana hacia CPTPP y China",
            bold: true, size: 32,
          })],
          spacing: { after: 100 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: "Un modelo de gravedad bilateral con corrección econométrica y una hipótesis alternativa de espacio de productos, 2015-2024",
            italics: true, size: 24, color: "444444",
          })],
          spacing: { after: 300 },
        }),

        table(
          ["Campo", "Detalle"],
          [
            ["Investigador responsable", "Ricardo Cuba, economista · Asistente de investigación, CIUP"],
            ["Investigador invitado / colaboración propuesta", "Oscar Malca, Vicedecano de Negocios Internacionales, CIUP — Universidad del Pacífico"],
            ["Línea de investigación", "Comercio internacional, competitividad exportadora y acuerdos comerciales (CPTPP, China)"],
            ["Unidad proponente", "CIUP — Universidad del Pacífico"],
            ["Período de análisis de los datos", "2015-2024"],
            ["Estado del proyecto", "Análisis de datos completado; redacción del artículo en curso"],
            ["Fecha", "Octubre de 2026"],
          ],
          [3200, 6160]
        ),

        h1("1. Resumen ejecutivo"),
        p("Perú ha incrementado su participación exportadora hacia los socios del CPTPP y hacia China en la última década sin una mejora correspondiente en sus indicadores de gobernanza. Este proyecto examina si la calidad institucional del socio comercial explica esa dinámica, usando un modelo de gravedad bilateral con el estimador econométrico correcto para datos de comercio con ceros (PPML, Santos Silva y Tenreyro 2006) sobre datos depurados de minerales, metales preciosos y combustibles. La hipótesis de gobernanza, que bajo un estimador de mínimos cuadrados log-lineal aparecía robusta (coeficiente +0.667, p<0.001), no sobrevivió a la corrección metodológica en ninguna de cuatro pruebas independientes. En su lugar, se encontró evidencia robusta de que la diversificación exportadora peruana responde a la cercanía productiva del espacio de productos (Hidalgo y Hausmann, 2007, 2009): la densidad de un producto en la canasta exportadora de Perú predice con solidez estadística (p<0.001) tanto qué productos nuevos logra exportar como, específicamente, qué le vende a los socios de CPTPP y China. El proyecto propone continuar esta línea como una colaboración con el Dr. Oscar Malca, cuya investigación sobre oportunidades comerciales del TPP (2016) y de Asia-Pacífico (2019) motivó originalmente esta pregunta."),

        h1("2. Planteamiento del problema"),
        p("La literatura aplicada sobre comercio internacional atribuye con frecuencia el desempeño exportador de un país hacia mercados específicos a la calidad institucional de esos mercados — control de la corrupción, estado de derecho, calidad regulatoria, efectividad gubernamental. Esta atribución, sin embargo, suele basarse en especificaciones de mínimos cuadrados sobre el logaritmo de las exportaciones, un estimador que la literatura econométrica (Santos Silva y Tenreyro, 2006) ha mostrado que sobrestima sistemáticamente los coeficientes de gravedad cuando el comercio bilateral incluye observaciones en cero y cuando la muestra no se depura de productos cuya geografía de extracción, refinación o reexportación no refleja relaciones comerciales reales (oro refinado en Suiza, cobre fundido en Namibia, tránsito por hubs como Róterdam o Singapur)."),
        p("El problema concreto que aborda este proyecto es doble: (1) ¿sobrevive la asociación entre gobernanza del socio y desempeño exportador peruano hacia CPTPP y China cuando se corrige el estimador y se depura la muestra de estos sesgos conocidos?; y (2) si no sobrevive, ¿qué explica entonces qué productos nuevos logra exportar Perú y hacia qué socios?"),

        h1("3. Justificación"),
        p("Perú ha incrementado su participación exportadora en la última década sin una mejora correspondiente en sus indicadores de gobernanza (control de la corrupción, estabilidad política, estado de derecho, calidad regulatoria, efectividad gubernamental, voz y rendición de cuentas). Esa disociación motivó la pregunta original del proyecto. La investigación documentada en este expediente mostró que la asociación entre gobernanza y exportaciones que aparece bajo MCO log-lineal —el estimador que usa buena parte de la literatura aplicada citada originalmente (Abreo Villamizar et al. 2021; Riker 2022)— no sobrevive a PPML, el estimador consistente bajo heterocedasticidad. En cambio, la densidad del espacio de productos —qué tan cerca está un producto de lo que Perú ya sabe producir bien— predice con solidez qué productos nuevos logra exportar Perú, inclusive dentro del panel bilateral restringido a CPTPP y China."),
        p("Separar un canal real de un artefacto de estimación tiene implicancias directas de política: si el canal es institucional, la política relevante es la reforma regulatoria del socio — algo fuera del control directo de Perú; si el canal es de capacidades, la política relevante es la diversificación productiva interna, un terreno donde sí existe margen de acción nacional (CITE, parques industriales, articulación de cadenas productivas, programas de promoción de exportaciones)."),

        h1("4. Marco teórico y antecedentes"),
        p("El proyecto se apoya en cuatro cuerpos de literatura:"),
        bullet("Ventaja comparativa revelada (Balassa, 1965) y descomposición shift-share del crecimiento exportador (Tyszynski, 1951; Leamer y Stern, 1970) — insumos descriptivos iniciales."),
        bullet("El modelo de gravedad del comercio (Tinbergen, 1962) y su tratamiento econométrico correcto mediante pseudo-máxima verosimilitud de Poisson en vez de MCO sobre el logaritmo (Santos Silva y Tenreyro, 2006) — la corrección metodológica central del proyecto."),
        bullet("La literatura específica sobre gobernanza y desempeño exportador que motivó la hipótesis original, incluyendo los antecedentes directos de este proyecto: Abreo Villamizar, Bustillo y Rodríguez González (2021, Journal of Economic Structures) y Riker (2022, USITC Working Paper), además de la exposición diferencial por intensidad contractual (Nunn, 2007) y la clasificación de bienes diferenciados (Rauch, 1999) usadas para una prueba adicional de robustez."),
        bullet("El espacio de productos y la complejidad económica (Hidalgo, Klinger, Barabási y Hausmann, 2007; Hidalgo y Hausmann, 2009) — el marco teórico de la hipótesis alternativa que sí encontró soporte empírico."),
        p("El proyecto se ancla además en la línea de investigación del Dr. Oscar Malca sobre oportunidades comerciales de Perú en Asia-Pacífico: \"Análisis e Identificación de las Potenciales Oportunidades Comerciales con Países miembros del TPP\" (2016, Journal of Business, Universidad del Pacífico) y \"América Latina y Asia Pacífico\" (2019), que plantean directamente la pregunta de qué determina el aprovechamiento peruano de estos acuerdos."),

        h1("5. Objetivos"),
        h2("5.1 Objetivo general"),
        p("Determinar si la diversificación exportadora peruana hacia los países del CPTPP y hacia China responde a la calidad institucional del socio comercial o a la proximidad de capacidades productivas (espacio de productos), bajo un diseño econométrico que corrige los sesgos conocidos de la literatura aplicada previa."),
        h2("5.2 Objetivos específicos"),
        ...numbered([
          "Calcular la ventaja comparativa revelada por partida arancelaria y país para Perú, 2015-2024.",
          "Descomponer el crecimiento exportador peruano en sus componentes de demanda mundial, composición estructural y competitividad real (shift-share).",
          "Estimar el efecto de la gobernanza (promedio WGI y sus seis dimensiones) sobre las exportaciones peruanas mediante un modelo de gravedad PPML, con y sin depuración de commodities y hubs de reexportación.",
          "Probar la hipótesis de exposición diferencial (gobernanza × intensidad contractual, Nunn 2007) y un diseño de diferencias-en-diferencias alrededor de la entrada en vigor del CPTPP.",
          "Calcular los índices de complejidad económica (ECI/PCI) y la densidad del espacio de productos para Perú, y probar si predicen qué productos nuevos logra exportar.",
          "Estimar un panel bilateral producto×socio×año restringido a CPTPP y China que compare directamente el poder explicativo de la densidad del espacio de productos frente al de la gobernanza.",
        ]),

        h1("6. Hipótesis"),
        p("H1 (gobernanza, hipótesis original): la calidad institucional del socio comercial, medida por los Worldwide Governance Indicators del Banco Mundial, tiene un efecto positivo y estadísticamente significativo sobre las exportaciones bilaterales de Perú, controlando por los determinantes estándar de gravedad (PIB del socio, distancia, frontera, idioma, historia colonial)."),
        p("H2 (espacio de productos, hipótesis alternativa): la densidad del espacio de productos —la cercanía de un producto a la canasta exportadora que Perú ya domina— predice qué productos nuevos logra exportar Perú y hacia qué socios, independientemente de la gobernanza del destino."),
        p("Resultado: H1 se rechaza bajo el estimador correcto (PPML) en las cuatro pruebas realizadas (sección 8); H2 se confirma en las dos pruebas independientes realizadas (sección 8)."),

        h1("7. Metodología"),
        h2("7.1 Datos"),
        p("Serie 2015-2024 de indicadores del Banco Mundial (PIB, población y las seis dimensiones de gobernanza WGI) y comercio bilateral de CEPII BACI (vintage 202211) — no Comtrade, cuya extracción se abandonó por límites de cuota con esperas de hasta 52 minutos por lote. El panel de gravedad principal cubre los 184 socios comerciales reales de Perú, no solo los de CPTPP y China; el panel a nivel de producto (HS4), usado para la densidad y el panel bilateral del Pilar B, se restringe a CPTPP y China. CEPII GeoDist aporta distancia, frontera, idioma oficial común y relación colonial. La intensidad contractual de Nunn (2007) y la clasificación de Rauch (1999) se incorporaron para la prueba de exposición diferencial."),
        h2("7.2 Técnicas"),
        table(
          ["Metodología", "Descripción", "Rol en el proyecto"],
          [
            ["Ventaja Comparativa Revelada (Balassa, 1965)", "Índice de especialización relativa: participación de un producto en las exportaciones de un país frente a su participación en el comercio mundial.", "Panorama descriptivo inicial e insumo del espacio de productos (define qué productos tienen RCA≥1)."],
            ["Cuota de Mercado Constante / Shift-Share (Tyszynski, 1951; Leamer y Stern, 1970)", "Descompone el crecimiento exportador en demanda mundial, composición estructural y competitividad real (residual).", "Primer resultado real del proyecto (demanda 40%, estructura 19%, competitividad real 41% del crecimiento 2015-2024)."],
            ["Modelo de Gravedad del Comercio, PPML (Tinbergen 1962; Santos Silva y Tenreyro 2006)", "Explica los flujos bilaterales por tamaño económico y resistencia (distancia, idioma, frontera), estimado por pseudo-máxima verosimilitud de Poisson, no por MCO sobre el logaritmo.", "Metodología central del proyecto. La especificación OLS log-lineal producía 6/6 dimensiones WGI significativas; bajo PPML, ninguna sobrevive."],
            ["Espacio de Productos (Hidalgo, Klinger, Barabási y Hausmann, 2007; Hidalgo y Hausmann, 2009)", "Red de proximidad entre productos basada en co-exportación mundial; la densidad de un producto respecto a la canasta exportadora de un país predice la probabilidad de que ese país lo adquiera.", "Hipótesis alternativa que sí encuentra soporte empírico robusto."],
          ],
          [2600, 3680, 3080]
        ),

        h1("8. Resultados preliminares"),
        h2("8.1 Lo que no se sostuvo: cuatro pruebas de la hipótesis de gobernanza"),
        p("Las cuatro formas en que el proyecto probó la hipótesis original —nivel promedio de WGI, las seis dimensiones de gobernanza por separado, la interacción gobernanza × intensidad contractual (diseño H3 de exposición diferencial), y un diseño de diferencias-en-diferencias alrededor de la entrada en vigor del CPTPP (set. 2021)— no sobreviven bajo PPML y datos de comercio depurados de minerales (HS26), metales preciosos (HS71) y combustibles (HS27):"),
        table(
          ["Hipótesis", "Bajo OLS log-lineal (diseño original)", "Bajo PPML (estimador correcto)"],
          [
            ["WGI promedio explica exportaciones", "+0.667, p<0.001 (n=1,496)", "+0.150, p=0.35 (misma submuestra exacta)"],
            ["Las 6 dimensiones WGI por separado", "6 de 6 positivas y significativas, p<0.001", "0 de 6 significativas al 5% (la más cercana, estabilidad política, p=0.05)"],
            ["Gobernanza × intensidad contractual (Nunn)", "—", "Nulo o signo contrario a la teoría (interacción negativa, p=0.014 a nivel HS6)"],
            ["DiD de entrada en vigor del CPTPP", "cp_post +0.145, p=0.043 (exportaciones totales)", "+0.154 a +0.167, p=0.11-0.16 (sin commodities, sin hubs de reexportación)"],
          ],
          [2600, 3680, 3080]
        ),
        p("El diagnóstico de por qué: sin controlar por PIB del socio, el WGI promedio sube a +0.658 (p=0.07) bajo PPML — buena parte de lo que el OLS original capturaba como \"efecto de gobernanza\" era el nivel de desarrollo del socio, correlacionado con su puntaje WGI. El VIF de todas las variables es inferior a 2.2 en todas las especificaciones, lo que descarta multicolinealidad como explicación — el problema es el estimador, no la estructura de los regresores."),
        h2("8.2 Lo que sí se sostuvo: el espacio de productos"),
        p("Se probó la hipótesis alternativa de dos formas independientes, ambas con resultado positivo y robusto a la misma depuración de commodities que eliminó el efecto de gobernanza:"),
        bullet("Prueba clásica (Hidalgo-Hausmann): de los 1,053 productos HS4 que Perú no exportaba con ventaja comparativa revelada en 2015, la densidad de espacio de productos en 2015 predice cuáles logró adquirir para 2024 (logit, coeficiente 26.8, p<0.001; 25.9, p=0.002 excluyendo commodities)."),
        bullet("Panel bilateral PPML, socios de CPTPP y China, productos no-commodity, 2016-2024: la densidad del producto es el predictor más fuerte del panel (coeficiente 5.68, p<0.001), controlando por PIB del socio, distancia, frontera e idioma común. El WGI promedio en esta muestra acotada (11 socios) sale significativo pero con signo negativo — inestable dado el número reducido de clusters, no se interpreta como evidencia de que la gobernanza perjudique."),

        h1("9. Rigor metodológico"),
        bullet("Endogeneidad: gobernanza (t-1) como predictor de competitividad (t); batería completa de pruebas (rezago t-2, primeras diferencias, precedencia inversa) ya implementada sobre el panel de gravedad grande — la asociación en niveles sobrevive al rezago más largo pero no a primeras diferencias, con causalidad reversa significativa, por lo que incluso antes de la corrección PPML ya se reportaba como asociación, nunca como efecto causal."),
        bullet("Corrección de medición: exclusión declarada a priori (no derivada de los residuos) de capítulos arancelarios de commodities y de la lista estándar de la literatura de hubs de reexportación, para evitar que la geografía de la refinación de metales y el tránsito portuario contamine los coeficientes de gravedad."),
        bullet("Posicionamiento en la literatura: la elección de PPML sobre MCO log-lineal sigue a Santos Silva y Tenreyro (2006); la hipótesis de capacidades sigue a Hidalgo, Klinger, Barabási y Hausmann (2007) y Hidalgo y Hausmann (2009)."),

        h1("10. Cronograma"),
        table(
          ["Etapa", "Duración"],
          [
            ["Análisis de datos (gravedad PPML, H3, DiD, espacio de productos)", "completado"],
            ["Redacción del artículo con la estructura de dos pilares", "1-2 meses"],
            ["Revisión interna y robustez adicional (panel de densidad fuera de muestra)", "1 mes"],
            ["Primera ronda de revisión por pares", "4-10 meses"],
            ["Rondas adicionales (típico 2-4 en total)", "variable"],
            ["Total estimado hasta aceptación", "9-15 meses desde el envío"],
          ],
          [5360, 4000]
        ),

        h1("11. Equipo de investigación y colaboración propuesta"),
        p("Investigador responsable: Ricardo Cuba, economista, asistente de investigación del CIUP, autor del diseño metodológico, la extracción y validación de datos, y las estimaciones reportadas en este expediente."),
        p("Colaboración propuesta: se invita al Dr. Oscar Malca, Vicedecano de Negocios Internacionales del CIUP, a sumarse como investigador principal o coautor, dado que el proyecto retoma directamente la pregunta de investigación de sus trabajos de 2016 y 2019 sobre oportunidades comerciales de Perú en TPP/CPTPP y Asia-Pacífico. Se propone su participación en: la revisión crítica del diseño y el replanteo metodológico; la decisión sobre coautoría formal; y la selección final de la revista objetivo entre las candidatas identificadas (sección 12)."),

        h1("12. Productos esperados"),
        p("Un artículo académico con la estructura de dos pilares (corrección metodológica + hipótesis de capacidades), postulado a una de las siguientes revistas:"),
        bullet("International Journal of Emerging Markets (Scopus/SSCI) — mercados emergentes y competitividad exportadora."),
        bullet("Journal of Economic Structures (Scopus) — publica trabajo aplicado de espacio de productos/complejidad económica."),
        bullet("The Journal of International Trade & Economic Development (Scopus/SSCI) — encaja con el diseño de gravedad PPML y el enfoque bilateral CPTPP/China."),

        h1("13. Referencias"),
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
        p("Malca, O. et al. (2016). Análisis e Identificación de las Potenciales Oportunidades Comerciales con Países miembros del TPP. Journal of Business, Universidad del Pacífico."),
        p("Malca, O. et al. (2019). América Latina y Asia Pacífico."),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  require("fs").writeFileSync("Proyecto-Investigacion-CPTPP-China.docx", buf);
  console.log("Escrito Proyecto-Investigacion-CPTPP-China.docx");
});
