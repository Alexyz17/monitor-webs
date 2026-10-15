import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { checkHttp, checkDomain, parseRdapExpiration, daysBetween } from "../src/checks.js";
import { evaluate, shouldAlert, formatAlert } from "../src/evaluate.js";
import { parseConfig, registrableDomain } from "../src/config.js";
import { renderStatusPage } from "../src/report.js";
import { notify } from "../src/notify.js";
import { runOnce } from "../src/index.js";

const T = { sslWarnDays: 14, domainWarnDays: 30, slowMs: 3000 };
const okHttp = { ok: true, status: 200, ms: 120 };

function server(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, "127.0.0.1", () => resolve(s));
  });
}

test("checkHttp: 200 es ok y 500 no", async () => {
  const s = await server((req, res) => {
    res.statusCode = req.url === "/roto" ? 500 : 200;
    res.end("x");
  });
  const base = `http://127.0.0.1:${s.address().port}`;
  assert.equal((await checkHttp(`${base}/`)).ok, true);
  const bad = await checkHttp(`${base}/roto`);
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 500);
  s.close();
});

test("checkHttp: tiempo de espera agotado", async () => {
  const s = await server(() => {}); // nunca responde
  const r = await checkHttp(`http://127.0.0.1:${s.address().port}/`, { timeoutMs: 200 });
  assert.equal(r.ok, false);
  assert.equal(r.error, "Tiempo de espera agotado");
  s.closeAllConnections();
  s.close();
});

