# Births and Birth-Related Loss Report

This repo builds a static HTML report for:

- annual live births
- monthly seasonally adjusted births where HFD/STFF coverage exists
- stillbirths and stillbirth rates
- neonatal deaths and neonatal mortality rates
- country-level COVID vaccine uptake context

## Build

Run:

```bash
node scripts/build-report.mjs
```

That regenerates:

- `report.html`
- `vendor/plotly.min.js`

## Open

Open `report.html` in a browser.

The report is self-contained for rendering and inlines the plotting library, so it does not depend on loading a separate script at runtime.

## Deploy

This output is a single static site, so the easiest deployment options are:

- Netlify Drop: drag the project folder or `report.html` output folder into Netlify's manual deploy UI.
- Cloudflare Pages: create a Pages project and upload the prebuilt static files.
- GitHub Pages: publish from a repository if you want versioned deploys tied to git.

For this project, Netlify Drop is the shortest path because there is no server and no runtime build requirement after `node scripts/build-report.mjs`.

## Data sources

- UN World Population Prospects 2024 via Our World in Data grapher export
- Our World in Data continent mapping
- Human Fertility Database Short-Term Fertility Fluctuations
- WHO archived monthly COVID vaccine uptake
- UNICEF / UN IGME child mortality dataflow
