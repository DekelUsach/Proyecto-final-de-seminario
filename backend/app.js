const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const OLLAMA_URL = 'http://localhost:11434/api/chat';

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const response = await axios.post(OLLAMA_URL, {
      model: 'qwen3:1.7b',
      messages
    }, { responseType: 'stream' });

    let finalContent = '';
    const stream = response.data;

    const rl = require('readline').createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj?.message?.content) {
          finalContent += obj.message.content;
        }
      } catch (e) {
        continue;
      }
    }

    // Eliminar todo lo que esté entre <think> y </think>, incluidas las etiquetas
    finalContent = finalContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    res.json({ message: { content: finalContent } });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Error comunicándose con Ollama' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});