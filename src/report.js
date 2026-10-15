// Genera una página de estado estática (status.html) que se puede publicar en GitLab Pages.

const LABEL = { ok: "Operativa", aviso: "Aviso", caida: "Caída" };

export function renderStatusPage(entries, { title = "Estado de las webs", generatedAt = new Date() } = {}) {
  const worst = entries.some((e) => e.level === "caida") ? "caida" : entries.some((e) => e.level === "aviso") ? "aviso" : "ok";
  const headline = { ok: "Todas las webs funcionan", aviso: "Hay avisos pendientes", caida: "Alguna web tiene problemas" }[worst];
  const rows = entries
    .map((e) => {
      const ssl = e.ssl?.daysLeft !== undefined ? `${e.ssl.daysLeft} días` : "—";
      const domain = e.domain?.daysLeft !== undefined ? `${e.domain.daysLeft} días` : "—";
      const time = e.http?.ms !== undefined ? `${e.http.ms} ms` : "—";
      return `<tr>
  <td><span class="dot ${e.level}"></span>${escapeHtml(e.name)}<div class="url"><a href="${escapeHtml(e.url)}" rel="noopener">${escapeHtml(e.url)}</a></div></td>
  <td data-label="Estado">${LABEL[e.level]}</td><td data-label="Respuesta">${time}</td><td data-label="SSL caduca en">${ssl}</td><td data-label="Dominio caduca en">${domain}</td>
  <td data-label="Detalle" class="problems">${e.problems.map(escapeHtml).join("<br>") || "—"}</td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { --bg:#f7f8fa; --card:#fff; --text:#1d2330; --muted:#5b6475; --line:#e3e6eb; --ok:#1f9d55; --aviso:#d98a00; --caida:#d64545; --accent:#0e7490; }
  @media (prefers-color-scheme: dark) { :root { --bg:#12151b; --card:#1b2029; --text:#e8ebf0; --muted:#9aa3b2; --line:#2a313d; --accent:#22d3ee; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 32px 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }
  .logo { width: 30px; height: 30px; color: var(--accent); flex: none; }
  a { color: inherit; text-decoration-color: var(--accent); text-underline-offset: 2px; }
  a:hover, a:focus-visible { color: var(--accent); }
  td { font-variant-numeric: tabular-nums; }
  footer { margin-top: 16px; font-size: 13px; color: var(--muted); }
  .banner { margin: 16px 0 24px; padding: 14px 16px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); border-left: 6px solid var(--${worst}); font-weight: 600; }
  .table-wrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
  table { width: 100%; border-collapse: collapse; min-width: 640px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { white-space: nowrap; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  tr:last-child td { border-bottom: 0; }
  .url, .meta { color: var(--muted); font-size: 13px; }
  .problems { font-size: 13px; }
  .dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:8px; }
  @media (max-width: 640px) {
    table { min-width: 0; } thead { display: none; }
    tr, td { display: block; } tr { border-bottom: 1px solid var(--line); } tr:last-child { border-bottom: 0; }
    td { border: 0; padding: 4px 14px; } td:first-child { padding-top: 12px; font-weight: 600; } td:last-child { padding-bottom: 12px; }
    td[data-label]::before { content: attr(data-label) ": "; color: var(--muted); }
    .url { font-weight: 400; overflow-wrap: anywhere; }
  }
  .dot.ok { background: var(--ok); } .dot.aviso { background: var(--aviso); } .dot.caida { background: var(--caida); }
</style>
</head>
<body>
<main>
  <h1><svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M6 17h5l2.5-6 4 11 3-8 1.5 3H26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>${escapeHtml(title)}</h1>
  <div class="meta">Última comprobación: ${generatedAt.toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</div>
  <div class="banner">${headline}</div>
  <div class="table-wrap">
  <table>
    <thead><tr><th>Web</th><th>Estado</th><th>Respuesta</th><th>SSL caduca en</th><th>Dominio caduca en</th><th>Detalle</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  </div>
  <footer>Generado por <a href="https://github.com/Alexyz17/monitor-webs">monitor-webs</a></footer>
</main>
</body>
</html>
`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
