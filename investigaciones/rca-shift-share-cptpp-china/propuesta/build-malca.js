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
function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 } });
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
        p("Para: Oscar Malca, Vicedecano de Negocios Internacionales, CIUP — Universidad del Pacífico", { italics: true }),
        p("De: Ricardo Cuba, economista · Asistente de investigación, CIUP", { italics: true }),

        new Paragraph({
          children: [new TextRun({
            text: "Propuesta de colaboración de investigación",
            bold: true, size: 32,
          })],
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: "Capacidades productivas frente a gobernanza institucional en la diversificación exportadora peruana hacia CPTPP y China",
            italics: true, size: 24, color: "444444",
          })],
          spacing: { after: 300 },
        }),

        h2("Origen y motivación"),
        p("Este proyecto nace directamente de dos líneas de investigación suyas: \"Análisis e Identificación de las Potenciales Oportunidades Comerciales con Países miembros del TPP\" (2016, Journal of Business, Universidad del Pacífico) y \"América Latina y Asia Pacífico\" (2019). Ambos papers preguntan qué determina que Perú aproveche o no las oportunidades comerciales de acuerdos como el CPTPP y de mercados como China. Este proyecto retoma esa pregunta con datos de comercio bilateral 2015-2024 (CEPII BACI, Banco Mundial WDI/WGI) y la somete a una prueba econométrica más exigente de la que suele aplicarse en la literatura aplicada — con un resultado que vale la pena mirar de cerca, porque contradice la hipótesis con la que el proyecto arrancó."),

        h2("Qué se preguntó originalmente"),
        p("La pregunta de partida, consistente con la literatura que cita su propio trabajo de 2016 y con papers de referencia en el campo (p. ej. De Groot et al. 2004), era si la calidad institucional del socio comercial — control de la corrupción, estado de derecho, calidad regulatoria — explica qué tanto le compra a Perú. Bajo el estimador estándar de la literatura aplicada (mínimos cuadrados sobre el logaritmo de las exportaciones), la respuesta parecía ser sí, y con fuerza: 0.667 (p<0.001) sobre 184 socios comerciales reales de Perú, 2016-2024, controlando por PIB, distancia, frontera, idioma e historia colonial."),

        h2("Por qué esa respuesta no sobrevivió"),
        p("Ese resultado se sometió a cuatro pruebas de robustez independientes, todas bajo el estimador correcto para datos de comercio con ceros (PPML, Santos Silva y Tenreyro 2006) y con los datos depurados de oro, cobre y combustibles — cuya geografía de refinación y reexportación distorsiona cualquier regresión de comercio que no los excluya explícitamente. Las cuatro dieron nulo o sin significancia estadística:"),
        table(
          ["Hipótesis", "Bajo OLS log-lineal (diseño original)", "Bajo PPML (estimador correcto)"],
          [
            ["WGI promedio explica exportaciones", "+0.667, p<0.001 (n=1,496)", "+0.150, p=0.35 (misma submuestra)"],
            ["Las 6 dimensiones WGI por separado", "6 de 6 positivas y significativas", "0 de 6 significativas al 5%"],
            ["Gobernanza × intensidad contractual (Nunn 2007)", "—", "Nulo o signo contrario a la teoría (p=0.014)"],
            ["Diferencias-en-diferencias, entrada en vigor del CPTPP", "+0.145, p=0.043 (exportaciones totales)", "+0.154 a +0.167, p=0.11-0.16 (sin commodities ni hubs)"],
          ],
          [3200, 3080, 3080]
        ),
        p("El diagnóstico: sin controlar por el tamaño de la economía del socio, el coeficiente de gobernanza sube en vez de bajar (+0.658, p=0.07) — buena parte de lo que el modelo original atribuía a \"gobernanza\" era, en realidad, el nivel de desarrollo del socio, correlacionado con su puntaje institucional pero no la causa del vínculo comercial. El VIF de todas las variables es inferior a 2.2, lo que descarta multicolinealidad como explicación alternativa."),

        h2("Qué sí se sostuvo: el espacio de productos"),
        p("En vez de insistir sobre la misma hipótesis, el proyecto giró hacia una explicación alternativa de la literatura de complejidad económica: el espacio de productos (Hidalgo y Hausmann, 2007, 2009). La idea es que un país diversifica hacia productos cercanos a los que ya sabe producir bien, no hacia donde el socio tiene mejor gobernanza. Esa hipótesis se probó de dos formas independientes, ambas con la misma depuración de commodities que eliminó el efecto de gobernanza:"),
        bullet("De los 1,053 productos que Perú no exportaba con ventaja comparativa revelada en 2015, qué tan cerca estaban del resto de su canasta exportadora predice cuáles logró adquirir para 2024 (coeficiente 26.8, p<0.001; se mantiene en 25.9, p=0.002, excluyendo minerales y combustibles)."),
        bullet("En un panel bilateral producto×socio×año restringido a CPTPP y China, la cercanía productiva es el predictor más fuerte de qué le vende Perú a cada socio (coeficiente +5.68, p<0.001), muy por encima de cualquier señal de gobernanza en esa misma muestra."),
        p("En corto: no es que la institucionalidad del socio no importe para nada — es que, con el estimador y los datos correctos, lo que mejor explica hacia dónde diversifica Perú es lo que ya sabe hacer, no la calidad de gobierno de a quién se lo vende."),

        h2("Qué le pediría"),
        p("Tres cosas, en orden de lo que me parece más útil pedirle:"),
        bullet("Su lectura crítica del diseño — en particular si el giro hacia espacio de productos es, a su juicio, una reformulación razonable de la pregunta original o si hay un ángulo institucional que el PPML + depuración de commodities podría estar enmascarando."),
        bullet("Evaluar si este resultado encaja como una colaboración formal o co-autoría, dado que nace directamente de su línea 2016/2019 sobre CPTPP y Asia-Pacífico."),
        bullet("Si le parece publicable, su criterio sobre la revista más adecuada — la propuesta formal identifica tres candidatas (International Journal of Emerging Markets, Journal of Economic Structures, The Journal of International Trade & Economic Development), pero usted conoce mejor que yo el terreno real de revisión por pares en esta área."),

        h2("Documento técnico complementario"),
        p("La propuesta formal completa — con el detalle metodológico de las cuatro técnicas usadas (ventaja comparativa revelada, shift-share, gravedad PPML, espacio de productos), la batería completa de endogeneidad y el cronograma — está en Propuesta-Gobernanza-Competitividad-CPTPP.docx, incluida junto con este documento. Todo el código y los datos del proyecto están versionados y disponibles si quiere revisar el detalle de cualquier especificación."),

        p("Quedo atento a sus comentarios, por correo o en una reunión breve, en las próximas semanas."),
        p("Ricardo Cuba", { bold: true }),
        p("Economista · Asistente de investigación, CIUP", { italics: true }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  require("fs").writeFileSync("Propuesta-Malca-CPTPP-China.docx", buf);
  console.log("Escrito Propuesta-Malca-CPTPP-China.docx");
});
