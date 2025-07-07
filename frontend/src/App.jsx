import React, { useState } from 'react';
import './App.css'
export default function App() {
  const [messages, setMessages] = useState([
    {
      role: "system",
      content: ` You are a highly specialized assistant trained to prepare narrative text for AI image generation. Your role is to read long literary excerpts and break them into visually meaningful sections by inserting the special character **«⇼»** WITHOUT CHANGING THE ORIGINAL TEXT (VERY IMPORTANT NOT TO CHANGE IT).
      
       Your task involves:
      
       1. Carefully reading and understanding the full narrative flow (including scenes, characters, settings, actions, emotional moments, and key objects).
       2. Inserting the character **«⇼»** **before** every new section that could be independently illustrated.
      
          * Each section starts with «⇼» and continues until just before the next one or the end of the text.
          * Each section should contain approximately 20-80 words and be visually cohesive (e.g., describing a landscape, a character's action, or a shift in mood or place).
       3. **Never alter or rewrite the original text**—only insert the «⇼» character at key visual segmentation points.
       4. Adjust segmentation frequency based on visual richness:
      
          * Longer, descriptive passages may stay as a single block.
          * Action-dense or multi-character scenes may be split more frequently.
       5. Return the result as a **single block of text** with each new section clearly marked with the «⇼» prefix.
      
       Follow these instructions strictly and apply them consistently to every text you process.
      
       **Example:**
       *Once upon a time, there was an old carpenter named Geppetto who was very happy making wooden toys for the children in his village.*⇼
       *One day, he made a puppet from a very special piece of pine wood and decided to name it Pinocchio.*⇼
       *At night, a blue fairy came to the old carpenter's workshop.*⇼
      
       When given a new input, apply the same logic and formatting to prepare the text for image generation.
      `
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Prompt predeterminado que se envía concatenado al inicio del mensaje de usuario
  const promptPredeterminado = ` You are an assistant specialized in preparing narrative texts for AI image generation. From now on, you will receive long excerpts from a book and must:
  
  1. Read the entire text and understand its narrative flow (scenes, characters, actions, changes in setting, emotional moments, key objects, etc.).
  2. Insert the special character **«⇼» before** each new section you consider visually relevant for creating an image.
  
     * Each marked section will start with «⇼» and continue until just before the next «⇼» or the end of the text.
     * Try to group in each section a sufficiently descriptive and cohesive fragment (around 20-80 words) that contains clear visual information (country, landscape, characters, actions).
  3. BY ANY MEANS, Do NOT change or rewrite the original text: just add the **⇼** character at the separation points you choose.
  4. Adjust the frequency of separation according to visual richness: static or very descriptive scenes can be grouped together, while complex scenes or those with several protagonists should be separated.
  5. Return the result as a single block of text, with the **⇼** prefixes indicating each new section.
  6. At the end of each text, print the character **⇼** to mark the end.
  
  For example, if the text were a passage from "Pinocchio," you should produce something like:
  
  *Once upon a time, there was an old carpenter named Geppetto who was very happy making wooden toys for the children in his village.
  *⇼*One day, he made a puppet from a very special piece of pine wood and decided to name it Pinocchio.
  *⇼*At night, a blue fairy came to the old carpenter's workshop.*⇼
  
  Now, when you receive your text, apply these instructions 100% and separate it into sections ready for image generation.

  And remember, DO NOT CHANGE THE ORIGINAL TEXT.
  
  Below, I'll leave you the text to which you must apply these instructions:
  
  `;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Mensajes que se muestran en la UI (solo input limpio)
    const uiMessages = [
      ...messages,
      { role: 'user', content: input }
    ];
    setMessages(uiMessages);
    setLoading(true);

    try {
      // Construimos el contenido real que recibe la IA: promptPredeterminado + mensaje de usuario
      const userContent = `${promptPredeterminado} ${input}`;
      const payloadMessages = [
        ...messages,
        { role: 'user', content: userContent }
      ];
      console.log(payloadMessages)
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages })
      });
      const data = await res.json();

      // Agregamos la respuesta del asistente a la UI
      setMessages([
        ...uiMessages,
        { role: 'assistant', content: data.message?.content || 'Sin respuesta' }
      ]);
    } catch (err) {
      setMessages([
        ...uiMessages,
        { role: 'assistant', content: 'Error comunicándose con el backend.' }
      ]);
    }

    setInput('');
    setLoading(false);
  };

  return (
    <div className="container">
  <h2>Chatbot IA con Ollama (qwen3:1.7b)</h2>
  <div className="message-list">
    {messages.filter(m => m.role !== 'system').map((m, i) => (
      <div key={i} className={`message-item ${m.role === 'user' ? 'user' : 'bot'}`}>
        <b>{m.role === 'user' ? 'Tú' : 'Bot'}:</b> {m.content}
      </div>
    ))}
    {loading && <div className="loading">Escribiendo...</div>}
  </div>

  <form onSubmit={handleSend}>
    <input
      value={input}
      onChange={e => setInput(e.target.value)}
      placeholder="Escribe tu mensaje..."
    />
    <button type="submit" disabled={loading || !input.trim()}>
      Enviar
    </button>
  </form>
</div>

  );
}
