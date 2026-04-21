// api/subscribe.js
// ReportCasa — waitlist subscription endpoint
// Sicurezza: nessuna chiave hardcoded, validazione input, CORS esplicito, honeypot.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_NOME = 100;
const MAX_PREZZO = 50;
const MAX_EMAIL = 254;

const ALLOWED_ORIGINS = [
  'https://reportcasa.it',
  'https://www.reportcasa.it',
];

export default async function handler(req, res) {
  // --- CORS: solo reportcasa.it ---
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Safety check: env vars caricate?
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_LIST_ID) {
    console.error('Missing env vars: BREVO_API_KEY or BREVO_LIST_ID');
    return res.status(500).json({ error: 'Configurazione server mancante' });
  }

  const { nome, email, prezzo, consenso, website } = req.body || {};

  // --- Honeypot: il campo "website" è invisibile nel form.
  // Se compilato = bot. Rispondiamo 200 finto per non dare feedback. ---
  if (website) {
    return res.status(200).json({ success: true });
  }

  // --- Consenso GDPR obbligatorio ---
  if (consenso !== true) {
    return res.status(400).json({ error: 'Consenso privacy obbligatorio' });
  }

  // --- Validazione nome ---
  if (
    typeof nome !== 'string' ||
    nome.trim().length === 0 ||
    nome.length > MAX_NOME
  ) {
    return res.status(400).json({ error: 'Nome non valido' });
  }

  // --- Validazione email ---
  if (
    typeof email !== 'string' ||
    email.length > MAX_EMAIL ||
    !EMAIL_RE.test(email)
  ) {
    return res.status(400).json({ error: 'Email non valida' });
  }

  // --- Prezzo (opzionale, difensivo) ---
  const prezzoSafe =
    typeof prezzo === 'string' && prezzo.length > 0 && prezzo.length <= MAX_PREZZO
      ? prezzo
      : 'non-risposto';

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        attributes: {
          FIRSTNAME: nome.trim(),
          PREZZO_SURVEY: prezzoSafe,
          CONSENSO_TS: new Date().toISOString(),
        },
        listIds: [parseInt(process.env.BREVO_LIST_ID, 10)],
        updateEnabled: true,
      }),
    });

    // Successo pieno (201 creato, 204 aggiornato)
    if (response.ok || response.status === 204) {
      return res.status(200).json({ success: true });
    }

    // Contatto già esistente → per l'utente è un successo silenzioso
    if (response.status === 400) {
      const errBody = await response.json().catch(() => ({}));
      if (errBody.code === 'duplicate_parameter') {
        return res.status(200).json({ success: true });
      }
      console.error('Brevo 400:', errBody);
      return res.status(400).json({ error: 'Dati non accettati' });
    }

    // Altri errori Brevo → log interno, messaggio generico al client
    const errorData = await response.json().catch(() => ({}));
    console.error('Brevo error:', response.status, errorData);
    return res.status(500).json({ error: 'Errore salvataggio contatto' });

  } catch (error) {
    console.error('Network error:', error);
    return res.status(500).json({ error: 'Errore di connessione' });
  }
}
