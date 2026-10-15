// Envío de alertas: Telegram, un webhook genérico (Discord, Slack, n8n…) o la consola.

/**
 * @param {string} text
 * @param {{ telegram?: { token: string, chatId: string }, webhookUrl?: string }} channels
 * @param {{ fetchImpl?: typeof fetch, log?: (s: string) => void }} [opts]
 */
export async function notify(text, channels, { fetchImpl = fetch, log = console.log } = {}) {
  const sent = [];
  if (channels.telegram?.token && channels.telegram?.chatId) {
    const res = await fetchImpl(`https://api.telegram.org/bot${channels.telegram.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: channels.telegram.chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) log(`No se pudo enviar a Telegram: ${res.status}`);
    else sent.push("telegram");
  }
  if (channels.webhookUrl) {
    // "content" lo entiende Discord y "text" Slack; otros servicios reciben ambos.
    const res = await fetchImpl(channels.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) log(`No se pudo enviar al webhook: ${res.status}`);
    else sent.push("webhook");
  }
  if (sent.length === 0) log(`[alerta] ${text}`);
  return sent;
}
