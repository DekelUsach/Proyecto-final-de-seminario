import React, { useState } from 'react';
import './App.css';

export default function App() {
  // --- INDEXACIÓN ---
  const [storyId, setStoryId] = useState('');
  const [storyText, setStoryText] = useState('');
  const [indexStatus, setIndexStatus] = useState(null);
  const [loadingIndex, setLoadingIndex] = useState(false);

  // --- QA (PREGUNTAS) ---
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loadingAsk, setLoadingAsk] = useState(false);

  // Handler para indexar el cuento
  const handleIndex = async (e) => {
    e.preventDefault();
    if (!storyId.trim() || !storyText.trim()) return;
    setLoadingIndex(true);
    setIndexStatus(null);
    try {
      const res = await fetch('http://localhost:3001/api/indexStory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId, text: storyText })
      });
      const data = await res.json();
      if (res.ok) {
        setIndexStatus('✅ Historia indexada correctamente.');
      } else {
        setIndexStatus(`❌ Error: ${data.error || 'desconocido'}`);
      }
    } catch (err) {
      setIndexStatus(`❌ Error de red: ${err.message}`);
    }
    setLoadingIndex(false);
  };

  // Handler para hacer la pregunta
  const handleAsk = async (e) => {
    e.preventDefault();
    if (!storyId.trim() || !question.trim()) return;
    setLoadingAsk(true);
    setAnswer('');
    try {
      const res = await fetch('http://localhost:3001/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId, question })
      });
      const data = await res.json();
      if (res.ok) {
        setAnswer(data.answer);
      } else {
        setAnswer(`❌ Error: ${data.error || 'desconocido'}`);
      }
    } catch (err) {
      setAnswer(`❌ Error de red: ${err.message}`);
    }
    setLoadingAsk(false);
  };

  return (
    <div className="container">
      <h1>🔗 RAG con Gemini 2.0 + Pinecone</h1>

      {/* === Sección 1: Indexar cuento === */}
      <section className="card">
        <h2>1. Indexar un cuento</h2>
        <form onSubmit={handleIndex}>
          <div className="form-group">
            <label>Story ID:</label>
            <input
              type="text"
              value={storyId}
              onChange={e => setStoryId(e.target.value)}
              placeholder="ej: cuento1"
            />
          </div>
          <div className="form-group">
            <label>Texto del cuento:</label>
            <textarea
              rows={6}
              value={storyText}
              onChange={e => setStoryText(e.target.value)}
              placeholder="Pega aquí el texto completo del cuento..."
            />
          </div>
          <button type="submit" disabled={loadingIndex}>
            {loadingIndex ? 'Indexando...' : 'Indexar cuento'}
          </button>
        </form>
        {indexStatus && <p className="status">{indexStatus}</p>}
      </section>

      {/* === Sección 2: Hacer preguntas === */}
      <section className="card">
        <h2>2. Hacer preguntas sobre el cuento</h2>
        <form onSubmit={handleAsk}>
          <div className="form-group">
            <label>Story ID:</label>
            <input
              type="text"
              value={storyId}
              onChange={e => setStoryId(e.target.value)}
              placeholder="Debe coincidir con el ID indexado"
            />
          </div>
          <div className="form-group">
            <label>Pregunta:</label>
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Escribe tu pregunta..."
            />
          </div>
          <button type="submit" disabled={loadingAsk}>
            {loadingAsk ? 'Consultando...' : 'Preguntar'}
          </button>
        </form>
        {answer && (
          <div className="answer-box">
            <h3>Respuesta:</h3>
            <p>{answer}</p>
          </div>
        )}
      </section>
    </div>
  );  
}
 