(function () {
  const data = window.REPORT_DATA;
  if (!window.Plotly) {
    document.body.innerHTML = '<div style="padding:24px;font-family:system-ui,sans-serif">Plotly se nepodařilo načíst, takže grafy nešlo vykreslit.</div>';
    return;
  }

  const LOCALE = "cs-CZ";
  const REGIONS = ["World", "Africa", "Americas", "Asia", "Europe", "Oceania"];
  const REGION_LABELS = {
    World: "Svět",
    Africa: "Afrika",
    Americas: "Amerika",
    Asia: "Asie",
    Europe: "Evropa",
    Oceania: "Oceánie",
    Other: "Ostatní",
  };
  const REGION_COLORS = {
    World: "#1f2220",
    Africa: "#b45309",
    Americas: "#0f766e",
    Asia: "#9f1239",
    Europe: "#2563eb",
    Oceania: "#7c3aed",
    Other: "#475569",
  };

  const state = {
    page: "timeseries",
    birthsFrequency: "annual",
    birthsScale: "absolute",
    deathsMetric: "stillbirthRate",
    deathsScale: "absolute",
    outlierDeathMetric: "stillbirthRate",
  };

  const els = {
    pageButtons: Array.from(document.querySelectorAll("[data-page]")),
    timeseriesPage: document.getElementById("timeseries-page"),
    outliersPage: document.getElementById("outliers-page"),
    selectionSummary: document.getElementById("selection-summary"),
    birthsSummary: document.getElementById("births-summary"),
    stillbirthSummary: document.getElementById("stillbirth-summary"),
    birthsFrequency: document.getElementById("births-frequency"),
    birthsScale: document.getElementById("births-scale"),
    deathsMetric: document.getElementById("deaths-metric"),
    deathsScale: document.getElementById("deaths-scale"),
    outlierDeathMetric: document.getElementById("outlier-death-metric"),
    birthsNote: document.getElementById("births-note"),
    deathsNote: document.getElementById("deaths-note"),
    birthsChart: document.getElementById("births-chart"),
    deathsChart: document.getElementById("deaths-chart"),
    birthsOutliersChart: document.getElementById("births-outliers-chart"),
    deathsOutliersChart: document.getElementById("deaths-outliers-chart"),
    birthsUpList: document.getElementById("births-up-list"),
    birthsDownList: document.getElementById("births-down-list"),
    deathsUpList: document.getElementById("deaths-up-list"),
    deathsDownList: document.getElementById("deaths-down-list"),
    reportStatus: document.getElementById("report-status"),
  };

  const annualMetrics = data.annual;
  const monthlyMetrics = data.monthly;
  const outlierRows = data.outliers.rows;
  const worldCodes = data.countries.filter((country) => annualMetrics.births[country.code]).map((country) => country.code);
  const regionCountries = Object.fromEntries(
    REGIONS.filter((region) => region !== "World").map((region) => [
      region,
      data.countries
        .filter((country) => country.macroRegion === region && annualMetrics.births[country.code])
        .map((country) => country.code),
    ]),
  );
  const comparisonGroups = REGIONS.map((region) => ({
    key: region,
    label: regionLabel(region),
    codes: region === "World" ? worldCodes : regionCountries[region] ?? [],
  })).filter((group) => group.codes.length);

  init();

  function init() {
    bindEvents();
    render();
    window.addEventListener("resize", () => {
      [els.birthsChart, els.deathsChart, els.birthsOutliersChart, els.deathsOutliersChart].forEach((chart) => {
        Plotly.Plots.resize(chart);
      });
    });
  }

  function bindEvents() {
    els.pageButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.page = button.dataset.page;
        render();
      });
    });

    els.birthsFrequency.addEventListener("change", (event) => {
      state.birthsFrequency = event.target.value;
      if (state.birthsFrequency === "monthly" && state.birthsScale === "absolute") {
        state.birthsScale = "indexed";
        els.birthsScale.value = "indexed";
      }
      render();
    });

    els.birthsScale.addEventListener("change", (event) => {
      state.birthsScale = event.target.value;
      render();
    });

    els.deathsMetric.addEventListener("change", (event) => {
      state.deathsMetric = event.target.value;
      render();
    });

    els.deathsScale.addEventListener("change", (event) => {
      state.deathsScale = event.target.value;
      render();
    });

    els.outlierDeathMetric.addEventListener("change", (event) => {
      state.outlierDeathMetric = event.target.value;
      renderOutlierCharts();
    });
  }

  function render() {
    renderNavigation();
    renderSummaries();
    renderTimeSeriesCharts();
    renderOutlierCharts();
    els.reportStatus.textContent = `Vygenerováno ${data.meta.generatedAt}. Předcovidové okno: ${data.meta.preWindow[0]}-${data.meta.preWindow[1]}. Pokovidové okno: ${data.meta.postWindow[0]}-${data.meta.postWindow[1]}.`;
  }

  function renderNavigation() {
    els.pageButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.page === state.page);
    });
    els.timeseriesPage.classList.toggle("is-hidden", state.page !== "timeseries");
    els.outliersPage.classList.toggle("is-hidden", state.page !== "outliers");
  }

  function renderSummaries() {
    const annualBirthsSeries = getAnnualAggregateSeries(worldCodes, "births");
    const stillbirthRateSeries = getAggregateMetricSeries(worldCodes, "stillbirthRate");

    els.selectionSummary.innerHTML = `
      <h3>Rozsah</h3>
      <p class="summary-value">Svět + kontinenty</p>
      <p class="summary-detail">Časové řady porovnávají světový souhrn a všech pět kontinentálních souhrnů v jedné sadě křivek.</p>
    `;

    els.birthsSummary.innerHTML = `
      <h3>Změna porodů</h3>
      <p class="summary-value">${formatSignedPercent(computeWindowChange(annualBirthsSeries))}</p>
      <p class="summary-detail">Průměrný roční počet živě narozených v letech 2020-2024 oproti 2015-2019.</p>
    `;

    els.stillbirthSummary.innerHTML = `
      <h3>Změna mrtvorozenosti</h3>
      <p class="summary-value">${formatSignedPercent(computeWindowChange(stillbirthRateSeries))}</p>
      <p class="summary-detail">Průměrná míra mrtvorozenosti v letech 2020-2024 oproti 2015-2019.</p>
    `;
  }

  function renderTimeSeriesCharts() {
    renderBirthsChart();
    renderDeathsChart();
  }

  function renderBirthsChart() {
    const useMonthly = state.birthsFrequency === "monthly";
    const monthlyCoverage = describeMonthlyCoverage(worldCodes);

    els.birthsNote.textContent = useMonthly
      ? `Měsíční graf používá sezonně očištěné porody z HFD. Každá křivka je souhrnem za svět nebo kontinent; globálně měsíční pokrytí odpovídá zhruba ${formatCount(Math.round(monthlyCoverage.coverageShare))}% porodů v roce 2019.`
      : "Roční graf používá data o živě narozených v letech 2005-2024. Každá křivka představuje celý svět nebo celý kontinent. Tečkované značky ukazují prosinec 2020 a září 2021.";

    const traces = buildComparisonTraces(
      (codes) => (useMonthly ? getMonthlyAggregateSeries(codes, "birthsAdjusted") : getAnnualAggregateSeries(codes, "births")),
      {
        indexed: state.birthsScale === "indexed",
        baselineFn: useMonthly ? monthlyBaseline : annualBaseline,
      },
    );

    const layout = baseLayout({
      title: useMonthly ? "Měsíční počet živě narozených" : "Roční počet živě narozených",
      yTitle: useMonthly
        ? state.birthsScale === "indexed"
          ? "Základna 2018-2019 = 100"
          : "Sezonně očištěný počet živě narozených"
        : state.birthsScale === "indexed"
          ? "Základna 2015-2019 = 100"
          : "Počet živě narozených",
      monthly: useMonthly,
    });

    if (!traces.length) {
      layout.annotations.push(emptyAnnotation("Data o narozeních nejsou pro toto srovnání k dispozici."));
    }

    Plotly.react(els.birthsChart, traces, layout, chartConfig());
  }

  function renderDeathsChart() {
    els.deathsNote.textContent =
      metricMeta(state.deathsMetric).note +
      " Indexovaný režim porovnává průměr za roky 2020-2024 se základnou 2015-2019 pro každou křivku zvlášť.";

    const traces = buildComparisonTraces((codes) => getAggregateMetricSeries(codes, state.deathsMetric), {
      indexed: state.deathsScale === "indexed",
      baselineFn: annualBaseline,
    });

    const layout = baseLayout({
      title: metricMeta(state.deathsMetric).label,
      yTitle: state.deathsScale === "indexed" ? "Základna 2015-2019 = 100" : metricMeta(state.deathsMetric).axis,
      monthly: false,
    });

    if (!traces.length) {
      layout.annotations.push(emptyAnnotation("Data k tomuto ukazateli nejsou pro toto srovnání k dispozici."));
    }

    Plotly.react(els.deathsChart, traces, layout, chartConfig());
  }

  function renderOutlierCharts() {
    renderBirthsOutlierChart();
    renderDeathsOutlierChart();
    renderRankingLists();
  }

  function renderBirthsOutlierChart() {
    const eligible = outlierRows.filter((row) => row.birthsPre != null && row.birthsChangePct != null && row.birthsPre >= data.outliers.minBirthsForRanking);
    const traces = buildOutlierRegionTraces(eligible, {
      xField: "birthsPre",
      yField: "birthsChangePct",
      valueLabel: "Předcovidový počet porodů",
    });

    const layout = {
      ...scatterLayout(
        "Odchylky v počtu živě narozených",
        "Průměrný roční počet porodů, 2015-2019",
        "Změna počtu porodů, 2020-2024 vs. 2015-2019 (%)",
      ),
      xaxis: {
        ...scatterAxis("Průměrný roční počet porodů, 2015-2019"),
        type: "log",
      },
    };

    Plotly.react(els.birthsOutliersChart, traces, layout, chartConfig());
  }

  function renderDeathsOutlierChart() {
    const meta = metricMeta(state.outlierDeathMetric);
    const xField = meta.outlierPreField;
    const yField = meta.outlierChangeField;
    const eligible = outlierRows.filter(
      (row) => row.birthsPre >= data.outliers.minBirthsForRanking && row[xField] != null && row[yField] != null,
    );
    const traces = buildOutlierRegionTraces(eligible, {
      xField,
      yField,
      valueLabel: meta.label,
    });
    const layout = scatterLayout(meta.outlierTitle, meta.outlierXTitle, meta.outlierYTitle);

    Plotly.react(els.deathsOutliersChart, traces, layout, chartConfig());
  }

  function renderRankingLists() {
    const birthsRows = outlierRows.filter((row) => row.birthsPre >= data.outliers.minBirthsForRanking && row.birthsChangePct != null);
    renderRankingPair(els.birthsUpList, els.birthsDownList, birthsRows, "birthsChangePct", "birthsPre");

    const deathMeta = metricMeta(state.outlierDeathMetric);
    const deathRows = outlierRows.filter(
      (row) => row.birthsPre >= data.outliers.minBirthsForRanking && row[deathMeta.outlierChangeField] != null,
    );
    renderRankingPair(els.deathsUpList, els.deathsDownList, deathRows, deathMeta.outlierChangeField, deathMeta.outlierPreField);
  }

  function renderRankingPair(upEl, downEl, rows, changeField, valueField) {
    const topUp = [...rows].sort((left, right) => right[changeField] - left[changeField]).slice(0, 8);
    const topDown = [...rows].sort((left, right) => left[changeField] - right[changeField]).slice(0, 8);
    upEl.innerHTML = topUp.map((row) => rankingItem(row, changeField, valueField)).join("");
    downEl.innerHTML = topDown.map((row) => rankingItem(row, changeField, valueField)).join("");
  }

  function rankingItem(row, changeField, valueField) {
    return `<li><strong>${row.name}</strong><span>${formatSignedPercent(row[changeField])}</span><span class="ranking-meta">Před COVIDem: ${formatMetric(row[valueField])}</span></li>`;
  }

  function buildOutlierRegionTraces(rows, fields) {
    return ["Africa", "Americas", "Asia", "Europe", "Oceania"].map((region) => {
      const regionRows = rows.filter((row) => row.continent === region);
      return {
        x: regionRows.map((row) => row[fields.xField]),
        y: regionRows.map((row) => row[fields.yField]),
        text: regionRows.map((row) => `${row.name} (${row.code})`),
        customdata: regionRows.map((row) => [row[fields.xField], row[fields.yField]]),
        type: "scatter",
        mode: "markers",
        name: regionLabel(region),
        marker: {
          color: REGION_COLORS[region] ?? REGION_COLORS.Other,
          size: 10,
          opacity: 0.78,
          line: { color: "rgba(255,255,255,0.65)", width: 1 },
        },
        hovertemplate:
          "%{text}<br>" +
          `${fields.valueLabel}: %{x:,.2f}<br>` +
          "Změna: %{y:.1f}%<extra></extra>",
      };
    });
  }

  function buildComparisonTraces(seriesGetter, options) {
    return comparisonGroups
      .map((group) => {
        const rawSeries = seriesGetter(group.codes);
        const transformed = options.indexed ? indexSeries(rawSeries, options.baselineFn) : rawSeries;
        if (!transformed.length) {
          return null;
        }
        return {
          x: transformed.map((point) => point.date),
          y: transformed.map((point) => point.value),
          type: "scatter",
          mode: "lines",
          name: group.label,
          line: {
            color: REGION_COLORS[group.key] ?? REGION_COLORS.Other,
            width: group.key === "World" ? 4 : 2.4,
          },
          opacity: group.key === "World" ? 1 : 0.9,
          hovertemplate: `${group.label}<br>%{x|%Y-%m-%d}<br>%{y:,.2f}<extra></extra>`,
        };
      })
      .filter(Boolean);
  }

  function describeMonthlyCoverage(codes) {
    const monthlyCodes = codes.filter((code) => monthlyMetrics.birthsAdjusted[code]);
    const totalBirths2019 = sumValues(codes.map((code) => annualMetrics.births[code]?.["2019"] ?? null));
    const coveredBirths2019 = sumValues(monthlyCodes.map((code) => annualMetrics.births[code]?.["2019"] ?? null));
    return {
      totalCountries: codes.length,
      coveredCountries: monthlyCodes.length,
      coverageShare: totalBirths2019 ? (coveredBirths2019 / totalBirths2019) * 100 : 0,
    };
  }

  function getAnnualAggregateSeries(codes, metric) {
    return aggregateSeries(codes.map((code) => getAnnualCountrySeries(code, metric)));
  }

  function getMonthlyAggregateSeries(codes, metric) {
    return aggregateSeries(codes.map((code) => getMonthlyCountrySeries(code, metric)).filter((series) => series.length));
  }

  function getAggregateMetricSeries(codes, metric) {
    switch (metric) {
      case "stillbirthRate":
        return deriveStillbirthRate(codes);
      case "stillbirths":
        return getAnnualAggregateSeries(codes, "stillbirths");
      case "neonatalRate":
        return deriveNeonatalRate(codes);
      case "neonatalDeaths":
        return getAnnualAggregateSeries(codes, "neonatalDeaths");
      default:
        return [];
    }
  }

  function deriveStillbirthRate(codes) {
    const stillbirths = getAnnualAggregateSeries(codes, "stillbirths");
    const births = getAnnualAggregateSeries(codes, "births");
    return combineSeries(stillbirths, births, (stillbirthsValue, birthsValue) => {
      if (stillbirthsValue == null || birthsValue == null) {
        return null;
      }
      const totalBirths = stillbirthsValue + birthsValue;
      return totalBirths > 0 ? (stillbirthsValue / totalBirths) * 1000 : null;
    });
  }

  function deriveNeonatalRate(codes) {
    const neonatalDeaths = getAnnualAggregateSeries(codes, "neonatalDeaths");
    const births = getAnnualAggregateSeries(codes, "births");
    return combineSeries(neonatalDeaths, births, (deathsValue, birthsValue) => {
      if (deathsValue == null || birthsValue == null) {
        return null;
      }
      return birthsValue > 0 ? (deathsValue / birthsValue) * 1000 : null;
    });
  }

  function getAnnualCountrySeries(code, metric) {
    const source = annualMetrics[metric]?.[code];
    if (!source) {
      return [];
    }
    return Object.entries(source)
      .map(([year, value]) => ({ date: `${year}-01-01`, value }))
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  function getMonthlyCountrySeries(code, metric) {
    const source = monthlyMetrics[metric]?.[code];
    if (!source) {
      return [];
    }
    return Object.entries(source)
      .map(([date, value]) => ({ date, value }))
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  function aggregateSeries(seriesList) {
    const bucket = new Map();
    seriesList.forEach((series) => {
      series.forEach((point) => {
        bucket.set(point.date, (bucket.get(point.date) ?? 0) + point.value);
      });
    });
    return Array.from(bucket.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  function combineSeries(leftSeries, rightSeries, combiner) {
    const rightMap = new Map(rightSeries.map((point) => [point.date, point.value]));
    return leftSeries
      .map((point) => ({ date: point.date, value: combiner(point.value, rightMap.get(point.date)) }))
      .filter((point) => point.value != null);
  }

  function indexSeries(series, baselineFn) {
    const baseline = baselineFn(series);
    if (!baseline) {
      return series;
    }
    return series.map((point) => ({ date: point.date, value: (point.value / baseline) * 100 }));
  }

  function annualBaseline(series) {
    return averageWindow(series, 2015, 2019);
  }

  function monthlyBaseline(series) {
    const filtered = series.filter((point) => point.date >= "2018-01-01" && point.date <= "2019-12-31");
    return average(filtered.map((point) => point.value));
  }

  function averageWindow(series, startYear, endYear) {
    return average(
      series
        .filter((point) => {
          const year = Number(point.date.slice(0, 4));
          return year >= startYear && year <= endYear;
        })
        .map((point) => point.value),
    );
  }

  function computeWindowChange(series) {
    const pre = averageWindow(series, data.meta.preWindow[0], data.meta.preWindow[1]);
    const post = averageWindow(series, data.meta.postWindow[0], data.meta.postWindow[1]);
    if (pre == null || post == null || pre === 0) {
      return null;
    }
    return ((post - pre) / pre) * 100;
  }

  function metricMeta(metric) {
    switch (metric) {
      case "stillbirthRate":
        return {
          label: "Míra mrtvorozenosti",
          axis: "Mrtvě narozené děti na 1 000 všech porodů",
          note: "Míra mrtvorozenosti je odvozena ze součtu mrtvě narozených dětí a součtu živě narozených pro každou křivku zvlášť. ",
          outlierPreField: "stillbirthRatePre",
          outlierChangeField: "stillbirthRateChangePct",
          outlierTitle: "Odchylky v míře mrtvorozenosti",
          outlierXTitle: "Průměrná míra mrtvorozenosti, 2015-2019",
          outlierYTitle: "Změna míry mrtvorozenosti, 2020-2024 vs. 2015-2019 (%)",
        };
      case "stillbirths":
        return {
          label: "Mrtvě narozené děti",
          axis: "Počet mrtvě narozených dětí",
          note: "Počty mrtvě narozených dětí jsou sečteny napříč zeměmi v každé křivce. ",
          outlierPreField: "stillbirthsPre",
          outlierChangeField: "stillbirthsChangePct",
          outlierTitle: "Odchylky v počtu mrtvě narozených",
          outlierXTitle: "Průměrný počet mrtvě narozených, 2015-2019",
          outlierYTitle: "Změna počtu mrtvě narozených, 2020-2024 vs. 2015-2019 (%)",
        };
      case "neonatalRate":
        return {
          label: "Míra novorozenecké úmrtnosti",
          axis: "Úmrtí na 1 000 živě narozených",
          note: "Míra novorozenecké úmrtnosti je odvozena ze součtu úmrtí novorozenců a součtu živě narozených pro každou křivku zvlášť. ",
          outlierPreField: "neonatalRatePre",
          outlierChangeField: "neonatalRateChangePct",
          outlierTitle: "Odchylky v novorozenecké úmrtnosti",
          outlierXTitle: "Průměrná míra novorozenecké úmrtnosti, 2015-2019",
          outlierYTitle: "Změna novorozenecké úmrtnosti, 2020-2024 vs. 2015-2019 (%)",
        };
      case "neonatalDeaths":
        return {
          label: "Úmrtí novorozenců",
          axis: "Počet úmrtí novorozenců",
          note: "Počty úmrtí novorozenců jsou sečteny napříč zeměmi v každé křivce. ",
          outlierPreField: "neonatalDeathsPre",
          outlierChangeField: "neonatalDeathsChangePct",
          outlierTitle: "Odchylky v počtu úmrtí novorozenců",
          outlierXTitle: "Průměrný počet úmrtí novorozenců, 2015-2019",
          outlierYTitle: "Změna počtu úmrtí novorozenců, 2020-2024 vs. 2015-2019 (%)",
        };
      default:
        return {
          label: metric,
          axis: metric,
          note: "",
          outlierPreField: "",
          outlierChangeField: "",
          outlierTitle: metric,
          outlierXTitle: metric,
          outlierYTitle: metric,
        };
    }
  }

  function baseLayout({ title, yTitle, monthly }) {
    return {
      title: {
        text: title,
        x: 0.01,
        xanchor: "left",
        font: { family: "Fraunces, Georgia, serif", size: 22, color: "#1f2220" },
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.68)",
      font: { family: "IBM Plex Sans, Avenir Next, sans-serif", color: "#1f2220" },
      margin: { l: 68, r: 24, t: 58, b: 58 },
      hovermode: "x unified",
      legend: { orientation: "h", y: 1.02, x: 0 },
      xaxis: {
        type: "date",
        showgrid: true,
        gridcolor: "rgba(31,34,32,0.08)",
        zeroline: false,
        tickformat: monthly ? "%b\n%Y" : "%Y",
      },
      yaxis: {
        title: yTitle,
        showgrid: true,
        gridcolor: "rgba(31,34,32,0.08)",
        zeroline: false,
      },
      shapes: [
        verticalMarker("2020-12-01", "#b45309"),
        verticalMarker("2021-09-01", "#9f1239"),
      ],
      annotations: [
        markerLabel("2020-12-01", "Prosinec 2020", "#b45309"),
        markerLabel("2021-09-01", "Září 2021", "#9f1239"),
      ],
    };
  }

  function scatterLayout(title, xTitle, yTitle) {
    return {
      title: {
        text: title,
        x: 0.01,
        xanchor: "left",
        font: { family: "Fraunces, Georgia, serif", size: 22, color: "#1f2220" },
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.68)",
      font: { family: "IBM Plex Sans, Avenir Next, sans-serif", color: "#1f2220" },
      margin: { l: 72, r: 24, t: 58, b: 62 },
      hovermode: "closest",
      legend: { orientation: "h", y: 1.02, x: 0 },
      xaxis: scatterAxis(xTitle),
      yaxis: scatterAxis(yTitle),
      shapes: [
        {
          type: "line",
          x0: 0,
          x1: 1,
          xref: "paper",
          y0: 0,
          y1: 0,
          line: { color: "rgba(31,34,32,0.18)", width: 1.5, dash: "dot" },
        },
      ],
    };
  }

  function scatterAxis(title) {
    return {
      title,
      showgrid: true,
      gridcolor: "rgba(31,34,32,0.08)",
      zeroline: false,
    };
  }

  function verticalMarker(date, color) {
    return {
      type: "line",
      x0: date,
      x1: date,
      y0: 0,
      y1: 1,
      xref: "x",
      yref: "paper",
      line: { color, width: 2, dash: "dot" },
    };
  }

  function markerLabel(date, text, color) {
    return {
      x: date,
      y: 1.08,
      xref: "x",
      yref: "paper",
      text,
      showarrow: false,
      xanchor: "left",
      font: { size: 11, color },
      bgcolor: "rgba(255,248,239,0.92)",
      bordercolor: "rgba(31,34,32,0.08)",
      borderwidth: 1,
      borderpad: 4,
    };
  }

  function emptyAnnotation(text) {
    return {
      x: 0.5,
      y: 0.5,
      xref: "paper",
      yref: "paper",
      text,
      showarrow: false,
      font: { size: 15, color: "#5d625e" },
      bgcolor: "rgba(255,248,239,0.92)",
      bordercolor: "rgba(31,34,32,0.08)",
      borderwidth: 1,
      borderpad: 10,
    };
  }

  function chartConfig() {
    return {
      responsive: true,
      displayModeBar: false,
    };
  }

  function sumValues(values) {
    return values.reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);
  }

  function average(values) {
    const valid = values.filter((value) => Number.isFinite(value));
    if (!valid.length) {
      return null;
    }
    return sumValues(valid) / valid.length;
  }

  function formatSignedPercent(value) {
    if (value == null) {
      return "N/A";
    }
    const formatted = Math.abs(value).toLocaleString(LOCALE, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${value >= 0 ? "+" : "-"}${formatted}%`;
  }

  function formatMetric(value) {
    if (value == null) {
      return "N/A";
    }
    if (value >= 1000000) {
      return `${(value / 1000000).toLocaleString(LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} mil.`;
    }
    if (value >= 1000) {
      return value.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
    }
    return value.toLocaleString(LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatCount(value) {
    return Number(value).toLocaleString(LOCALE, { maximumFractionDigits: 0 });
  }

  function regionLabel(region) {
    return REGION_LABELS[region] ?? region;
  }
})();
