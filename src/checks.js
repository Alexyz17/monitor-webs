// Comprobaciones: disponibilidad HTTP, caducidad del certificado SSL y caducidad del dominio.
import tls from "node:tls";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Comprueba que una URL responde con un código 2xx/3xx en el tiempo máximo.
 * @param {string} url
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ ok: boolean, status?: number, ms?: number, error?: string }>}
 */
export async function checkHttp(url, { timeoutMs = 10_000, fetchImpl = fetch } = {}) {
  const started = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "monitor-webs/1.0" },
    });
    const ms = Date.now() - started;
    return { ok: res.status < 400, status: res.status, ms };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: describeError(err) };
  }
}

/**
 * Lee el certificado TLS del host y devuelve los días que faltan para que caduque.
 * @param {string} host
 * @param {{ port?: number, timeoutMs?: number, now?: Date }} [opts]
 * @returns {Promise<{ ok: boolean, daysLeft?: number, validTo?: string, issuer?: string, error?: string }>}
 */
export function checkSsl(host, { port = 443, timeoutMs = 10_000, now = new Date() } = {}) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => done({ ok: false, error: "Tiempo de espera agotado" }));
    socket.once("error", (err) => done({ ok: false, error: describeError(err) }));
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) return done({ ok: false, error: "Sin certificado" });
      const validTo = new Date(cert.valid_to);
      const authorized = socket.authorized;
      done({
        ok: authorized,
        daysLeft: daysBetween(now, validTo),
        validTo: validTo.toISOString(),
        issuer: cert.issuer?.O ?? cert.issuer?.CN,
        error: authorized ? undefined : `Certificado no válido: ${socket.authorizationError}`,
      });
    });
  });
}

/**
 * Consulta la fecha de caducidad del dominio por RDAP (el sustituto moderno de WHOIS).
 * Algunos registros (por ejemplo .es) no publican la fecha: se devuelve unknown.
 * @param {string} domain
 * @param {{ timeoutMs?: number, now?: Date, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ ok: boolean, daysLeft?: number, expiresAt?: string, unknown?: boolean, error?: string }>}
 */
export async function checkDomain(domain, { timeoutMs = 10_000, now = new Date(), fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(timeoutMs),
      // rdap.org responde 403 al user-agent por defecto de Node ("node")
      headers: { accept: "application/rdap+json", "user-agent": "monitor-webs/1.0" },
    });
    if (res.status === 404) return { ok: true, unknown: true, error: "RDAP no disponible para este dominio" };
    if (!res.ok) return { ok: true, unknown: true, error: `RDAP respondió ${res.status}` };
    const data = await res.json();
    const expiresAt = parseRdapExpiration(data);
    if (!expiresAt) return { ok: true, unknown: true, error: "El registro no publica la fecha de caducidad" };
    return { ok: true, daysLeft: daysBetween(now, expiresAt), expiresAt: expiresAt.toISOString() };
  } catch (err) {
    return { ok: true, unknown: true, error: describeError(err) };
  }
}

/** @param {any} data */
export function parseRdapExpiration(data) {
  const ev = (data?.events ?? []).find((e) => e?.eventAction === "expiration");
  if (!ev?.eventDate) return null;
  const d = new Date(ev.eventDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function describeError(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "Tiempo de espera agotado";
  const code = err?.cause?.code ?? err?.code;
  return code ? `${code}: ${err.message}` : String(err?.message ?? err);
}
