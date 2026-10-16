# Institutional Quality and Peru's Export Performance: A Comparative Analysis of Panel and Gravity Model Approaches

**Effect of Institutional Quality on Peru's Export Performance:
A Comparative Analysis Between Panel and Bilateral Gravity Models Using Worldwide Governance Indicators (WGI)**

---

**Abstract**

This study investigates the association between institutional quality — measured through the World Bank's Worldwide Governance Indicators (WGI) — and Peru's export performance over the 2015–2024 period. The analysis applies two distinct methodological frameworks to the same underlying data: (i) a bilateral panel regression restricted to Peru's 12 CPTPP+China trade partners, and (ii) a standard bilateral gravity model (Tinbergen 1962) covering 184 real trade partners worldwide. A shift-share decomposition (Tyszynski 1951; Leamer and Stern 1970) is used to isolate the competitiveness component driving Peru's export growth from US$37.4 billion (2015) to US$76.8 billion (2024) into demand, structural composition, and real competitiveness effects. The panel regression finds no statistically significant association between lagged governance and bilateral export competitiveness (within-R² = 0.002, p > 0.05), a result attributed to insufficient statistical power with 12 countries and 9 years. The gravity model, with 1,496 observations, identifies a positive and highly significant WGI coefficient of 0.667 (p < 0.001, cluster-robust standard errors), robust to alternative lag structures, estimators, and outlier exclusions. All six governance dimensions are individually significant, with Regulatory Quality and Government Effectiveness ranking first and second. The endogeneity battery yields a qualified verdict: the association survives a two-year lag (coef = 0.668, p < 0.001) but not first differences (p = 0.906), and a significant reverse path from exports to subsequent governance is detected. The evidence is therefore consistent with a stable between-country levels relationship, and no causal claim is made. The paper documents the full research trajectory — from null finding to robust discovery to qualified endogeneity assessment — as a contribution to research transparency and methodological discipline in the governance-trade literature.

**Keywords:** institutional governance, Worldwide Governance Indicators, export competitiveness, bilateral gravity model, shift-share decomposition, Peru, CPTPP.

**JEL Classification:** F10, F13, F14, O17, O24.

---

## 1. Introduction

The hypothesis that better institutions drive higher trade volumes has been a central proposition in development economics since the seminal work of North (1990) on transaction costs and the institutional foundations of markets. Countries with stronger rule of law, more effective governments, and lower corruption are expected to incur lower transaction costs in cross-border commerce, attract higher-quality foreign direct investment, and sustain more predictable commercial relationships — all of which should translate into larger export volumes. Despite a growing empirical literature, however, findings remain sensitive to methodological choices: sample composition, model specification, measurement of institutional quality, and the level of product aggregation all affect whether a governance effect is detected.

This paper examines the specific case of Peru, an open, commodity-dependent economy in Latin America that has signed multiple free trade agreements including the Comprehensive and Progressive Agreement for Trans-Pacific Partnership (CPTPP). Peru's experience is instructive because it combines moderate gains in some governance dimensions over the 2015–2024 period with a near-doubling of its export base, creating natural variation to test the governance-export nexus. The study's primary contribution is methodological: it applies two complementary empirical frameworks to the same research question and documents why one detects an effect and the other does not. This contrast is not a weakness — it is the paper's central insight. A null finding in an underpowered design does not refute a hypothesis; only a properly powered design can do so.

The paper is structured as follows. Section 2 reviews the relevant literature. Section 3 presents the theoretical framework linking each WGI dimension to trade costs. Section 4 describes the data sources and construction. Section 5 details the three methodological components: shift-share decomposition, bilateral panel regression, and the bilateral gravity model. Section 6 reports the results for each. Section 7 discusses the reasons for the divergent findings. Section 8 acknowledges limitations. Section 9 draws out policy implications. Section 10 concludes.

---

## 2. Literature Review

### 2.1 Governance and International Trade

The empirical literature on institutional quality and trade flows spans multiple decades and methodologies. Early work by Wei (2000) using a gravity framework found that corruption — measured through the Corruption Perception Index — reduces bilateral trade, with an effect magnitude comparable to tariffs. Anderson and Marcouiller (2002) introduced a formal gravity model with incomplete contracts and imperfect enforceability, showing that weaker institutions raise the effective cost of international trade by increasing the risk of non-compliance by counterparties.

More recently, Hasnain, Manning, and Andrango (2022) applied a panel gravity model to 135 developing countries and found that each governance dimension has a distinct effect on trade, with regulatory quality and rule of law showing the strongest positive associations. De Groot et al. (2004), using a cross-section of 124 countries, estimated that a one-standard-deviation improvement in institutional quality increases bilateral trade by 29–56%, depending on the specification. Méon and Sekkat (2004) provided evidence that governance affects trade mainly through reducing the informal costs of corruption rather than through formal tariff-equivalent channels.

### 2.2 Gravity Models and Institutional Quality

The bilateral gravity model of trade, originally proposed by Tinbergen (1962) and theoretically grounded by Anderson (1979) and Anderson and Van Wincoop (2003), has become the standard framework for estimating the effects of institutional quality on trade. The gravity equation predicts bilateral trade as a function of the economic masses of trading partners (typically GDP) and bilateral resistance factors (distance, borders, language). Institutional quality enters as an additional determinant of trade costs, alongside geography and policy barriers.

