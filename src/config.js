// Carga y valida sites.json y las variables de entorno.
import { readFile } from "node:fs/promises";

const DEFAULTS = { intervalMinutes: 5, sslWarnDays: 14, domainWarnDays: 30, slowMs: 3000, timeoutMs: 10_000, repeatHours: 24 };

export async function loadConfig(path, env = process.env) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  return parseConfig(raw, env);
}

export function parseConfig(raw, env = {}) {
  if (!raw || !Array.isArray(raw.sites) || raw.sites.length === 0) {
    throw new Error('La configuración necesita una lista "sites" con al menos una web');
  }
  const sites = raw.sites.map((s, i) => {
    if (!s?.url) throw new Error(`La web número ${i + 1} no tiene "url"`);
    let u;
    try {
      u = new URL(s.url);
    } catch {
      throw new Error(`URL no válida: ${s.url}`);
    }
    if (!["http:", "https:"].includes(u.protocol)) throw new Error(`Solo se admiten http y https: ${s.url}`);
    return {
      name: s.name ?? u.hostname,
      url: u.toString(),
      host: u.hostname,
      checkSsl: u.protocol === "https:" && s.checkSsl !== false,
      domain: s.checkDomain === false ? null : (s.domain ?? registrableDomain(u.hostname)),
    };
  });
  return {
    ...DEFAULTS,
    ...pick(raw, Object.keys(DEFAULTS)),
    title: raw.title ?? "Estado de las webs",
    sites,
    channels: {
      telegram: env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID } : undefined,
      webhookUrl: env.ALERT_WEBHOOK_URL || undefined,
    },
  };
}

// Aproximación sencilla: últimas dos etiquetas, o tres si es un sufijo de dos niveles conocido.
const TWO_LEVEL = new Set(["com.es", "org.es", "nom.es", "gob.es", "edu.es", "co.uk", "org.uk", "com.ar", "com.mx", "com.br"]);
export function registrableDomain(host) {
  const parts = host.toLowerCase().split(".");
  if (parts.length <= 2) return host.toLowerCase();
  const lastTwo = parts.slice(-2).join(".");
  return (TWO_LEVEL.has(lastTwo) ? parts.slice(-3) : parts.slice(-2)).join(".");
}

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
}
