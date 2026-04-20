import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const vendorDir = path.join(rootDir, "vendor");

const URLS = {
  annualBirths:
    "https://ourworldindata.org/grapher/number-of-births-per-year.csv?download-format=tab",
  continents:
    "https://ourworldindata.org/grapher/continents-according-to-our-world-in-data.csv?v=1&csvType=full&useColumnShortNames=false",
  monthlyBirths:
    "https://www.humanfertility.org/File/GetDocumentFree/STFF/stffadj.csv",
  vaccineMonthly:
    "https://srhdpeuwpubsa.blob.core.windows.net/whdh/COVID/COV_VAC_UPTAKE_2021_2023.csv",
  unicefStillbirthRate:
    "https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/data/UNICEF,CME/.CME_SBR._T._T?startPeriod=2005&endPeriod=2024",
  unicefStillbirths:
    "https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/data/UNICEF,CME/.CME_SB._T._T?startPeriod=2005&endPeriod=2024",
  unicefNeonatalRate:
    "https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/data/UNICEF,CME/.CME_MRM0._T._T?startPeriod=2005&endPeriod=2024",
  unicefNeonatalDeaths:
    "https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/data/UNICEF,CME/.CME_TMM0._T._T?startPeriod=2005&endPeriod=2024",
  plotlyVendor:
    "https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.2/plotly.min.js",
};

const YEAR_START = 2005;
const YEAR_END = 2024;

await mkdir(vendorDir, { recursive: true });

const [annualBirthsCsv, continentsCsv, monthlyBirthsCsv, vaccineCsv, sbrXml, sbXml, nmrXml, nndXml, plotlyJs, css, appJs] =
  await Promise.all([
    fetchText(URLS.annualBirths),
    fetchText(URLS.continents),
    fetchText(URLS.monthlyBirths),
    fetchText(URLS.vaccineMonthly),
    fetchText(URLS.unicefStillbirthRate),
    fetchText(URLS.unicefStillbirths),
    fetchText(URLS.unicefNeonatalRate),
    fetchText(URLS.unicefNeonatalDeaths),
    fetchText(URLS.plotlyVendor),
    readFile(path.join(srcDir, "report.css"), "utf8"),
    readFile(path.join(srcDir, "report.js"), "utf8"),
  ]);

await writeFile(path.join(vendorDir, "plotly.min.js"), plotlyJs, "utf8");

const continentRows = parseCsv(continentsCsv);
const annualBirthRows = parseCsv(annualBirthsCsv);
const monthlyBirthRows = parseCsv(monthlyBirthsCsv);
const vaccineRows = parseCsv(vaccineCsv);

const continentByCode = buildContinentMap(continentRows);
const annualBirths = buildAnnualBirths(annualBirthRows, continentByCode);
const monthlyBirths = buildMonthlyBirths(monthlyBirthRows, continentByCode);
const vaccineMonthly = buildMonthlyVaccines(vaccineRows, continentByCode);
const vaccineAnnual = buildAnnualVaccines(vaccineRows, continentByCode);

const stillbirthRate = buildUnicefMetric(sbrXml, continentByCode);
const stillbirths = buildUnicefMetric(sbXml, continentByCode);
const neonatalRate = buildUnicefMetric(nmrXml, continentByCode);
const neonatalDeaths = buildUnicefMetric(nndXml, continentByCode);

const countries = buildCountries({
  annualBirths,
  monthlyBirths,
  stillbirthRate,
  stillbirths,
  neonatalRate,
  neonatalDeaths,
  vaccineAnnual,
  continentByCode,
});
const outlierRows = buildOutlierRows({
  countries,
  annualBirths,
  stillbirthRate,
  stillbirths,
  neonatalRate,
  neonatalDeaths,
});