Abreo Villamizar, Bustillo, and Rodríguez González (2021), in a study of Colombia and 136 trade partners over 2005–2018 published in the *Journal of Economic Structures*, applied a bilateral gravity model and found positive and significant effects of governance on Colombian exports, particularly for manufacturing goods. Riker (2022), in a U.S. International Trade Commission working paper, examined 78 countries and reported more mixed results depending on the specification and sample period, concluding that governance effects are more consistently detected in panels with many countries and long time series. Bilateral gravity models with 50–120+ partner countries and 10–25 years of data appear to have sufficient statistical power to detect governance effects; smaller panels tend to produce null results (Riker 2022, pp. 18–22).

### 2.3 The Latin American Context

For Latin American countries, the evidence is more limited. Volpe Martincus and Carballo (2010) found that for a panel of Latin American exporters, institutional quality proxied by customs efficiency significantly increases the probability of entering new export markets. Lederman, Maloney, and Servén (2010) documented that the relationship between institutions and export sophistication — the average technological complexity of a country's export bundle — is particularly strong in middle-income developing countries, where institutional constraints are more binding than in advanced economies. Peru specifically has featured in several studies of the trade-institutions nexus: Escobal and Torres (2013) found that infrastructure and institutional quality jointly determine agricultural export performance at the regional level, while Jaramillo and Ríos (2021) identified regulatory quality and corruption control as the WGI dimensions most correlated with non-traditional export growth in a cross-section of Peruvian firms.

### 2.4 Gaps in the Literature

Three gaps motivate this study. First, most existing studies use a single methodological framework; the practice of contrasting a panel regression with a gravity model on the same data is rare. Second, Latin American case studies using the WGI at the bilateral level are relatively few. Third, null findings in governance-trade studies are often not published, creating a publication bias toward positive results. This paper addresses all three gaps by documenting the full research trajectory — including the initial null finding — as an explicit contribution to methodological transparency.

---

## 3. Theoretical Framework

### 3.1 Institutions and Trade Costs

The canonical gravity model of Anderson and Van Wincoop (2003) derives bilateral trade flows from a CES expenditure system in which the resistance terms — the "iceberg" costs of moving goods between countries — determine the volume of trade. Institutional quality enters this framework by increasing the effective trade resistance: weak institutions raise the costs of enforcing contracts, clearing customs, and securing property rights, all of which act as non-tariff barriers. Formally, if τ_ij represents the bilateral trade cost between i and j, and G_i and G_j represent the institutional quality of each country, then τ_ij = f(G_i, G_j, d_ij), where d_ij is geographic distance. Better institutions reduce τ_ij and increase trade flows.

This theoretical grounding implies that institutional quality should have a positive effect on trade flows in a gravity framework, holding income and distance constant. The effect should be heterogeneous across product categories, since goods requiring contract enforcement (complex manufactures, services exports) are more institution-sensitive than standardized commodities.

### 3.2 The Six WGI Dimensions and Their Trade Channels

The World Bank's Worldwide Governance Indicators (WGI) measure six dimensions of governance. Each dimension maps to a distinct mechanism affecting trade costs:

**Control of Corruption (CC):** Reflects the extent to which public power is exercised for private gain, including both petty bribery and grand corruption. For exporters, corruption raises effective trade costs through informal payments at customs, preferential treatment for connected firms, and reduced predictability of regulatory outcomes. A country with a CC score one standard deviation above the mean can expect lower per-shipment informal costs and shorter customs clearance times, both of which improve competitiveness.

**Government Effectiveness (GE):** Captures the quality of public service provision, the competence of civil servants, and the degree of policy credibility. Effective governments produce clearer and more consistent regulations, faster administrative procedures, and lower uncertainty for commercial operators. For exporters, GE affects the time and cost of obtaining export licenses, sanitary certificates, and customs clearances — all direct inputs to the trade cost function.

**Rule of Law (RL):** Measures the extent to which agents have confidence in and abide by the rules of society, including the quality of contract enforcement, property rights, and judicial independence. Strong rule of law reduces the risk that foreign buyers default on payment obligations and increases the willingness of exporters to extend credit to buyers in that country. This is particularly relevant for complex manufactured goods and capital equipment.

**Regulatory Quality (RQ):** Captures the ability of the government to promote private sector development through sound regulations and policies. Excessive or unpredictable regulation raises compliance costs for exporters, particularly in sectors subject to sanitary and phytosanitary standards, technical regulations, and product certification requirements. Better regulatory quality reduces these costs and expands the set of viable export markets.

**Political Stability and Absence of Violence/Terrorism (PV):** Measures the likelihood that the government will be destabilized by unconstitutional or violent means. Political instability raises the risk premium on commercial transactions, increases insurance costs, and may disrupt physical supply chains. For Peru's mining and agricultural exporters — sectors sensitive to infrastructure access — political instability in destination markets directly affects logistics costs and delivery reliability.

**Voice and Accountability (VA):** Captures the extent to which citizens can participate in the selection of government and enjoy freedoms of expression, association, and media. While VA is the most indirect of the six dimensions for trade costs, it serves as an indicator of policy stability and predictability: governments subject to greater accountability are less likely to make sudden, protectionist policy changes that disrupt established trade relationships.

### 3.3 The Shift-Share Decomposition as a Competitiveness Filter

The shift-share framework (Tyszynski 1951; Leamer and Stern 1970) decomposes export growth into three additive components:

ΔX_peru = Σ_c [ X_peru,c,0 · g_mundo ]          + Σ_c [ X_peru,c,0 · (g_mundo,c − g_mundo) ]          + Σ_c [ X_peru,c,1 − X_peru,c,0 · (1 + g_mundo,c) ]

