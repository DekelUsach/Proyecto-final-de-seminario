import React, { useState, useEffect } from 'react';
import './App.css';

export default function App() {
  const [storyId, setStoryId] = useState('');
  // --- LISTA DE HISTORIAS ---
  const [stories, setStories] = useState([]);
  const [loadingStories, setLoadingStories] = useState(false);

  const fetchStories = async () => {
    setLoadingStories(true);
    try {
      const res = await fetch('http://localhost:3001/api/stories');
      const data = await res.json();
      if (res.ok) {
        setStories(Array.isArray(data.stories) ? data.stories : []);
      }
    } catch (_) {}
    setLoadingStories(false);
  };

  useEffect(() => {
    fetchStories();
  }, []);
  const [indexStatus, setIndexStatus] = useState(null);

  // --- QA (PREGUNTAS) ---
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Eliminado: ya no se permite pegar texto manual para indexar

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
      <div className="header">
        <div className="brand">
          <div className="logo" />
          <div className="title">
            <h1>LULU · RAG Assistant</h1>
            <p>Indexá tu texto y preguntá con respuestas amables y útiles</p>
          </div>
        </div>
      </div>

      {/* === Grid principal === */}
      <div className="grid">

      {/* === Sección 2: Hacer preguntas === */}
      <section className="card">
        <h2>2. Preguntar sobre el texto</h2>
        <form onSubmit={handleAsk}>
          <div className="form-group">
            <label>ID del texto</label>
            <input
              type="text"
              value={storyId}
              onChange={e => setStoryId(e.target.value)}
              placeholder="Ingresá el ID del texto (ej: 0, 1, 2...)"
            />
          </div>
          <div className="form-group">
            <label>Pregunta:</label>
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Escribí tu pregunta..."
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

      {/* === Carga de archivos PDF/DOCX === */}
      <section className="card" style={{animationDelay: '120ms'}}>
        <h2>1. Cargar archivo (PDF/DOCX)</h2>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fileInput = form.querySelector('input[type=\"file\"]');
          const titleInput = form.querySelector('input[name=\"title\"]');
          const file = fileInput?.files?.[0];
          if (!file) return;
          const formData = new FormData();
          formData.append('file', file);
          formData.append('title', titleInput?.value || '');
          setUploading(true);
          setUploadStatus(null);
          try {
            const res = await fetch('http://localhost:3001/api/upload', {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (res.ok) {
              setUploadStatus(`✅ Archivo indexado. ID: ${data.storyId}${data.title ? ` · Título: ${data.title}` : ''}`);
              setStoryId(String(data.storyId));
              fetchStories();
              form.reset();
            } else {
              setUploadStatus(`❌ Error: ${data.error || 'desconocido'}`);
            }
          } catch (err) {
            setUploadStatus(`❌ Error de red: ${err.message}`);
          }
          setUploading(false);
        }}>
          <div className="form-group">
            <label>Título (opcional)</label>
            <input type="text" name="title" placeholder="Ej: Documento escaneado" />
          </div>
          <div className="form-group">
            <label>Archivo</label>
            <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          </div>
          <button type="submit" disabled={uploading}>{uploading ? 'Subiendo...' : 'Subir e indexar'}</button>
        </form>
        {uploadStatus && <p className="status">{uploadStatus}</p>}
      </section>

      {/* === Listado de textos indexados === */}
      <section className="card" style={{animationDelay: '80ms'}}>
        <h2>3. Textos indexados</h2>
        <p className="status">Encontrados: {stories.length}</p>
        <div className="stories-list">
          {loadingStories && <p className="status">Cargando...</p>}
          {!loadingStories && stories.length === 0 && (
            <p className="status">Todavía no hay textos indexados.</p>
          )}
          {!loadingStories && stories.map(s => (
            <div key={s.storyId} className="story-row">
              <div className="story-meta">
                <div className="story-title">{s.title || <span style={{color:'#9aa6b2'}}>Sin título</span>}</div>
                <div className="story-sub">ID: <b>{s.storyId}</b> · Chunks: {s.chunks}</div>
              </div>
              <div className="story-actions">
                <button onClick={() => { setStoryId(String(s.storyId)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Usar ID</button>
                <button onClick={() => navigator.clipboard.writeText(String(s.storyId))} style={{background:"linear-gradient(135deg,#22d3ee,#6c8cff)"}}>Copiar ID</button>
                <button
                  onClick={async () => {
                    const confirmDel = window.confirm(`¿Eliminar el texto con ID ${s.storyId}? Esta acción no se puede deshacer.`);
                    if (!confirmDel) return;
                    try {
                      const res = await fetch(`http://localhost:3001/api/stories/${s.storyId}`, { method: 'DELETE' });
                      if (res.ok) {
                        if (String(storyId) === String(s.storyId)) setStoryId('');
                        fetchStories();
                      }
                    } catch (_) {}
                  }}
                  style={{background:"linear-gradient(135deg,#ef4444,#f97316)"}}
                >Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );  
}
 