const bundle = {
  meta: {
    generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    yearStart: YEAR_START,
    yearEnd: YEAR_END,
    monthlyStart: "2012-01-01",
    monthlyEnd: "2024-12-01",
    preWindow: [2015, 2019],
    postWindow: [2020, 2024],
    sources: [
      "Porody UN WPP přes Our World in Data",
      "Mapování kontinentů podle OWID",
      "HFD Short-Term Fertility Fluctuations",
      "Proočkovanost WHO proti COVID-19",
      "Dětská úmrtnost UNICEF / UN IGME",
    ],
  },
  countries,
  annual: {
    births: annualBirths,
    stillbirthRate,
    stillbirths,
    neonatalRate,
    neonatalDeaths,
    vaccineA1D: vaccineAnnual.a1d,
    vaccineCPS: vaccineAnnual.cps,
  },
  monthly: {
    birthsAdjusted: monthlyBirths,
    vaccineA1D: vaccineMonthly.a1d,
    vaccineCPS: vaccineMonthly.cps,
  },
  outliers: {
    minBirthsForRanking: 5000,
    rows: outlierRows,
  },
};

const html = renderHtml({ css, appJs, bundle, plotlyJs });
await writeFile(path.join(rootDir, "report.html"), html, "utf8");

console.log(`Generated report.html with ${countries.length} countries`);

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Codex report builder",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

function parseCsv(text) {
  const input = text.replace(/^\uFEFF/, "");
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      current = "";
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }

  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, position) => [key, values[position] ?? ""])));
}

function buildContinentMap(rows) {
  const map = {};
  rows.forEach((row) => {
    if (!row.Code || !row["World region according to OWID"]) {
      return;
    }
    map[row.Code] = {
      name: row.Entity,
      continent: row["World region according to OWID"],
      macroRegion: toMacroRegion(row["World region according to OWID"]),
    };
  });
  return map;
}

function buildAnnualBirths(rows, continentByCode) {
  const series = {};
  rows.forEach((row) => {
    const code = row.Code;
    if (!continentByCode[code]) {
      return;
    }
    const year = Number(row.Year);
    const value = toNumber(row["Number of births"]);
    if (!year || year < YEAR_START || year > YEAR_END || value == null) {
      return;
    }
    series[code] ??= {};
    series[code][String(year)] = value;
  });
  return series;
}

function buildMonthlyBirths(rows, continentByCode) {
  const series = {};
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  rows.forEach((row) => {
    const code = row.CountryCode;
    if (!continentByCode[code]) {
      return;
    }
    if (row.Area !== "1") {
      return;
    }
    const year = Number(row.Year);
    if (!year || year < 2012 || year > YEAR_END) {
      return;
    }
    series[code] ??= {};
    months.forEach((monthName, index) => {
      const value = toNumber(row[monthName]);
      if (value == null) {
        return;
      }
      const month = String(index + 1).padStart(2, "0");
      series[code][`${year}-${month}-01`] = value;
    });
  });

  return series;
}

function buildMonthlyVaccines(rows, continentByCode) {
  const a1d = {};
  const cps = {};

  rows.forEach((row) => {
    const code = row.COUNTRY;
    if (!continentByCode[code]) {
      return;
    }
    const date = row.DATE ? `${row.DATE.slice(0, 7)}-01` : null;
    if (!date) {
      return;
    }
    const a1dValue = toNumber(row.COVID_VACCINE_COV_TOT_A1D);
    const cpsValue = toNumber(row.COVID_VACCINE_COV_TOT_CPS);
    if (a1dValue != null) {
      a1d[code] ??= {};
      a1d[code][date] = a1dValue;
    }
    if (cpsValue != null) {
      cps[code] ??= {};
      cps[code][date] = cpsValue;
    }
  });

  return { a1d, cps };
}

function buildAnnualVaccines(rows, continentByCode) {
  const a1d = {};
  const cps = {};
  const sortedRows = rows
    .filter((row) => continentByCode[row.COUNTRY] && row.DATE)
    .sort((left, right) => left.DATE.localeCompare(right.DATE));

  sortedRows.forEach((row) => {
    const code = row.COUNTRY;
    const year = row.DATE.slice(0, 4);
    const a1dValue = toNumber(row.COVID_VACCINE_COV_TOT_A1D);
    const cpsValue = toNumber(row.COVID_VACCINE_COV_TOT_CPS);
    if (a1dValue != null) {
      a1d[code] ??= {};
      a1d[code][year] = a1dValue;
    }
    if (cpsValue != null) {
      cps[code] ??= {};
      cps[code][year] = cpsValue;
    }
  });

  return { a1d, cps };
}

