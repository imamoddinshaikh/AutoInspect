// services/emailService.ts
// Centralized email/upload logic shared by SummaryScreen and InspectionsListScreen.
// Preserves the existing Netlify function interface:
//   POST /.netlify/functions/upload-report { filename, data } -> { key }
//   POST /.netlify/functions/send-email-attach { to, filename, data, key?, subject?, html? }

export interface SendInspectionEmailMeta {
  filename?: string;
  policyNumber?: string;
  insuredName?: string;
  agentName?: string;
  subject?: string;
  html?: string;
}

export interface SendInspectionEmailResult {
  base64: string;
  filename: string;
  key: string | null;
}

// Blob -> base64 (payload part only, without data:... prefix)
export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el PDF'));
    reader.onload = () => {
      const result = reader.result as string; // "data:application/pdf;base64,XXXX"
      const part = result.split(',')[1] || '';
      if (!part) {
        reject(new Error('Error al convertir el archivo a base64'));
        return;
      }
      resolve(part);
    };
    reader.readAsDataURL(blob);
  });

// fetch with retry (no keepalive), 30s timeout per attempt
export const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  retries = 2,
  backoff = 600,
): Promise<Response> => {
  const headers = new Headers(options.headers || {});
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const merged: RequestInit = {
    ...options,
    headers,
    credentials: options.credentials ?? 'same-origin',
    signal: controller.signal,
  };

  try {
    const res = await fetch(url, merged);
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (retries <= 0) throw err;
    await new Promise((r) => setTimeout(r, backoff));
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  }
};

export const sanitizeFilename = (name: string): string =>
  name.replace(/[^\w.\-]+/g, '_');

export const buildInspectionFilename = (
  policyNumber?: string | null,
  prefix = 'inspeccion',
): string =>
  sanitizeFilename(`${prefix}_${policyNumber || 'sin_poliza'}_${Date.now()}.pdf`);

// Best-effort upload to Netlify Blobs. Returns the key or null (fallback to base64).
export const uploadReport = async (
  filename: string,
  base64: string,
): Promise<string | null> => {
  try {
    const upRes = await fetchWithRetry('/.netlify/functions/upload-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data: base64 }),
      credentials: 'same-origin',
    });
    if (upRes.ok) {
      const result = await upRes.json();
      return result.key || result.blobId || null;
    }
    const errorText = await upRes.text();
    console.warn('Error subiendo a Blobs, usando fallback a base64:', errorText);
    return null;
  } catch (e) {
    console.warn('Error en subida a Blobs, usando fallback a base64:', e);
    return null;
  }
};

const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const formatEmailError = (e: any): string => {
  const msg = e?.message || 'Ocurrió un error enviando el correo';
  if (e?.name === 'AbortError' || /timeout/i.test(msg)) {
    return 'La operación tardó demasiado tiempo. Por favor, inténtalo de nuevo.';
  }
  if (/Failed to fetch/i.test(msg)) {
    return 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
  }
  return msg;
};

/**
 * Generate base64 from the PDF blob, upload it (best effort), and send it
 * through the existing `send-email-attach` Netlify function.
 */
export const sendInspectionEmail = async (
  pdfBlob: Blob,
  to: string,
  meta: SendInspectionEmailMeta = {},
): Promise<SendInspectionEmailResult> => {
  if (!isValidEmail(to)) {
    throw new Error('El formato del correo electrónico no es válido');
  }

  const base64 = await blobToBase64(pdfBlob);
  const filename = meta.filename
    ? sanitizeFilename(meta.filename)
    : buildInspectionFilename(meta.policyNumber);

  const key = await uploadReport(filename, base64);

  const mailPayload: Record<string, unknown> = {
    to,
    filename,
    data: base64,
    ...(key ? { key } : {}),
  };
  if (meta.subject) mailPayload.subject = meta.subject;
  if (meta.html) mailPayload.html = meta.html;

  const mailRes = await fetchWithRetry('/.netlify/functions/send-email-attach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mailPayload),
    credentials: 'same-origin',
  });

  if (!mailRes.ok) {
    const error = await mailRes.json().catch(() => ({}));
    throw new Error((error as any).message || 'Error al enviar el correo');
  }

  return { base64, filename, key };
};
