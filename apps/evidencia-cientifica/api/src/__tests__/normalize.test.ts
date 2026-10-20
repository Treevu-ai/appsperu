import { describe, expect, it } from "vitest";
import { normalizeCrossrefResponse, parseQueryTerms, DEFAULT_QUERY_TERMS } from "../ingest/normalize.js";

describe("normalizeCrossrefResponse", () => {
  it("normaliza items con published-print", () => {
    const rows = normalizeCrossrefResponse({
      status: "ok",
      message: {
        "total-results": 1,
        items: [
          {
            DOI: "10.1/abc",
            title: ["Un paper sobre cacao"],
            publisher: "Editorial X",
            subject: ["Agriculture"],
            score: 12.34,
            URL: "https://doi.org/10.1/abc",
            "published-print": { "date-parts": [[2022, 3]] },
          },
        ],
      },
    });

    expect(rows).toEqual([
      {
        doi: "10.1/abc",
        title: "Un paper sobre cacao",
        publisher: "Editorial X",
        subjects: ["Agriculture"],
        publishedYear: 2022,
        url: "https://doi.org/10.1/abc",
        score: 12.34,
      },
    ]);
  });

  it("usa published-online si no hay published-print, y created como último fallback", () => {
    const rows = normalizeCrossrefResponse({
      status: "ok",
      message: {
        "total-results": 2,
        items: [
          {
            DOI: "10.2/online",
            title: ["Solo online"],
            "published-online": { "date-parts": [[2020, 1]] },
          },
          {
            DOI: "10.3/created",
            title: ["Solo created"],
            created: { "date-parts": [[2019, 5]] },
          },
        ],
      },
    });

    expect(rows[0].publishedYear).toBe(2020);
    expect(rows[1].publishedYear).toBe(2019);
  });

  it("descarta items sin DOI o sin título", () => {
    const rows = normalizeCrossrefResponse({
      status: "ok",
      message: {
        "total-results": 2,
        items: [
          { DOI: "", title: ["Sin DOI"] },
          { DOI: "10.4/sin-titulo", title: [] },
        ],
      },
    });

    expect(rows).toHaveLength(0);
  });

  it("devuelve publishedYear null cuando no hay ninguna fecha", () => {
    const rows = normalizeCrossrefResponse({
      status: "ok",
      message: {
        "total-results": 1,
        items: [{ DOI: "10.5/sin-fecha", title: ["Sin fecha"] }],
      },
    });

    expect(rows[0].publishedYear).toBeNull();
  });
});

describe("parseQueryTerms", () => {
  it("devuelve la taxonomía por defecto cuando no hay override", () => {
    expect(parseQueryTerms(undefined)).toEqual([...DEFAULT_QUERY_TERMS]);
  });

  it("parsea una lista separada por comas, recortando espacios", () => {
    expect(parseQueryTerms(" cacao , quinoa ,maca")).toEqual(["cacao", "quinoa", "maca"]);
  });

  it("cae a la taxonomía por defecto si el override queda vacío tras limpiar", () => {
    expect(parseQueryTerms(" , , ")).toEqual([...DEFAULT_QUERY_TERMS]);
  });
});
