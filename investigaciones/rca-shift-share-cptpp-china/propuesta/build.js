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
            text: "Gobernanza institucional y competitividad exportadora real",
            bold: true, size: 32,
          })],
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: "Una descomposición shift-share de las exportaciones peruanas hacia los países del CPTPP y China, 2015-2024",
            italics: true, size: 24, color: "444444",
          })],
          spacing: { after: 300 },
        }),

        h2("Pregunta de investigación"),
        p("¿La calidad institucional modera el componente de competitividad real —no el de demanda externa— del crecimiento exportador en economías emergentes?"),

        h2("Justificación"),
        p("Perú ha incrementado su participación exportadora en la última década sin una mejora correspondiente en sus indicadores de gobernanza (control de corrupción, estabilidad política, estado de derecho, calidad regulatoria, efectividad gubernamental, voz y rendición de cuentas). Esta disociación plantea una pregunta no resuelta en la literatura de competitividad exportadora: si el crecimiento observado responde a condiciones favorables de demanda externa o a una ganancia real de competitividad de las empresas peruanas. Separar ambos efectos tiene implicancias directas de política comercial, particularmente en el marco de acuerdos como el CPTPP."),

        h2("Objetivos"),
        p("General: determinar si la calidad institucional explica el componente de competitividad real del crecimiento exportador peruano hacia los países del CPTPP y China.", { bold: false }),
        bullet("Calcular la ventaja comparativa revelada por partida arancelaria y país, 2015-2024."),
        bullet("Descomponer el crecimiento exportador en sus componentes de demanda mundial, composición estructural y competitividad real."),
        bullet("Estimar el efecto de las seis dimensiones de gobernanza (WGI) sobre el componente de competitividad real, controlando por tipo de cambio real y PIB per cápita."),

        h2("Marco metodológico: análisis comparativo de tres enfoques"),
        table(
          ["Metodología", "Descripción", "Ventajas", "Limitaciones"],
          [
            [
              "Ventaja Comparativa Revelada (Balassa, 1965)",
              "Índice de especialización relativa: participación de un producto en las exportaciones de un país frente a su participación en el comercio mundial.",
              "Simple, interpretable, estándar en la literatura de comercio internacional.",
              "Estática: no distingue si el cambio obedece a la demanda mundial o a la competitividad real.",
            ],
            [
              "Modelo de Gravedad del Comercio (Tinbergen, 1962)",
              "Explica los flujos bilaterales en función del tamaño económico (PIB) y factores de resistencia (distancia, acuerdos comerciales).",
              "Marco econométrico robusto; aísla el efecto de la gobernanza controlando por tamaño de mercado y distancia.",
              "Requiere datos bilaterales completos entre cada par de países.",
            ],
            [
              "Cuota de Mercado Constante / Shift-Share (Tyszynski, 1951; Leamer y Stern, 1970)",
              "Descompone el crecimiento exportador en demanda mundial, composición estructural y competitividad real (residual).",
              "Única técnica que distingue explícitamente “más exportación” de “más competitividad” — núcleo de la pregunta de investigación.",
              "Requiere series históricas largas y desagregadas; sensible al período base.",
            ],
          ],
          [2200, 2800, 2200, 2160]
        ),
        p(""),
        p("Metodología seleccionada: descomposición shift-share como técnica central, con el índice de ventaja comparativa revelada como panorama descriptivo inicial. El modelo de gravedad queda como extensión de robustez de segunda fase, condicionado a la disponibilidad de datos bilaterales completos."),

        h2("Datos"),
        p("Serie 2015-2024 de 17 indicadores del Banco Mundial (incluidas las seis dimensiones de gobernanza WGI) y datos de comercio bilateral (Comtrade), para los países miembros del CPTPP y China, acotados a las partidas arancelarias de café, cacao y cadenas afines."),

        h2("Rigor metodológico para revisión por pares"),
        bullet("Endogeneidad: gobernanza (t-1) como predictor de competitividad (t), evitando regresión contemporánea simple ante la objeción de causalidad inversa."),
        bullet("Diagnósticos de panel: prueba de Hausman (efectos fijos vs. aleatorios) y pruebas de raíz unitaria en panel."),
        bullet("Posicionamiento en la literatura: revisión sistemática frente a la literatura existente de ventaja comparativa revelada y gobernanza."),

        h2("Plan de trabajo"),
        bullet("Delimitación del universo: países del CPTPP y China, partidas arancelarias priorizadas."),
        bullet("Extracción y validación de series WDI, WGI y Comtrade."),
        bullet("Cálculo de ventaja comparativa revelada por partida y país, 2015 frente a 2024."),
        bullet("Descomposición shift-share del crecimiento exportador."),
        bullet("Regresión de panel entre el componente de competitividad y las dimensiones de gobernanza, con controles."),
        bullet("Validación cruzada frente al marco conceptual de 2016 del grupo."),
        bullet("Redacción y visualización de hallazgos."),

        h2("Cronograma"),
        table(
          ["Etapa", "Duración"],
          [
            ["Análisis de datos", "2 meses"],
            ["Redacción y revisión interna", "3 meses"],
            ["Primera ronda de revisión por pares", "4-10 meses"],
            ["Rondas adicionales (típico 2-4 en total)", "variable"],
            ["Total estimado hasta aceptación", "12-18 meses"],
          ],
          [5360, 4000]
        ),

        h2("Revistas objetivo"),
        bullet("International Journal of Emerging Markets (Scopus/SSCI)"),
        bullet("Journal of Agribusiness in Developing and Emerging Economies (Scopus)"),
        bullet("Review of International Business and Strategy (Scopus)"),

        h2("Fuentes metodológicas"),
        p("Balassa, B. (1965). Trade Liberalisation and “Revealed” Comparative Advantage. The Manchester School, 33(2), 99-123."),
        p("Tinbergen, J. (1962). Shaping the World Economy: Suggestions for an International Economic Policy. The Twentieth Century Fund."),
        p("Tyszynski, H. (1951). World Trade in Manufactured Commodities, 1899-1950. Manchester School of Economic and Social Studies, 19(3), 272-304; refinamiento en Leamer, E. E., y Stern, R. M. (1970). Quantitative International Economics."),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  require("fs").writeFileSync("Propuesta-Gobernanza-Competitividad-CPTPP.docx", buf);
  console.log("Escrito Propuesta-Gobernanza-Competitividad-CPTPP.docx");
});
