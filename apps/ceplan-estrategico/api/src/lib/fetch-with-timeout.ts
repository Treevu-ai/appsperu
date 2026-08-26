const DEFAULT_TIMEOUT_MS = 30_000;

function configuredTimeout(): number {
  const value = Number(process.env.HTTP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1_000 && value <= 300_000 ? value : DEFAULT_TIMEOUT_MS;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeout = configuredTimeout()
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Timeout al consultar API: ${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
