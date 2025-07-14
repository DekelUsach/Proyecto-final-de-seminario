// server.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // 💥 solo desarrollo
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { InferenceClient } = require('@huggingface/inference');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const HF_TOKEN = process.env.HF_TOKEN;
if (!HF_TOKEN) {
  console.error('❌ Define HF_TOKEN en tu .env');
  process.exit(1);
}
const client = new InferenceClient(HF_TOKEN);

app.post('/api/chat', async (req, res) => {
  try {
    const {
      messages,
      model = 'deepseek-ai/DeepSeek-R1-0528',
      provider = 'fireworks-ai'
    } = req.body;

    const chatResponse = await client.chatCompletion({
      provider,
      model,
      messages,
      // le decimos al modelo que nos dé el texto segmentado
      // con el marcador ⇼ tal como tienes en tu system prompt
      // (ya está ahí en messages[0])
      stream: false
    });

    // 1) extraemos el contenido
    let content = chatResponse.choices?.[0]?.message?.content || '';
    // 2) limpiamos cualquier <think>…</think>
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    res.json({ message: { content } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error comunicándose con Hugging Face' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});
