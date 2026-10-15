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
  <td><span class="dot ${e.level}"></span>${escapeHtml(e.name)}<div class="url">${escapeHtml(e.url)}</div></td>
  <td>${LABEL[e.level]}</td><td>${time}</td><td>${ssl}</td><td>${domain}</td>
  <td class="problems">${e.problems.map(escapeHtml).join("<br>") || "—"}</td>
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
  :root { --bg:#f7f8fa; --card:#fff; --text:#1d2330; --muted:#5b6475; --line:#e3e6eb; --ok:#1f9d55; --aviso:#d98a00; --caida:#d64545; }
  @media (prefers-color-scheme: dark) { :root { --bg:#12151b; --card:#1b2029; --text:#e8ebf0; --muted:#9aa3b2; --line:#2a313d; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 32px 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .banner { margin: 16px 0 24px; padding: 14px 16px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); border-left: 6px solid var(--${worst}); font-weight: 600; }
  .table-wrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
  table { width: 100%; border-collapse: collapse; min-width: 640px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  tr:last-child td { border-bottom: 0; }
  .url, .meta { color: var(--muted); font-size: 13px; }
  .problems { font-size: 13px; }
  .dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:8px; }
  .dot.ok { background: var(--ok); } .dot.aviso { background: var(--aviso); } .dot.caida { background: var(--caida); }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
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
</main>
</body>
</html>
`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
