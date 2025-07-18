process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // 💥 solo desarrollo
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const HF_TOKEN = process.env.HF_TOKEN;
if (!HF_TOKEN) {
  console.error('❌ Define HF_TOKEN en tu .env');
  process.exit(1);
}

// Función para consultar directamente el endpoint de chat de Hugging Face
async function queryHfChat(data) {
  const response = await fetch(
    'https://router.huggingface.co/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Hugging Face error: ${response.status} ${errText}`);
  }

  const result = await response.json();
  return result;
}

app.post('/api/chat', async (req, res) => {
  try {
    const {
      messages,
      model = 'mistralai/Mixtral-8x7B-Instruct-v0.1:together',
      ...rest
    } = req.body;

    // Llamamos al endpoint de chat de HF
    const hfResponse = await queryHfChat({ messages, model, ...rest });
    
    // Extraemos el contenido de la primera elección
    let content =
      hfResponse.choices?.[0]?.message?.content || '';
    // Limpiamos posibles etiquetas <think>
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    res.json({ message: { content } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error comunicándose con Hugging Face', details: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});
