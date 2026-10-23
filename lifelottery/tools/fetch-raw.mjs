#!/usr/bin/env node
// Downloads the open datasets used by build-data.mjs into ./raw (inside lifelottery/tools).
//
//   node lifelottery/tools/fetch-raw.mjs [outDir]
//
// All sources are public CSV files on raw.githubusercontent.com (Our World in Data repos).
// The files are treated purely as untrusted DATA: they are only ever parsed as CSV text.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] || resolve(here, 'raw'));

const DS = 'https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/';
const d = (dir) => `${DS}${encodeURIComponent(dir)}/${encodeURIComponent(dir)}.csv`;

/** key -> URL. Keys are the file names (without .csv) that build-data.mjs expects. */
export const SOURCES = {
  covid: 'https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/latest/owid-covid-latest.csv',
  leSexDiff: d('Female and male life expectancy at birth - OWID based on UN Population Division (2017)'),
  leLong: d('Long run life expectancy - Gapminder, UN'),
  u5mr: d('Child Mortality Estimates - CME Info (2018)'),
  imr: d('Infant mortality rate (IHME - 2017)'),
  infantDeaths: d('Number of infant deaths (IHME - 2017)'),
  tfr: d('Fertility rate (Complete Gapminder, v12) (2017)'),
  schoolExp: d('Expected Years of Schooling - UNDP (2018)'),
  schoolMean: d('Years of Schooling - based on Lee-Lee (2016), Barro-Lee (2018) and UNDP (2018)'),
  schoolWomen: d('Mean years of schooling, women (15 to 49) – Our World In Data (2017)'),
  srb: d('Sex ratio at birth (Chao et al. 2019)'),
  urban: d('Urban and rural population 1950-2050 - UN World Urbanization Prospects 2018'),
  suicide: d('Suicide rates by sex and age (IHME, 2019)'),
  smoking: d('Smoking prevalence and cigarette consumption (IHME, GHDx (2012))'),
  marryAge: d('Estimated average age at marriage, by gender (UN)'),
  pop: d('Total population - Gapminder, UN Population Division'),
};

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const [key, url] of Object.entries(SOURCES)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
    const text = await res.text();
    await writeFile(resolve(outDir, `${key}.csv`), text);
    console.log(`${key.padEnd(14)} ${String(text.length).padStart(8)} bytes`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
