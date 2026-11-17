export async function safeJsonFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const resp = await fetch(input, init);
  const contentType = resp.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const rawText = await resp.text();
    if (rawText.trim().startsWith('<') || rawText.includes('<!DOCTYPE')) {
      throw new Error(
        `Il backend Node.js non è attivo su questo host (ricevuto HTML ${resp.status} anziché JSON). ` +
        `Se l'app è ospitata su Netlify, gli endpoint di backend Express (/api/...) non sono attivi: ` +
        `è necessario eseguire il server Node.js su un host applicativo (es. Render, Railway o Cloud Run).`
      );
    }
    throw new Error(
      `Risposta non valida dal server (${resp.status} ${resp.statusText}): ${rawText.slice(0, 120)}`
    );
  }

  const data = (await resp.json()) as T & { error?: string };
  if (!resp.ok) {
    throw new Error(
      (data as { error?: string })?.error ||
      `Errore dal server (${resp.status} ${resp.statusText})`
    );
  }

  return data;
}
