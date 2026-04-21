export default async function handler(req, res) {
  // Accetta solo richieste POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nome, email, prezzo } = req.body;

  // Validazione base
  if (!nome || !email || !email.includes('@')) {
    return res.status(400).json({ error: 'Dati non validi' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        email: email,
        attributes: {
          FIRSTNAME: nome,
          PREZZO_SURVEY: prezzo || 'non-risposto'
        },
        listIds: [parseInt(process.env.BREVO_LIST_ID)],
        updateEnabled: true
      })
    });

    if (response.ok || response.status === 204) {
      return res.status(200).json({ success: true });
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error('Brevo error:', response.status, errorData);
      return res.status(500).json({ error: 'Errore salvataggio contatto' });
    }
  } catch (error) {
    console.error('Network error:', error);
    return res.status(500).json({ error: 'Errore di connessione' });
  }
}
