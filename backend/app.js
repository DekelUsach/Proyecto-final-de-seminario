// ⚠️ SOLO PARA DESARROLLO: desactiva verificación TLS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { InferenceClient } from '@huggingface/inference';

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Comprueba que tengas el token en .env
const HF_TOKEN = process.env.HF_TOKEN;
if (!HF_TOKEN) {
  console.error('❌ Define HF_TOKEN en tu .env');
  process.exit(1);
}

// Cliente de HF
const client = new InferenceClient(HF_TOKEN);

// Repositorio que encapsula la llamada al modelo
class BlintRepository {
  async llamarModeloChat(systemPrompt, userPrompt) {
    try {
      const respuesta = await client.chatCompletion({
        provider: 'together',      // o 'huggingface', según tu plan
        model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt }
        ],
        temperature: 0.0,
        max_tokens: 300
      });
      return respuesta.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      console.error('❌ Error al llamar Hugging Face:', err);
      throw new Error('Error al llamar al modelo');
    }
  }
}

const repo = new BlintRepository();

// Endpoint para tu frontend
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length < 2) {
    return res.status(400).json({ error: 'Formato inválido: se esperan mensajes system + user' });
  }

  // Extrae el prompt de sistema (primer mensaje) y el último user
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs = messages.filter(m => m.role === 'user');
  if (!systemMsg || userMsgs.length === 0) {
    return res.status(400).json({ error: 'Faltan mensajes system y/o user' });
  }
  const systemPrompt = systemMsg.content;
  const userPrompt   = userMsgs[userMsgs.length - 1].content;

  try {
    const content = await repo.llamarModeloChat(systemPrompt, userPrompt);
    return res.json({ message: { content } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});



// // Función para consultar directamente el endpoint de chat de Hugging Face
// async function queryHfChat(data) {
//   const response = await fetch(
//     'https://router.huggingface.co/v1/chat/completions',
//     {
//       method: 'POST',
//       headers: {
//         Authorization: `Bearer ${HF_TOKEN}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(data),
//     }
//   );

//   if (!response.ok) {
//     const errText = await response.text();
//     throw new Error(`Hugging Face error: ${response.status} ${errText}`);
//   }

//   const result = await response.json();
//   return result;
// }

// app.post('/api/chat', async (req, res) => {
//   try {
//     const {
//       messages,
//       model = 'mistralai/Mixtral-8x7B-Instruct-v0.1',
//       ...rest
//     } = req.body;

//     // Llamamos al endpoint de chat de HF
//     const hfResponse = await queryHfChat({ messages, model, ...rest });
    
//     // Extraemos el contenido de la primera elección
//     let content =
//       hfResponse.choices?.[0]?.message?.content || '';
//     // Limpiamos posibles etiquetas <think>
//     content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

//     res.json({ message: { content } });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Error comunicándose con Hugging Face', details: err.message });
//   }
// });

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});