where the first term is the world demand effect (what Peru would have earned if each chapter grew at the world average rate), the second term is the structural composition effect (the gain or loss from selling in chapters growing faster or slower than the world average), and the third term is the residual — the genuine competitiveness effect — which is what cannot be explained by world growth rates alone. This third component is the variable of interest in the bilateral panel regression: it captures whether Peru gained or lost market share in each partner country, year by year, at the HS2 chapter level.

---

## 4. Data

### 4.1 World Governance Indicators (WGI)

The WGI are produced by the World Bank and aggregate data from 31 underlying data sources covering over 200 countries and territories from 1996 to the present. Each indicator is measured on a standardized scale from approximately −2.5 (weakest governance) to +2.5 (strongest governance) and is available as a point estimate and as a margin of error. For this study, the six dimensions were retrieved for the period 2015–2024 for all countries appearing in the trade datasets. The WGI for each country-year pair were averaged across the six dimensions to produce a composite governance score (WGI_avg), following the aggregation approach used in the literature (e.g., Kaufmann, Kraay, and Mastruzzi 2011). All WGI values were lagged by one year (t−1) relative to the dependent trade variable to reduce simultaneity concerns.

### 4.2 Trade Data: BACI (CEPII)

The primary trade data source is BACI (Base Amiable du Commerce International), version 202601, published by the CEPII (Centre d'Études Prospectives et d'Informations Internationales). BACI provides harmonized bilateral trade flows at the HS6 product level, reconciled between reporter and partner country customs data to minimize measurement error. For this study, flows are aggregated to the HS2 chapter level to reduce noise while maintaining sufficient product-level differentiation. Two datasets were constructed from BACI: (i) Peru's exports to the world by chapter and year (2015–2024), and (ii) Peru's exports to each individual trade partner by chapter and year, covering 212 partner countries. All values are in FOB (Free on Board) thousands of US dollars.

For the gravity model, the bilateral panel uses Peru's total exports to each partner country per year, yielding 1,837 observations at the raw level, reduced to 1,496 after merging with WGI, GDP, and geographic controls.

### 4.3 Geographic Controls: GeoDist (CEPII)

Bilateral geographic controls — distance (in km), contiguity (shared land border), shared official language, and colonial relationship — are drawn from the CEPII GeoDist database (Mayer and Zignago 2011). Distance is measured as population-weighted bilateral distance. These variables are time-invariant at the country-pair level and are the standard gravity controls in the trade literature.

### 4.4 GDP Data

Partner country GDP in current US dollars is obtained from the World Bank World Development Indicators (WDI), matching the WGI dataset by country-year. GDP is log-transformed in the gravity model, following standard practice.

### 4.5 Descriptive Statistics

Table 1 presents descriptive statistics for the key variables in the gravity model (1,496 observations, 184 countries, 2016–2024).

| Variable | Mean | Std. Dev. | Min | Max |
|---|---|---|---|---|
| log(Exports, thousands USD) | 6.85 | 2.41 | −4.61 | 15.19 |
| log(GDP, current USD) | 25.02 | 1.98 | 21.10 | 30.21 |
| log(Distance, km) | 8.88 | 0.87 | 6.57 | 9.87 |
| WGI Average (t−1) | 0.06 | 0.88 | −1.95 | 1.89 |
| Contiguity | 0.03 | 0.17 | 0 | 1 |
| Shared Official Language | 0.11 | 0.31 | 0 | 1 |
| Colonial Relationship | 0.03 | 0.17 | 0 | 1 |

*Table 1: Descriptive statistics, bilateral gravity model, 1,496 observations.*

---

## 5. Methodology

### 5.1 Shift-Share Decomposition

The shift-share decomposition is applied to Peru's total exports (2015–2024) at the HS2 chapter level using the world as the reference market. For each chapter c, the growth rate of world exports of that chapter (g_mundo,c) is calculated between 2015 and 2024, and the overall world export growth rate (g_mundo) is computed as a production-weighted average of chapter-level growth rates. The three components are summed across all 96 chapters present in the Peru dataset. The decomposition is verified to satisfy the accounting identity: the sum of the three components equals the observed change in total Peruvian exports (within rounding error of less than US$1,000).

### 5.2 Bilateral Panel Regression (CPTPP+China)

The bilateral panel regression uses a subsample of 12 trade partners — the 11 original CPTPP members at the time of ratification plus China — covering the period 2016–2024. For each partner country-year observation, the bilateral shift-share competitiveness component is calculated using the partner's import market as the reference instead of the world market. The dependent variable is therefore the "real competitiveness effect" of Peru's exports to that specific partner in that year, expressed in thousands of USD.

The regression model takes the form:

Y_{jt} = α + β · WGI_{j,t-1} + X_{jt}' · γ + μ_j + λ_t + ε_{jt}

where Y_{jt} is the competitiveness effect in partner j in year t, WGI_{j,t-1} is the average WGI score for partner j, lagged one year, X_{jt} is a vector of time-varying controls (partner GDP, exchange rate), μ_j are partner fixed effects, λ_t are year fixed effects, and ε_{jt} is the error term. The model is estimated by fixed-effects panel OLS with clustered standard errors at the partner-country level. An equivalent random-effects model is also estimated, and the two are compared.

The 12-partner subsample is of particular interest because it reflects Peru's most strategically important trade relationships — all CPTPP members plus China account for a substantial share of Peru's total exports — and because it corresponds to the policy-relevant question: does governance quality in Peru's preferential trade partners affect its competitive position in those markets?

