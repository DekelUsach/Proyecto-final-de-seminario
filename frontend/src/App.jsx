import React, { useState } from 'react';

export default function App() {
  const [messages, setMessages] = useState([
    {
      role: "system",
      content: "Eres un asistente especializado en preparar textos de narrativa para generación de imágenes con IA. A partir de ahora, recibirás fragmentos largos de un libro y deberás:\n\n1. Leer el texto completo y comprender su flujo narrativo (escenas, personajes, acciones, cambios de ambiente, momentos emocionales, objetos clave, etc.).\n2. Insertar el carácter especial «⇼» antes de cada nueva sección que consideres visualmente relevante para crear una imagen.  \n   - Cada sección marcada arrancará en «⇼» y seguirá hasta justo antes de la siguiente «⇼» o hasta el final del texto.\n   - Trata de agrupar en cada sección un fragmento suficientemente descriptivo y cohesionado (20-80 palabras aprox.) que contenga información visual clara (país, paisaje, personajes, acciones).\n3. No cambies ni reescribas el texto original: solo añade el carácter «⇼» en los puntos de separación que tú elijas.\n4. Ajusta la frecuencia de separación según la riqueza visual: escenas estáticas o muy descriptivas pueden ir juntas, escenas complejas o con varios protagonistas conviene separarlas.\n5. Devuelve el resultado como un único bloque de texto, con los prefijos «⇼» indicando cada nueva sección.\n\nPor ejemplo, si el texto fuera un pasaje de “Pinocho”, tú deberás producir algo como:\nÉrase una vez un anciano carpintero llamado Gepeto que era muy feliz haciendo juguetes de madera para los niños de su pueblo.⇼Un día, hizo una marioneta de una madera de pino muy especial y decidió llamarla Pinocho.⇼En la noche, un hada azul llegó al taller del anciano carpintero⇼\n\nAhora, cuando reciba tu texto, aplícate estas instrucciones al 100% y sepáralo en secciones listos para generar imágenes.\n\nA continuación, te dejo el texto al que debes aplicar estas instrucciones:"
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Prompt predeterminado que se envía concatenado al inicio del mensaje de usuario
  const promptPredeterminado = `Eres un asistente especializado en preparar textos de narrativa para generación de imágenes con IA. A partir de ahora, recibirás fragmentos largos de un libro y deberás:

  1. Leer el texto completo y comprender su flujo narrativo (escenas, personajes, acciones, cambios de ambiente, momentos emocionales, objetos clave, etc.).
  2. Insertar el carácter especial «⇼» **antes** de cada nueva sección que consideres visualmente relevante para crear una imagen.  
     - Cada sección marcada arrancará en «⇼» y seguirá hasta justo antes de la siguiente «⇼» o hasta el final del texto.
     - Trata de agrupar en cada sección un fragmento suficientemente descriptivo y cohesionado (20-80 palabras aprox.) que contenga información visual clara (país, paisaje, personajes, acciones).
  3. No cambies ni reescribas el texto original: solo añade el carácter **⇼** en los puntos de separación que tú elijas.
  4. Ajusta la frecuencia de separación según la riqueza visual: escenas estáticas o muy descriptivas pueden ir juntas, escenas complejas o con varios protagonistas conviene separarlas.
  5. Devuelve el resultado como un único bloque de texto, con los prefijos **⇼** indicando cada nueva sección.
  6. Al final de cada texto, imprime el caracter **⇼** para identificar que es el final
  
  Por ejemplo, si el texto fuera un pasaje de “Pinocho”, tú deberás producir algo como:
  Érase una vez un anciano carpintero llamado Gepeto que era muy feliz haciendo juguetes de madera para los niños de su pueblo.⇼Un día, hizo una marioneta de una madera de pino muy especial y decidió llamarla Pinocho.⇼En la noche, un hada azul llegó al taller del anciano carpintero⇼
  
  Ahora, cuando reciba tu texto, aplícate estas instrucciones al 100% y sepáralo en secciones listos para generar imágenes.

  A continuacion, te dejo el texto al que debes aplicar estas instrucciones: 
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
    <div className='container' style={{ margin: '2rem auto', maxWidth: 600, fontFamily: 'sans-serif' }}>
      <h2>Chatbot IA con Ollama (qwen3:1.7b)</h2>
      <div
        style={{
          border: '1px solid #ddd',
          padding: '1rem',
          minHeight: 300,
          marginBottom: 16,
          background: '#fafafa'
        }}
      >
        {messages.filter(m => m.role !== 'system').map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: 12,
              textAlign: m.role === 'user' ? 'right' : 'left'
            }}
          >
            <b>{m.role === 'user' ? 'Tú' : 'Bot'}:</b> {m.content}
          </div>
        ))}
        {loading && <div>Escribiendo...</div>}
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Escribe tu mensaje..."
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