test("checkHttp: host inexistente da error, no excepción", async () => {
  const r = await checkHttp("http://127.0.0.1:1/");
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test("RDAP: lee la fecha de caducidad", () => {
  const d = parseRdapExpiration({ events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }, { eventAction: "expiration", eventDate: "2027-01-01T00:00:00Z" }] });
  assert.equal(d.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(parseRdapExpiration({}), null);
  assert.equal(parseRdapExpiration({ events: [{ eventAction: "expiration", eventDate: "basura" }] }), null);
});

test("checkDomain: 404 y fechas ausentes se marcan como desconocidas", async () => {
  const now = new Date("2026-10-15T00:00:00Z");
  const f404 = async () => ({ status: 404, ok: false });
  assert.equal((await checkDomain("x.es", { fetchImpl: f404, now })).unknown, true);
  const fOk = async () => ({ status: 200, ok: true, json: async () => ({ events: [{ eventAction: "expiration", eventDate: "2026-11-04T00:00:00Z" }] }) });
  const r = await checkDomain("x.com", { fetchImpl: fOk, now });
  assert.equal(r.daysLeft, 20);
  const fThrow = async () => { throw new Error("sin red"); };
  assert.equal((await checkDomain("x.com", { fetchImpl: fThrow, now })).unknown, true);
});

test("daysBetween redondea hacia abajo", () => {
  assert.equal(daysBetween(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-03T23:00:00Z")), 2);
});

test("evaluate: todo bien", () => {
  const r = evaluate({ http: okHttp, ssl: { ok: true, daysLeft: 80 }, domain: { ok: true, daysLeft: 200 } }, T);
  assert.deepEqual(r, { level: "ok", problems: [] });
});

test("evaluate: SSL a punto de caducar y web lenta son avisos", () => {
  const r = evaluate({ http: { ok: true, status: 200, ms: 5000 }, ssl: { ok: true, daysLeft: 7 }, domain: null }, T);
  assert.equal(r.level, "aviso");
  assert.equal(r.problems.length, 2);
});

test("evaluate: caída gana a aviso", () => {
  const r = evaluate({ http: { ok: false, error: "ECONNREFUSED" }, ssl: { ok: true, daysLeft: 3 }, domain: { daysLeft: 10 } }, T);
  assert.equal(r.level, "caida");
  assert.equal(r.problems.length, 3);
});

test("evaluate: SSL caducado o no válido es caída; dominio desconocido se ignora", () => {
  assert.equal(evaluate({ http: okHttp, ssl: { ok: false, daysLeft: -2 }, domain: { unknown: true } }, T).level, "caida");
  assert.equal(evaluate({ http: okHttp, ssl: { ok: false, daysLeft: 50, error: "Certificado no válido" }, domain: null }, T).level, "caida");
  assert.equal(evaluate({ http: okHttp, ssl: { ok: false, error: "Sin certificado" }, domain: null }, T).level, "caida");
  assert.equal(evaluate({ http: okHttp, ssl: null, domain: { unknown: true } }, T).level, "ok");
});

test("shouldAlert: no repite la misma alerta antes de 24 h", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const bad = { level: "caida", problems: ["x"] };
  assert.equal(shouldAlert(undefined, { level: "ok", problems: [] }, undefined, now), false);
  assert.equal(shouldAlert(undefined, bad, undefined, now), true);
  assert.equal(shouldAlert(bad, bad, { lastAlertAt: "2026-10-15T11:00:00Z" }, now), false);
  assert.equal(shouldAlert(bad, bad, { lastAlertAt: "2026-10-14T11:00:00Z" }, now), true);
  assert.equal(shouldAlert(bad, { level: "ok", problems: [] }, {}, now), true);
  assert.equal(shouldAlert(bad, { level: "caida", problems: ["y"] }, { lastAlertAt: "2026-10-15T11:59:00Z" }, now), true);
});

test("formatAlert: textos de caída y recuperación", () => {
  const site = { name: "Academia", url: "https://ejemplo.cat/" };
  assert.match(formatAlert(site, { level: "caida", problems: ["No responde"] }), /CAÍDA/);
  assert.match(formatAlert(site, { level: "ok", problems: [] }, "caida"), /vuelve a estar bien/);
});

test("parseConfig: valida y rellena valores por defecto", () => {
  const c = parseConfig({ sites: [{ url: "https://www.ejemplo.com.es/" }, { url: "http://otra.cat", checkDomain: false }] }, { ALERT_WEBHOOK_URL: "https://hook" });
  assert.equal(c.intervalMinutes, 5);
  assert.equal(c.sites[0].domain, "ejemplo.com.es");
  assert.equal(c.sites[0].checkSsl, true);
  assert.equal(c.sites[1].checkSsl, false);
  assert.equal(c.sites[1].domain, null);
  assert.equal(c.channels.webhookUrl, "https://hook");
  assert.equal(c.channels.telegram, undefined);
  assert.throws(() => parseConfig({ sites: [] }));
  assert.throws(() => parseConfig({ sites: [{ url: "ftp://x.com" }] }));
  assert.throws(() => parseConfig({ sites: [{ url: "no es url" }] }));
});

test("registrableDomain", () => {
  assert.equal(registrableDomain("www.terrassa.cat"), "terrassa.cat");
  assert.equal(registrableDomain("a.b.ejemplo.com.es"), "ejemplo.com.es");
  assert.equal(registrableDomain("ejemplo.es"), "ejemplo.es");
});

test("renderStatusPage: escapa HTML y muestra el estado peor", () => {
  const html = renderStatusPage([
    { name: "<script>", url: "https://a.com", level: "ok", problems: [], http: okHttp },
    { name: "B", url: "https://b.com", level: "caida", problems: ["No responde"], http: { ok: false } },
  ]);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Alguna web tiene problemas"));
});

test("notify: sin canales escribe en consola; con webhook hace POST", async () => {
  const logs = [];
  assert.deepEqual(await notify("hola", {}, { log: (s) => logs.push(s) }), []);
  assert.match(logs[0], /hola/);
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  const sent = await notify("hola", { webhookUrl: "https://hook", telegram: { token: "t", chatId: "1" } }, { fetchImpl });
  assert.deepEqual(sent, ["telegram", "webhook"]);
  assert.equal(calls[0].body.chat_id, "1");
  assert.equal(calls[1].body.text, "hola");
});

test("runOnce: avisa al caer, no repite, avisa al recuperarse y cachea el dominio", async () => {
  const config = parseConfig({ sites: [{ name: "Web", url: "https://web.com" }] });
  const state = { sites: {} };
  const sent = [];
  let up = false, domainCalls = 0;
  const deps = {
    http: async () => (up ? okHttp : { ok: false, error: "ECONNREFUSED" }),
    ssl: async () => ({ ok: true, daysLeft: 60 }),
    domain: async () => { domainCalls++; return { ok: true, daysLeft: 300 }; },
    send: async (text) => { sent.push(text); return []; },
  };
  const t0 = new Date("2026-10-15T10:00:00Z");
  await runOnce(config, state, t0, deps);
  await runOnce(config, state, new Date("2026-10-15T10:05:00Z"), deps);
  up = true;
  const [e] = await runOnce(config, state, new Date("2026-10-15T10:10:00Z"), deps);
  assert.equal(sent.length, 2);
  assert.match(sent[0], /CAÍDA/);
  assert.match(sent[1], /vuelve a estar bien/);
  assert.equal(e.level, "ok");
  assert.equal(domainCalls, 1);
  await runOnce(config, state, new Date("2026-10-16T00:00:00Z"), deps);
  assert.equal(domainCalls, 2);
});