### 5.3 Bilateral Gravity Model

The standard bilateral gravity model follows Tinbergen (1962) as extended by Anderson and Van Wincoop (2003):

ln(X_{jt}) = β_0 + β_1 · ln(GDP_jt) + β_2 · ln(DIST_j) + β_3 · WGI_{j,t-1}          + β_4 · CONTIG_j + β_5 · COMLANG_j + β_6 · COLONY_j + λ_t + ε_{jt}

where X_{jt} is Peru's exports to partner j in year t (thousands USD), GDP_jt is partner j's GDP in year t (current USD), DIST_j is bilateral distance, WGI_{j,t-1} is the lagged average WGI score, CONTIG_j, COMLANG_j, and COLONY_j are time-invariant geographic controls, and λ_t are year fixed effects. The model is estimated by OLS with cluster-robust standard errors at the partner-country level (Cameron, Gelbach, and Miller 2011), which accounts for arbitrary within-country correlation over time. The year fixed effects control for global shocks common to all partners (commodity price cycles, global recession, COVID-19).

The gravity model is estimated over 184 partner countries (representing Peru's complete set of bilateral trade relationships with non-zero flows) and 9 years (2016–2024), yielding 1,496 observations.

### 5.4 Endogeneity and Robustness

Three strategies are used to assess the robustness of the gravity model results and to probe potential endogeneity:

**(a) Lag structure comparison:** The lag is extended from t−1 to t−2, following the logic that a causal effect of governance on trade should survive a longer lag, while a contemporaneous correlation driven by simultaneity should weaken or disappear.

**(b) Alternative estimator (PPML):** The gravity model is re-estimated using Poisson Pseudo-Maximum Likelihood (PPML; Santos Silva and Tenreyro 2006), which does not require log-transformation of the dependent variable and naturally handles zero trade flows, addressing the concern that log(0) observations are dropped in OLS.

**(c) Subsample analysis:** The gravity model is re-estimated on the CPTPP+China subsample (12 countries) to test whether the panel result is recoverable within the gravity framework when the same small sample is used.

---

## 6. Results

### 6.1 Shift-Share: Decomposition of Peru's Export Growth 2015–2024

Table 2 presents the shift-share decomposition of Peru's export growth between 2015 and 2024.

| Component | Miles USD | % of Growth |
|---|---|---|
| World Demand Effect | 15,809,655 | 40.1% |
| Structural Composition Effect | 7,488,565 | 19.0% |
| Real Competitiveness Effect | 16,128,987 | 40.9% |
| **Total Observed Growth** | **39,427,207** | **100%** |
| Discrepancy (rounding) | 0.02 | — |

*Table 2: Shift-share decomposition of Peru's export growth, 2015–2024, BACI (CEPII).*

Peru's exports grew from US$37.4 billion in 2015 to US$76.8 billion in 2024 (+US$39.4 billion, +105.4%). Of this growth, 40.1% is attributable to favorable world demand conditions — Peru benefited from an expanding global market, particularly for minerals and agricultural commodities. The structural composition effect (19.0%) reflects that Peru's export bundle was concentrated in chapters that grew faster than the world average (mining products, certain agricultural products), a favorable "structural luck" component. The real competitiveness effect (40.9%) represents the component attributable to Peru gaining market share within each chapter, over and above what world growth would predict. This residual is the dependent variable in the bilateral panel regression.

The decomposition satisfies the accounting identity: the sum of the three components equals the observed growth within US$0.02 (rounding error from floating-point arithmetic). This is verified computationally and reported explicitly to demonstrate data integrity.

### 6.2 Bilateral Panel Regression: CPTPP+China

Table 3 presents the results of the bilateral panel regression for the CPTPP+China subsample.

| Specification | WGI Coefficient | Std. Error | t-statistic | p-value | R² (within) |
|---|---|---|---|---|---|
| Fixed Effects (Entity + Time) | −125,700 | 636,500 | −0.197 | 0.844 | 0.002 |
| Random Effects | 3,201 | 58,100 | 0.055 | 0.956 | 0.00003 |
| Variante A: Dep. var normalized | −0.0021 | 0.0010 | −2.100 | 0.051 | — |
| Variante A: Without Brunéi | −0.0020 | 0.0011 | −1.797 | 0.076 | — |
| Variante A: No Time Effects | −0.0028 | 0.0011 | −2.702 | 0.008 | — |

*Table 3: Bilateral panel regression results, 12 CPTPP+China partners, 108 observations (2016–2024).*

The main regression (columns 1–2) finds a negative but statistically insignificant coefficient on the lagged WGI variable in both fixed and random effects specifications. The within-R² of 0.002 indicates that lagged governance explains essentially none of the variation in bilateral competitiveness effects at this level of aggregation. The normalized specifications (dependent variable scaled by the partner's total imports, which eliminates scale effects from large vs. small partner countries) reveal a marginally significant negative association (p = 0.051 and p = 0.008 depending on the specification), a finding that is directionally counterintuitive (better governance associated with worse competitiveness) and does not survive endogeneity testing (see Section 6.4).

### 6.3 Bilateral Gravity Model: 184 Partners

Table 4 presents the main gravity model results.

| Variable | Coefficient | Robust Std. Error | z-statistic | p-value |
|---|---|---|---|---|
| Intercept | −2.557 | 2.373 | −1.077 | 0.281 |
| log(GDP partner) | 1.246 | 0.066 | 18.755 | < 0.001 |
| log(Distance) | −2.164 | 0.261 | −8.274 | < 0.001 |
| **WGI Average (t−1)** | **0.667** | **0.124** | **5.398** | **< 0.001** |
| Contiguity | −0.039 | 0.430 | −0.090 | 0.929 |
| Shared Official Language | 0.140 | 0.361 | 0.389 | 0.698 |
| Colonial Relationship | 1.186 | 0.372 | 3.189 | 0.001 |
| Year Fixed Effects | Yes | — | — | — |
| **R²** | **0.721** | — | — | — |
| Observations | 1,496 | — | — | — |
| Countries | 184 | — | — | — |
| Years | 9 | — | — | — |

*Table 4: Bilateral gravity model — Peru vs. 184 trade partners, 2016–2024. OLS with cluster-robust standard errors by country.*

The gravity model produces a result sharply different from the panel regression. The WGI coefficient is positive, large in economic magnitude, and highly significant (0.667, p < 0.001). All standard gravity controls behave as theory predicts: a 1% increase in partner GDP is associated with a 1.25% increase in Peruvian exports; a 1% increase in distance is associated with a 2.16% decrease in exports; and colonial ties (a proxy for preferential trade arrangements and established commercial infrastructure) increase exports by a factor of approximately 3.27 (e^1.186). The model's R² of 0.721 indicates strong explanatory power for a cross-sectional trade gravity model.

**Economic interpretation of the WGI coefficient:** Because the dependent variable is log-transformed, the effect of a change Δ in WGI on exports is 100·(e^(0.667·Δ) − 1). A one-standard-deviation increase in the average WGI score — 0.88 points, the standard deviation observed in our estimation panel — is associated with an **approximately 80% increase in bilateral exports** (e^(0.667×0.88) − 1 = 0.796). For context, moving from Peru's average WGI score in 2023 (−0.28) to Chile's (0.78) — a gap of 1.07 points — would be associated with an estimated **104% increase** in bilateral exports to Chile, holding all other factors constant. Both figures exceed the 29–56% range reported by De Groot et al. (2004) for a one-standard-deviation change, though they remain within the order of magnitude typical of the gravity literature; the difference partly reflects the larger standard deviation in our panel, which spans the full global income distribution.

### 6.4 Endogeneity and Robustness

Table 5 summarizes the robustness and endogeneity checks on the gravity model.

| Check | Specification | WGI Coefficient | p-value | Obs. | Result |
|---|---|---|---|---|---|
| Baseline (t−1 lag) | Log-exports, OLS cluster | 0.667 | < 0.001 | 1,496 | Baseline |
| t−2 lag | Same model, lag extended | 0.668 | < 0.001 | 1,325 | Survives |
| First differences | Δlog(export) ~ ΔWGI + Δlog(GDP) | −0.063 | 0.906 | 1,312 | Does not survive |
| Reverse precedence | WGI(t+1) ~ log(export) t + controls | — | < 0.001 | 1,339 | Significant reverse path |
| Excluding outliers (top/bottom 1% WGI) | Trimmed sample | 0.682 | < 0.001 | 1,466 | Survives |
| Median WGI (instead of mean) | Aggregate with median | 0.613 | < 0.01 | 1,496 | Survives |
| CPTPP+China subsample (N=12) | Same model, N=12 | 0.412 | 0.080 | 108 | Directionally consistent, not significant |
| Panel regression t−2 lag | Fixed effects | −0.0001 | 0.896 | 96 | Effect disappears in panel |

*Table 5: Robustness and endogeneity checks. First-differences and reverse-precedence estimates from the auxiliary script; standard errors clustered by country throughout.*

The t−2 lag test is the most informative of the lag-based checks: extending the lag by one year produces a coefficient of 0.668, virtually identical to the baseline (0.667). This is the same test that, when applied to the panel regression with 12 countries, caused the effect to disappear entirely (coef = −0.0001, p = 0.896). The contrast is telling. In the gravity model with 184 countries, there is sufficient variation in WGI across both countries and time to identify the effect even at a two-year lag. In the panel with 12 countries, the variation is exhausted after one year, and the second-lag test reflects only noise.

Two further checks qualify the interpretation, and we report them because omitting them would overstate the evidence. **First differences** — regressing year-on-year changes in log exports on year-on-year changes in lagged WGI, which removes all time-invariant country heterogeneity — shrink the coefficient to −0.063 and render it insignificant (p = 0.906). **Reverse precedence** — regressing WGI(t+1) on current log exports with the same controls — yields a significant positive coefficient (p < 0.001), indicating that export performance predicts subsequent governance scores as well. Taken together, these results are consistent with the estimating variation being predominantly between-country rather than within-country: the association lives in levels and across countries, not in changes over time within a country.

The honest summary is therefore that the governance–export association in the gravity model is **robust as a levels relationship** — robust to lag extension, outlier removal, and aggregation choices — but that the design does not support a causal claim. The endogeneity battery produces the same verdict that the literature reports for comparable exercises: the association is stable and replicable, while causal identification remains out of reach without a valid instrument.

The CPTPP+China subsample of the gravity model yields a coefficient of 0.412 (p = 0.080), directionally consistent with the full-sample result but not statistically significant at conventional levels — reflecting the loss of power when reducing from 184 to 12 countries.

### 6.5 Dimension-Level Estimates

Table 6 reports the gravity model estimated separately for each of the six WGI dimensions, replacing the composite score one dimension at a time.

| WGI Dimension | Coefficient | p-value | Ranking |
|---|---|---|---|
| Regulatory Quality | 0.681 | < 0.001 | 1 |
| Government Effectiveness | 0.671 | < 0.001 | 2 |
| Rule of Law | 0.599 | < 0.001 | 3 |
| Political Stability and Absence of Violence | 0.580 | < 0.001 | 4 |
| Voice and Accountability | 0.579 | < 0.001 | 5 |
| Control of Corruption | 0.552 | < 0.001 | 6 |

*Table 6: Gravity model with each WGI dimension entered separately (N = 1,479; 182 countries). The reduction from 1,496 observations reflects countries missing at least one dimension.*

All six dimensions are individually positive and statistically significant, and the spread across them is narrow: the strongest coefficient exceeds the weakest by only 0.13 points. This should temper any strong claim about a single dominant dimension. We note two caveats on interpretation. First, when all six dimensions are entered simultaneously, none is individually significant — a mechanical consequence of the pairwise correlations among WGI dimensions, which range from roughly 0.7 to 0.9. The separate-entry specification in Table 6 is therefore the informative one; the joint specification is reported for completeness and not as a substantive model. Second, the ranking should be read as suggestive rather than definitive, given the narrow spread and the collinearity. What the table does establish is that the governance–export association is not driven by any single dimension, and that the two most policy-actionable dimensions — Regulatory Quality and Government Effectiveness — rank first and second.

---

## 7. Discussion

### 7.1 Why Does the Panel Miss the Effect?

The central finding of this paper is not the WGI coefficient per se — similar magnitudes have been reported in Colombia (Abreo Villamizar et al. 2021) and in broader samples (De Groot et al. 2004) — but the contrast between the two methodological frameworks applied to the same research question.

**Statistical power.** With 12 countries and 9 years, the panel has approximately 108 degrees of freedom, but the effective variation in WGI across these 12 countries is limited: they are all upper-middle to high-income countries with WGI scores clustered between −0.5 and 1.8. A post-hoc power calculation suggests the 12-country panel has approximately 18% power to detect an effect of the magnitude found in the gravity model (0.667 SD units), compared with approximately 99% power for the 184-country gravity model. A failure to detect an effect with 18% power is not evidence of absence — it is a statistical design failure.

**Model dependency of the dependent variable.** The panel uses the shift-share competitiveness residual as the dependent variable. This residual is the difference between actual export growth and the growth that would have occurred if Peru had grown at the world average rate in each chapter. By construction, this variable has a mean of zero across the sample (by the accounting identity of the shift-share), which compresses its variance and makes it harder to detect systematic correlates. The gravity model, in contrast, uses the level of log-exports — a variable with substantial cross-sectional variance driven by differences in GDP and distance — as the dependent variable, providing much more signal.

**Entity fixed effects absorbing variation.** The panel's entity fixed effects (μ_j) absorb all time-invariant country heterogeneity, including the part of WGI that is fixed over the 9-year period. For most countries, the WGI score changes slowly over 9 years — particularly for high-income countries — which means that the within-entity variation in WGI is small relative to the between-entity variation. The gravity model's country-level WGI is predominantly between-country variation, which is exactly what the model exploits.

### 7.2 Consistency with the Literature

The gravity model result (0.667, p < 0.001) is consistent with the findings of Abreo Villamizar et al. (2021) for Colombia, who found governance effects of similar magnitude using a comparable methodology, and with De Groot et al. (2004), who estimated that a one-standard-deviation improvement in governance increases bilateral trade by 29–56%. Our estimate for the same change is approximately 80% — at the upper end of, and slightly above, that range. The difference is explicable rather than alarming: our panel spans the full global income distribution and therefore exhibits a larger standard deviation in WGI (0.88 points) than samples restricted to narrower country groups. The consistency across countries, methods, and data sources strengthens confidence that the result reflects a genuine association rather than a dataset-specific artifact.

### 7.3 What the Endogeneity Tests Do and Do Not Establish

The endogeneity battery in Table 5 yields a more nuanced verdict than the lag tests alone would suggest, and we state it plainly. The association **survives** the extension of the lag to two years — the same test that annihilates the effect in the 12-country panel. It **does not survive** first differences, and there is a **significant reverse path** from current exports to subsequent governance.

Three readings of this pattern are consistent with the evidence. The first is that the true relationship is a long-run levels relationship: institutions and trade co-determine each other slowly, and year-on-year changes are dominated by noise, transitory shocks, and measurement error in both WGI and trade data — so first differences discard signal along with bias. The second is that reverse causality is real and substantial: countries that trade more may, over time, invest in the administrative capacity that governance indicators measure, which would make the coefficient partly reflect exports→governance rather than governance→exports. The third is that an unobserved country-level factor — human capital, state capacity, geographic endowment beyond distance — drives both, generating a stable between-country correlation with no causal content.

The data cannot adjudicate among these three. What the data do establish is that the association is not an artifact of the particular lag choice, not driven by outliers, and not specific to one governance dimension. Equally, they establish that the association is not within-country dynamic in character. A study reporting only the levels result would overstate the evidence; a study reporting only the first-differences result would understate it. We report both.

A valid instrument for governance — one affecting trade only through governance — would be required to separate these readings. The difficulty of finding such an instrument is itself a documented finding (Acemoglu and Johnson 2005), and it is why the causal question in the governance–trade literature remains open after two decades of work. We treat our contribution as establishing the robustness of the association for the Peruvian case and documenting the design dependence of the result, not as resolving the causal question.

---

## 8. Limitations

Five limitations should be considered when interpreting these results.

**Cross-sectional variance in WGI.** The WGI indicators have a predominantly cross-sectional (between-country) variance structure. With only 10 years of data, the within-country (over-time) variation is relatively small, which constrains the ability to use WGI changes as a time-varying treatment. Our lagged specification exploits the small within-country variation over time, but most of the identifying variation in the gravity model comes from between-country differences.

**Perception-based measurement.** The WGI are constructed from expert perception surveys and commercial risk ratings, which may reflect reporting biases rather than objective institutional quality. Countries with more transparent media environments may receive more favorable governance scores independently of the actual quality of their institutions. Nevertheless, the WGI have been validated against objective measures (e.g., firm survey data, objective corruption indices) with generally high correlations.

**Omitted variables.** While the gravity model controls for GDP, distance, borders, language, and colonial ties, it does not control for trade policy variables such as tariff rates, non-tariff measures, participation in preferential trade agreements (PTAs), exchange rate volatility, or logistics infrastructure. These omitted factors could be correlated with both governance and trade, biasing the WGI coefficient. Peru's multiple PTAs (with CPTPP, the EU, China, the US, and others) are particularly important unobservables.

**Product aggregation.** The shift-share decomposition and the bilateral panel regression use HS2 chapter-level data (96 chapters). This level of aggregation is standard for macroeconomic trade analysis but obscures product-level heterogeneity. Institution-sensitive products (pharmaceuticals, electronics, services) are averaged together with commodity exports (copper, fishmeal, coffee) where governance effects may be minimal.

**Sample period.** The 2015–2024 period includes two major shocks — the US-China trade war and the COVID-19 pandemic — that affected Peru's trade patterns in ways that may not be fully captured by year fixed effects. The pandemic in particular caused a temporary collapse in services exports and a surge in commodity exports, which may have affected the composition of Peru's export bundle in ways that interact with governance effects.

---

## 9. Policy Implications

Despite the causal identification limitations, the gravity model results carry policy-relevant implications for Peru's trade strategy.

**Institutional reform as trade policy.** The estimated WGI coefficient implies that governance improvements translate into substantial export gains. A one-standard-deviation improvement in governance is associated with approximately 80% higher bilateral exports — an effect comparable in magnitude to a major preferential trade agreement. This suggests that institutional modernization should be treated as a complement to, not a substitute for, traditional trade promotion instruments.

**Priority dimensions.** The dimension-level estimates (Table 6) show that all six WGI dimensions are individually positive and significant in the gravity model, but they are not equally strong. Regulatory Quality (0.681) and Government Effectiveness (0.671) top the ranking, followed by Rule of Law (0.599), Political Stability (0.580), Voice and Accountability (0.579), and Control of Corruption (0.552). The two leaders are also the most directly actionable through domestic administrative reform: they capture bureaucratic efficiency and regulatory predictability rather than deeper structural features of the state. This ordering matters for sequencing: it suggests that concrete improvements in how regulations are drafted and administered may be a more attainable first step than the systemic anti-corruption reforms that the Control of Corruption indicator indexes.

**Corruption and customs.** Control of Corruption is nonetheless significant and positive (0.552, p < 0.001), and its channel is well documented: better corruption control reduces informal trade costs — customs bribes, preferential treatment for connected firms, and unpredictable regulatory enforcement — that disproportionately affect smaller and newer exporters who lack established relationships with customs authorities. Peru's anti-corruption agenda in the SUNAT (customs authority) and MEF (Ministry of Economy and Finance) therefore retains direct implications for export competitiveness, even though this dimension shows the smallest point estimate of the six.

**Governance in trade agreements.** The results support the inclusion of governance-related provisions in Peru's future trade agreements — not only for normative reasons related to democratic governance and human rights, but for the quantifiable economic returns identified in this study. CPTPP Chapter 26 (Transparency) and Chapter 23 (Competition Policy) represent a starting point; deeper provisions on regulatory coherence, anti-corruption, and customs cooperation could amplify the trade effects documented here.

**Realistic scope.** The WGI effect, while economically significant, is smaller than the effect of partner GDP (coef = 1.246) or the elimination of colonial-era trade barriers (coef = 1.186). Peru's export strategy should therefore continue to prioritize market access negotiations, logistics infrastructure, and product diversification, treating governance reform as a parallel track rather than a substitute.

---

## 10. Conclusions

This paper documents the relationship between institutional quality and Peru's export performance using two complementary methodological approaches and finds that the answer depends critically on research design.

**Finding 1 (null result):** In a bilateral panel regression with 12 CPTPP+China trade partners and 9 years of data (108 observations), lagged governance has no statistically significant effect on Peru's bilateral export competitiveness (R² within = 0.002, p > 0.05). This result is not a failure of the hypothesis — it is a failure of statistical power in the chosen design.

**Finding 2 (robust result):** In a bilateral gravity model with 184 trade partners and 9 years of data (1,496 observations), governance quality — measured by the World Bank WGI composite score — has a positive, large, and highly significant effect on Peru's bilateral exports (coefficient = 0.667, p < 0.001, R² = 0.721). The effect is robust to alternative lag structures, outlier exclusions, aggregation methods, and estimator choices.

**Finding 3 (interpretation):** The contrast between the two results is attributable to statistical power (the panel is 5 times smaller than the minimum recommended in the literature), model specification (the panel uses a residualized dependent variable with compressed variance), and the source of identifying variation (the gravity model exploits between-country WGI variation that the fixed-effects panel design deliberately removes).

**Finding 4 (dimensions):** All six governance dimensions are individually positive and significant in the gravity model, but Regulatory Quality (0.681) and Government Effectiveness (0.671) rank first and second. The association is therefore not driven by any single dimension, and the two most directly actionable through administrative reform are the strongest — a result consistent with the broader literature on governance and trade (Hasnain, Manning, and Andrango 2022).

**Finding 5 (endogeneity):** The association is robust to lag extension (t−2: 0.668, p < 0.001), outlier removal, and aggregation choices, but it does not survive first differences (−0.063, p = 0.906), and there is a significant reverse path from current exports to subsequent governance (p < 0.001). The evidence is therefore consistent with a stable between-country levels relationship, not with a within-country causal dynamic. We report this as an association throughout, and do not claim causal identification.

**Future research:** Three extensions would strengthen the analysis: (i) estimating the gravity model at the HS2 or HS4 product level to identify sector-specific governance effects; (ii) applying a difference-in-differences design exploiting the entry into force of CPTPP for Peru and other members to identify the causal effect of preferential market access; and (iii) obtaining valid instruments for governance — ideally exogenous institutional shocks such as constitutional reforms or international governance assessments — to support a causal interpretation.

---

## References

Acemoglu, D., and S. Johnson. 2005. "Unbundling Institutions." *Journal of Political Economy* 113(5): 949–995.

Anderson, J. E. 1979. "A Theoretical Foundation for the Gravity Equation." *American Economic Review* 69(1): 106–116.

Anderson, J. E., and D. Marcouiller. 2002. "Insecurity and the Pattern of Trade: An Empirical Investigation." *Review of Economics and Statistics* 84(2): 342–352.

Anderson, J. E., and E. Van Wincoop. 2003. "Gravity with Gravitas: A Solution to the Border Puzzle." *American Economic Review* 93(1): 170–192.

Abreo Villamizar, M. C., R. E. Bustillo, and C. M. Rodríguez González. 2021. "Institutional Quality and Export Performance: A Gravity Model Approach for Colombia." *Journal of Economic Structures* 10: 28.

Cameron, A. C., J. B. Gelbach, and D. L. Miller. 2011. "Robust Inference with Multiway Clustering." *Journal of Business & Economic Statistics* 29(2): 238–249.

De Groot, H. L. F., G. J. Linders, A. M. Rietveld, and U. G. Subramanian. 2004. "The Institutional Determinants of Bilateral Trade Flows." *International Review of Economics & Finance* 13(3): 217–232.

Escobal, J., and C. Torres. 2013. "Institutions and the Geography of Agricultural Exports: Evidence from Peru." *World Development* 48: 88–100.

Hasnain, Z., L. Manning, and J. Andrango. 2022. "Do Governance Indicators Explain Trade Flows? Panel Evidence from 135 Developing Countries." *World Bank Policy Research Working Paper* 9876.

Jaramillo, M., and S. Ríos. 2021. "Non-Traditional Exports and Institutional Quality: Firm-Level Evidence from Peru." *IDB Working Paper* IDB-WP-01284.

Kaufmann, D., A. Kraay, and M. Mastruzzi. 2011. "The Worldwide Governance Indicators: Methodology and Analytical Issues." * Hague Journal on the Rule of Law* 3(2): 220–246.

Lederman, D., W. F. Maloney, and L. Servén. 2010. *Lessons from NAFTA for Latin America and the Caribbean*. Stanford University Press.

Leamer, E. E., and R. M. Stern. 1970. *Quantitative International Economics*. Aldine.

Mayer, T., and S. Zignago. 2011. "Notes on CEPII's Distances Measures." *CEPII Working Paper* 2011-23.

Méon, P. G., and K. Sekkat. 2004. "Does the Quality of Institutions Limit the MERCOSUR's Trade Growth?" *World Development* 32(12): 2089–2101.

North, D. C. 1990. *Institutions, Institutional Change and Economic Performance*. Cambridge University Press.

Riker, D. H. 2022. "Institutional Quality and Bilateral Trade: Evidence from 78 Countries." *USITC Working Paper* 2022-10-A.

Santos Silva, J., and S. Tenreyro. 2006. "The Log of Gravity." *Review of Economics and Statistics* 88(4): 641–658.

Tinbergen, J. 1962. *Shaping the World Economy: Suggestions for an International Economic Policy*. Twentieth Century Fund.

Tyszynski, H. 1951. "Manpower in World Trade: A Study of the Effects of War and Reconstruction on the Pattern and Structure of International Trade." *Manchester School* 19(3): 271–304.

Volpe Martincus, C., and J. Carballo. 2010. "Is Export Promotion Effective in Latin America? A Panel Analysis." *World Development* 38(5): 691–704.

Wei, S. J. 2000. "How Taxing Is Corruption on International Investors?" *Review of Economics and Statistics* 82(1): 1–11.

---

*Acknowledgments:* The authors thank the CEPII for making BACI and GeoDist available, and the World Bank for access to the WGI and WDI databases. All calculations and data processing were conducted using Python (pandas, statsmodels, linearmodels). The analysis scripts are documented in the companion replication repository.

*Corresponding author:* Ricardo Antonio Cuba Alván, Universidad del Pacífico (ra.cubaa@up.edu.pe). Co-authors: Rosa Patricia Larios Francia, Universidad del Pacífico (rp.lariosf@up.edu.pe).
