// ⚠️ SOLO PARA DESARROLLO: desactiva verificación TLS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fetch from 'node-fetch'; 

const app = express();
app.use(cors());
app.use(bodyParser.json());

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error('❌ Define GEMINI_API_KEY en tu .env');
  process.exit(1);
}

app.post('/api/chat', async (req, res) => {
  const { instrucciones, texto } = req.body;

  if (!instrucciones || !texto) {
    return res.status(400).json({ error: 'Faltan instrucciones o texto' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: instrucciones },
            { text: texto }
          ]
        }
      ]
    };

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error Gemini API:', apiRes.status, errText);
      return res.status(500).json({ error: 'Error en Gemini API', details: errText });
    }

    const json = await apiRes.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return res.json({ text });
  } catch (err) {
    console.error('❌ Error al llamar Gemini API:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ Backend escuchando en http://localhost:${PORT}`);
});
