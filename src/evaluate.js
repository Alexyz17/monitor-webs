// Convierte los resultados en un estado por web y decide qué alertas enviar.

/** @typedef {"ok" | "aviso" | "caida"} Level */

/**
 * @param {{ http: any, ssl: any, domain: any }} result
 * @param {{ sslWarnDays: number, domainWarnDays: number, slowMs: number }} thresholds
 * @returns {{ level: Level, problems: string[] }}
 */
export function evaluate(result, thresholds) {
  const problems = [];
  let level = /** @type {Level} */ ("ok");
  const raise = (to) => {
    if (to === "caida" || (to === "aviso" && level === "ok")) level = to;
  };

  const { http, ssl, domain } = result;
  if (!http.ok) {
    raise("caida");
    problems.push(http.status ? `La web responde ${http.status}` : `La web no responde (${http.error})`);
  } else if (http.ms > thresholds.slowMs) {
    raise("aviso");
    problems.push(`Lenta: ${http.ms} ms`);
  }

  if (ssl) {
    if (!ssl.ok && ssl.daysLeft === undefined) {
      raise("caida");
      problems.push(`SSL: ${ssl.error}`);
    } else if (ssl.daysLeft < 0) {
      raise("caida");
      problems.push(`El certificado SSL caducó hace ${-ssl.daysLeft} días`);
    } else if (!ssl.ok) {
      raise("caida");
      problems.push(ssl.error);
    } else if (ssl.daysLeft <= thresholds.sslWarnDays) {
      raise("aviso");
      problems.push(`El certificado SSL caduca en ${ssl.daysLeft} días`);
    }
  }

  if (domain && !domain.unknown) {
    if (domain.daysLeft < 0) {
      raise("caida");
      problems.push(`El dominio caducó hace ${-domain.daysLeft} días`);
    } else if (domain.daysLeft <= thresholds.domainWarnDays) {
      raise("aviso");
      problems.push(`El dominio caduca en ${domain.daysLeft} días`);
    }
  }

  return { level, problems };
}

/**
 * Decide si hay que avisar comparando con el estado anterior, para no repetir la misma alerta.
 * Avisa cuando cambia el nivel, cuando cambian los problemas o, si sigue mal, una vez al día.
 * @param {{ level: Level, problems: string[] } | undefined} prev
 * @param {{ level: Level, problems: string[] }} curr
 * @param {{ lastAlertAt?: string } | undefined} prevMeta
 * @param {Date} now
 */
export function shouldAlert(prev, curr, prevMeta, now, repeatHours = 24) {
  if (!prev) return curr.level !== "ok";
  if (prev.level !== curr.level) return true;
  if (curr.level === "ok") return false;
  if (prev.problems.join("|") !== curr.problems.join("|")) return true;
  if (!prevMeta?.lastAlertAt) return true;
  return now.getTime() - new Date(prevMeta.lastAlertAt).getTime() >= repeatHours * 3600_000;
}

export function formatAlert(site, curr, prevLevel) {
  if (curr.level === "ok") {
    return `✅ ${site.name} vuelve a estar bien${prevLevel ? ` (antes: ${prevLevel})` : ""}\n${site.url}`;
  }
  const icon = curr.level === "caida" ? "🔴" : "🟠";
  return `${icon} ${site.name}: ${curr.level === "caida" ? "CAÍDA" : "aviso"}\n${site.url}\n- ${curr.problems.join("\n- ")}`;
}
