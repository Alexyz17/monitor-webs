#!/usr/bin/env node
// Punto de entrada. Uso:
//   node src/index.js            → comprueba en bucle cada intervalMinutes
//   node src/index.js --once     → una sola pasada (para cron o CI)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { checkHttp, checkSsl, checkDomain } from "./checks.js";
import { evaluate, shouldAlert, formatAlert } from "./evaluate.js";
import { notify } from "./notify.js";
import { renderStatusPage } from "./report.js";

const CONFIG = process.env.CONFIG_PATH ?? "sites.json";
const STATE = process.env.STATE_PATH ?? "data/state.json";
const OUTPUT = process.env.STATUS_PAGE_PATH ?? "public/index.html";
const DOMAIN_CACHE_HOURS = 12;

export async function runOnce(config, state, now = new Date(), deps = {}) {
  const { http = checkHttp, ssl = checkSsl, domain = checkDomain, send = notify } = deps;
  const entries = [];
  for (const site of config.sites) {
    const prev = state.sites[site.url];
    const [h, s] = await Promise.all([
      http(site.url, { timeoutMs: config.timeoutMs }),
      site.checkSsl ? ssl(site.host, { timeoutMs: config.timeoutMs, now }) : Promise.resolve(null),
    ]);
    // El dominio cambia poco: se consulta como mucho cada 12 h para no saturar RDAP.
    let d = null;
    if (site.domain) {
      const cached = prev?.domain;
      const fresh = cached && now.getTime() - new Date(prev.domainCheckedAt).getTime() < DOMAIN_CACHE_HOURS * 3600_000;
      d = fresh ? cached : await domain(site.domain, { timeoutMs: config.timeoutMs, now });
    }
    const verdict = evaluate({ http: h, ssl: s, domain: d }, config);
    const entry = { ...site, http: h, ssl: s, domain: d, ...verdict };
    entries.push(entry);

    const prevVerdict = prev ? { level: prev.level, problems: prev.problems } : undefined;
    let lastAlertAt = prev?.lastAlertAt;
    if (shouldAlert(prevVerdict, verdict, prev, now, config.repeatHours)) {
      await send(formatAlert(site, verdict, prev?.level), config.channels).catch((e) => console.error("Error al avisar:", e.message));
      lastAlertAt = now.toISOString();
    }
    state.sites[site.url] = {
      level: verdict.level,
      problems: verdict.problems,
      lastAlertAt,
      domain: d,
      domainCheckedAt: d === prev?.domain && prev?.domainCheckedAt ? prev.domainCheckedAt : now.toISOString(),
      lastCheckAt: now.toISOString(),
    };
  }
  return entries;
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE, "utf8"));
  } catch {
    return { sites: {} };
  }
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function cycle(config) {
  const now = new Date();
  const state = await readState();
  const entries = await runOnce(config, state, now);
  await write(STATE, JSON.stringify(state, null, 2));
  await write(OUTPUT, renderStatusPage(entries, { title: config.title, generatedAt: now }));
  for (const e of entries) {
    console.log(`${now.toISOString()}  ${e.level.padEnd(5)}  ${e.name}${e.problems.length ? "  · " + e.problems.join(" · ") : ""}`);
  }
  return entries;
}

async function main() {
  const config = await loadConfig(CONFIG);
  if (process.argv.includes("--once")) {
    const entries = await cycle(config);
    process.exitCode = entries.some((e) => e.level === "caida") ? 1 : 0;
    return;
  }
  console.log(`Vigilando ${config.sites.length} webs cada ${config.intervalMinutes} min. Ctrl+C para salir.`);
  for (;;) {
    await cycle(config).catch((e) => console.error("Error en la comprobación:", e.message));
    await new Promise((r) => setTimeout(r, config.intervalMinutes * 60_000));
  }
}

// realpath: con `npm link` o el bin de npm, argv[1] es un enlace al archivo
const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(2);
  });
}