function buildUnicefMetric(xml, continentByCode) {
  const series = {};
  const seriesRegex = /<Series\b([^>]*)>([\s\S]*?)<\/Series>/g;

  for (const match of xml.matchAll(seriesRegex)) {
    const attrs = parseXmlAttributes(match[1]);
    const code = attrs.REF_AREA;
    if (!continentByCode[code]) {
      continue;
    }
    const observations = {};
    for (const obsMatch of match[2].matchAll(/<Obs\b([^/>]*)\/>/g)) {
      const obsAttrs = parseXmlAttributes(obsMatch[1]);
      const year = Number(obsAttrs.TIME_PERIOD);
      const value = toNumber(obsAttrs.OBS_VALUE);
      if (!year || year < YEAR_START || year > YEAR_END || value == null) {
        continue;
      }
      observations[String(year)] = value;
    }
    if (Object.keys(observations).length) {
      series[code] = observations;
    }
  }

  return series;
}

function parseXmlAttributes(attributeText) {
  const attrs = {};
  for (const match of attributeText.matchAll(/([A-Z_]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function buildCountries(metrics) {
  const countrySet = new Set([
    ...Object.keys(metrics.annualBirths),
    ...Object.keys(metrics.monthlyBirths),
    ...Object.keys(metrics.stillbirthRate),
    ...Object.keys(metrics.stillbirths),
    ...Object.keys(metrics.neonatalRate),
    ...Object.keys(metrics.neonatalDeaths),
    ...Object.keys(metrics.vaccineAnnual.a1d),
  ]);

  return Array.from(countrySet)
    .map((code) => ({
      code,
      name: metrics.continentByCode[code]?.name ?? code,
      continent: metrics.continentByCode[code]?.continent ?? "Other",
      macroRegion: metrics.continentByCode[code]?.macroRegion ?? "Other",
      hasMonthlyBirths: Boolean(metrics.monthlyBirths[code]),
      hasStillbirths: Boolean(metrics.stillbirths[code]),
      hasNeonatalDeaths: Boolean(metrics.neonatalDeaths[code]),
      hasVaccines: Boolean(metrics.vaccineAnnual.a1d[code]),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildOutlierRows(metrics) {
  return metrics.countries
    .map((country) => {
      const birthsPre = averageSeriesWindow(metrics.annualBirths[country.code], 2015, 2019);
      const birthsPost = averageSeriesWindow(metrics.annualBirths[country.code], 2020, 2024);
      const stillbirthRatePre = averageSeriesWindow(metrics.stillbirthRate[country.code], 2015, 2019);
      const stillbirthRatePost = averageSeriesWindow(metrics.stillbirthRate[country.code], 2020, 2024);
      const stillbirthsPre = averageSeriesWindow(metrics.stillbirths[country.code], 2015, 2019);
      const stillbirthsPost = averageSeriesWindow(metrics.stillbirths[country.code], 2020, 2024);
      const neonatalRatePre = averageSeriesWindow(metrics.neonatalRate[country.code], 2015, 2019);
      const neonatalRatePost = averageSeriesWindow(metrics.neonatalRate[country.code], 2020, 2024);
      const neonatalDeathsPre = averageSeriesWindow(metrics.neonatalDeaths[country.code], 2015, 2019);
      const neonatalDeathsPost = averageSeriesWindow(metrics.neonatalDeaths[country.code], 2020, 2024);

      return {
        code: country.code,
        name: country.name,
        continent: country.macroRegion,
        birthsPre,
        birthsPost,
        birthsChangePct: percentChange(birthsPre, birthsPost),
        stillbirthRatePre,
        stillbirthRatePost,
        stillbirthRateChangePct: percentChange(stillbirthRatePre, stillbirthRatePost),
        stillbirthsPre,
        stillbirthsPost,
        stillbirthsChangePct: percentChange(stillbirthsPre, stillbirthsPost),
        neonatalRatePre,
        neonatalRatePost,
        neonatalRateChangePct: percentChange(neonatalRatePre, neonatalRatePost),
        neonatalDeathsPre,
        neonatalDeathsPost,
        neonatalDeathsChangePct: percentChange(neonatalDeathsPre, neonatalDeathsPost),
      };
    })
    .filter((row) => row.birthsPre != null || row.stillbirthRatePre != null || row.neonatalRatePre != null);
}

function averageSeriesWindow(series, startYear, endYear) {
  if (!series) {
    return null;
  }
  let sum = 0;
  let count = 0;
  for (let year = startYear; year <= endYear; year += 1) {
    const value = toNumber(series[String(year)]);
    if (value == null) {
      continue;
    }
    sum += value;
    count += 1;
  }
  return count ? sum / count : null;
}

function percentChange(preValue, postValue) {
  if (preValue == null || postValue == null || preValue === 0) {
    return null;
  }
  return ((postValue - preValue) / preValue) * 100;
}

function toMacroRegion(continent) {
  if (continent === "North America" || continent === "South America") {
    return "Americas";
  }
  return continent;
}

function toNumber(value) {
  if (value == null || value === "" || value === ".") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function renderHtml({ css, appJs, bundle, plotlyJs }) {
  const dataJson = safeInlineJson(JSON.stringify(bundle));
  const safePlotly = safeInlineScriptBlock(plotlyJs);
  const safeAppJs = safeInlineScriptBlock(appJs);
  const sourcesHtml = bundle.meta.sources.map((source) => `<span class="hero-tag">${escapeHtml(source)}</span>`).join("");

  return `<!DOCTYPE html>
<html lang="cs">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Porody, mrtvorozenost, úmrtí novorozenců a časování COVIDu</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>${css}</style>
    <script>${safePlotly}</script>
  </head>
  <body>
    <div class="shell">
      <section class="controls-card">
        <div class="section-kicker">Navigace</div>
        <div class="page-nav segmented">
          <button type="button" data-page="timeseries" class="is-active">Časové řady</button>
          <button type="button" data-page="outliers">Odlehlé hodnoty</button>
        </div>
      </section>

      <section class="summary-grid">
        <article class="summary-card" id="selection-summary"></article>
        <article class="summary-card" id="births-summary"></article>
        <article class="summary-card" id="stillbirth-summary"></article>
      </section>

      <main id="timeseries-page" class="layout page-section">
        <section class="panel">
          <div class="panel-head">
            <div class="panel-title">
              <div class="section-kicker">Graf jedna</div>
              <h2>Živě narození v čase</h2>
              <p>Jedna sada křivek ukazuje svět a všech pět kontinentů, takže srovnání trendů je vidět hned bez jakéhokoli filtrování.</p>
            </div>
          </div>
          <div class="panel-toolbar">
            <div class="control">
              <label for="births-frequency">Řada porodů</label>
              <select id="births-frequency">
                <option value="annual">Roční porody</option>
                <option value="monthly">Měsíční porody tam, kde existují data HFD</option>
              </select>
            </div>
            <div class="control">
              <label for="births-scale">Měřítko porodů</label>
              <select id="births-scale">
                <option value="absolute">Absolutně</option>
                <option value="indexed">Index vůči předcovidové základně</option>
              </select>
            </div>
          </div>
          <div class="panel-note" id="births-note"></div>
          <div id="births-chart" class="chart"></div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title">
              <div class="section-kicker">Graf dva</div>
              <h2>Ztráty kolem porodu v čase</h2>
              <p>Stejné srovnání svět versus kontinenty je k dispozici i pro mrtvorozenost a novorozeneckou úmrtnost.</p>
            </div>
          </div>
          <div class="panel-toolbar">
            <div class="control">
              <label for="deaths-metric">Ukazatel</label>
              <select id="deaths-metric">
                <option value="stillbirthRate">Míra mrtvorozenosti</option>
                <option value="stillbirths">Mrtvě narozené děti</option>
                <option value="neonatalRate">Míra novorozenecké úmrtnosti</option>
                <option value="neonatalDeaths">Úmrtí novorozenců</option>
              </select>
            </div>
            <div class="control">
              <label for="deaths-scale">Měřítko</label>
              <select id="deaths-scale">
                <option value="absolute">Absolutně</option>
                <option value="indexed">Index vůči předcovidové základně</option>
              </select>
            </div>
          </div>
          <div class="panel-note" id="deaths-note"></div>
          <div id="deaths-chart" class="chart"></div>
        </section>
      </main>

      <main id="outliers-page" class="layout page-section is-hidden">
        <section class="panel">
          <div class="panel-head">
            <div class="panel-title">
              <div class="section-kicker">Globální body</div>
              <h2>Země s největšími odchylkami po COVIDu</h2>
              <p>Každá země je jedna tečka. Osa X ukazuje předcovidovou úroveň, osa Y procentní změnu mezi průměrem 2015-2019 a 2020-2024. Barvy označují kontinenty.</p>
            </div>
          </div>
          <div class="panel-note">Žebříčky používají minimální předcovidový průměr 5 000 porodů ročně, aby extrémy neovládaly mikrostáty.</div>
          <div id="births-outliers-chart" class="chart chart-large"></div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title">
              <div class="section-kicker">Globální body</div>
              <h2>Odchylky ve ztrátách kolem porodu</h2>
              <p>Ve výchozím stavu je použitá míra mrtvorozenosti. Můžete přepnout i na míru novorozenecké úmrtnosti nebo na verze založené na absolutních počtech, pokud chcete vidět jiný vzorec.</p>
            </div>
          </div>
          <div class="panel-toolbar">
            <div class="control">
              <label for="outlier-death-metric">Ukazatel odchylek</label>
              <select id="outlier-death-metric">
                <option value="stillbirthRate">Míra mrtvorozenosti</option>
                <option value="stillbirths">Mrtvě narozené děti</option>
                <option value="neonatalRate">Míra novorozenecké úmrtnosti</option>
                <option value="neonatalDeaths">Úmrtí novorozenců</option>
              </select>
            </div>
          </div>
          <div id="deaths-outliers-chart" class="chart chart-large"></div>
        </section>

        <section class="mini-grid">
          <article class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <div class="section-kicker">Největší změny</div>
                <h2>Odchylky v porodech</h2>
              </div>
            </div>
            <div class="list-grid">
              <div>
                <h3 class="list-title">Největší nárůsty</h3>
                <ol id="births-up-list" class="ranking-list"></ol>
              </div>
              <div>
                <h3 class="list-title">Největší poklesy</h3>
                <ol id="births-down-list" class="ranking-list"></ol>
              </div>
            </div>
          </article>

          <article class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <div class="section-kicker">Největší změny</div>
                <h2>Odchylky ve ztrátách kolem porodu</h2>
              </div>
            </div>
            <div class="list-grid">
              <div>
                <h3 class="list-title">Největší nárůsty</h3>
                <ol id="deaths-up-list" class="ranking-list"></ol>
              </div>
              <div>
                <h3 class="list-title">Největší poklesy</h3>
                <ol id="deaths-down-list" class="ranking-list"></ol>
              </div>
            </div>
          </article>
        </section>
      </main>

      <section class="footer">
        <h2>Zdroje a omezení</h2>
        <p><strong>Roční živě narození:</strong> UN World Population Prospects 2024 přes export grapheru Our World in Data.</p>
        <p><strong>Měsíční živě narození:</strong> Human Fertility Database Short-Term Fertility Fluctuations, sezonně očištěná data, jen pro vybrané země.</p>
        <p><strong>Mrtvorozenost a novorozenecká úmrtnost:</strong> datový tok dětské úmrtnosti UNICEF / UN IGME.</p>
        <p><strong>Datumové značky:</strong> Prosinec 2020 označuje první plně donošené porodní okno po raném pandemickém šoku; září 2021 označuje první plně donošené porodní okno po rané vlně očkování v mnoha zemích.</p>
        <p id="report-status"></p>
      </section>
    </div>

    <script>window.REPORT_DATA = ${dataJson};</script>
    <script>${safeAppJs}</script>
  </body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeInlineScriptBlock(value) {
  return value
    .replace(/<\/script/gi, "<\\/script")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function safeInlineJson(value) {
  return safeInlineScriptBlock(value).replace(/</g, "\\u003c");
}
