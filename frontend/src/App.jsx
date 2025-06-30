import React, { useState } from 'react';

function App() {
  const [messages, setMessages] = useState([
    { role: 'system', content: '¡Hola! Soy tu chatbot IA con Ollama y qwen3:1.7b.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.message?.content || 'Sin respuesta' }]);
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: 'Error comunicándose con el backend.' }]);
    }
    setInput('');
    setLoading(false);
  };

  return (
    <div style={{ margin: '2rem auto', maxWidth: 600, fontFamily: 'sans-serif' }}>
      <h2>Chatbot IA con Ollama (qwen3:1.7b)</h2>
      <div style={{ border: '1px solid #ddd', padding: '1rem', minHeight: 300, marginBottom: 16, background: '#fafafa' }}>
        {messages.filter(m => m.role !== 'system').map((m, i) => (
          <div key={i} style={{ marginBottom: 12, textAlign: m.role === 'user' ? 'right' : 'left' }}>
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
        <button type="submit" disabled={loading || !input.trim()}>Enviar</button>
      </form>
    </div>
  );
}

export default App;