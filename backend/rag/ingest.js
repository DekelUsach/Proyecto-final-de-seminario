import mammoth from 'mammoth';
import fetch from 'node-fetch';
import { PDFDocument } from 'pdf-lib';
import Tesseract from 'tesseract.js';
import { fromBuffer } from 'pdf2pic';
import fs from 'fs/promises';
import path from 'path';
// Import directo al archivo para evitar que 'pdf-parse' intente cargar artefactos de test en index.js
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function cleanText(text) {
  return (text || '')
    .replace(/\u0000/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function extractTextFromPdf(buffer, opts = {}) {
  const language = (opts.language || 'spa').toString();
  const minLength = Number.isFinite(opts.minLength) ? Number(opts.minLength) : 100;
  console.log(`[PDF] Iniciando extracción directa de texto con pdf-parse... (minLength=${minLength}, lang=${language})`);
  let extracted = '';
  try {
    const data = await pdfParse(buffer);
    extracted = cleanText(data.text || '');
    console.log(`[PDF] Texto extraído con pdf-parse: ${extracted.length} caracteres`);
    if (extracted && extracted.length >= minLength) {
      console.log(`[PDF] PDF digital, texto suficiente extraído.`);
      return extracted;
    }
  } catch (err) {
    console.log(`[PDF] Error en pdf-parse:`, err.message);
  }

  // Fallback a OCR local si no alcanzó el mínimo
  console.log(`[PDF] Texto insuficiente (${extracted.length}). Intentando OCR local con Tesseract...`);
  let numPages = 0;
  try {
    const pdfDoc = await PDFDocument.load(buffer);
    numPages = pdfDoc.getPageCount();
  } catch (e) {
    console.log(`[PDF] No se pudo leer conteo de páginas:`, e.message);
  }
  if (!Number.isFinite(numPages) || numPages <= 0) numPages = 1;

  const ocrText = await extractTextWithTesseract(buffer, numPages, language);
  console.log(`[OCR] Texto obtenido con Tesseract: ${ocrText.length} caracteres`);
  if (ocrText && ocrText.length >= minLength) {
    return ocrText;
  }

  // Devolver lo mejor que tengamos (OCR o directo) aunque sea corto; el caller decide si es válido
  return ocrText || extracted || '';
}

export async function extractTextFromDocx(buffer) {
  try {
    const { value } = await mammoth.extractRawText({ buffer });
    return cleanText(value || '');
  } catch (_) {
    return '';
  }
}

export async function ocrSpaceExtract(buffer, contentType = 'application/pdf', language = 'spa') {
  const apiKey = process.env.OCR_SPACE_API_KEY || 'K85780278288957';
  console.log(`[OCR] Iniciando OCR con API key: ${apiKey.substring(0, 8)}...`);
  
  const base64 = buffer.toString('base64');
  const params = new URLSearchParams();
  params.set('apikey', apiKey);
  params.set('language', language);
  params.set('isOverlayRequired', 'false');
  params.set('scale', 'true');
  params.set('OCREngine', '2');
  params.set('base64Image', `data:${contentType};base64,${base64}`);

  try {
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const json = await res.json();
    console.log(`[OCR] Respuesta API:`, { 
      isError: json?.IsErroredOnProcessing, 
      errorMessage: json?.ErrorMessage,
      parsedResults: json?.ParsedResults?.length || 0
    });
    
    if (!json || json.IsErroredOnProcessing) {
      console.log(`[OCR] Error en API:`, json?.ErrorMessage || 'Unknown error');
      return '';
    }
    
    const parts = Array.isArray(json.ParsedResults)
      ? json.ParsedResults.map(p => p.ParsedText || '')
      : [];
    const result = cleanText(parts.join('\n'));
    console.log(`[OCR] Texto extraído: ${result.length} caracteres`);
    return result;
  } catch (err) {
    console.log(`[OCR] Error en fetch:`, err.message);
    return '';
  }
}

async function tryAlternativeOcrConfigs(buffer, language = 'spa') {
  const apiKey = process.env.OCR_SPACE_API_KEY || 'K85780278288957';
  const base64 = buffer.toString('base64');
  
  // Configuración 1: OCR Engine 1 (más básico pero más estable)
  try {
    console.log(`[OCR] Intentando configuración alternativa 1...`);
    const params1 = new URLSearchParams();
    params1.set('apikey', apiKey);
    params1.set('language', language);
    params1.set('isOverlayRequired', 'false');
    params1.set('scale', 'true');
    params1.set('OCREngine', '1');
    params1.set('base64Image', `data:application/pdf;base64,${base64}`);
    
    const res1 = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params1
    });
    const json1 = await res1.json();
    
    if (json1 && !json1.IsErroredOnProcessing && json1.ParsedResults) {
      const text1 = cleanText(json1.ParsedResults.map(p => p.ParsedText || '').join('\n'));
      if (text1 && text1.length > 100) {
        console.log(`[OCR] Configuración 1 exitosa: ${text1.length} chars`);
        return text1;
      }
    }
  } catch (err) {
    console.log(`[OCR] Error en configuración 1:`, err.message);
  }
  
  // Configuración 2: Con diferentes parámetros de escala
  try {
    console.log(`[OCR] Intentando configuración alternativa 2...`);
    const params2 = new URLSearchParams();
    params2.set('apikey', apiKey);
    params2.set('language', language);
    params2.set('isOverlayRequired', 'false');
    params2.set('scale', 'false');
    params2.set('OCREngine', '2');
    params2.set('base64Image', `data:application/pdf;base64,${base64}`);
    
    const res2 = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params2
    });
    const json2 = await res2.json();
    
    if (json2 && !json2.IsErroredOnProcessing && json2.ParsedResults) {
      const text2 = cleanText(json2.ParsedResults.map(p => p.ParsedText || '').join('\n'));
      if (text2 && text2.length > 100) {
        console.log(`[OCR] Configuración 2 exitosa: ${text2.length} chars`);
        return text2;
      }
    }
  } catch (err) {
    console.log(`[OCR] Error en configuración 2:`, err.message);
  }
  
  return '';
}

async function tryDifferentContentTypes(buffer, language = 'spa') {
  const apiKey = process.env.OCR_SPACE_API_KEY || 'K85780278288957';
  const base64 = buffer.toString('base64');
  
  // Intentar como imagen en lugar de PDF
  try {
    console.log(`[OCR] Intentando como imagen...`);
    const params = new URLSearchParams();
    params.set('apikey', apiKey);
    params.set('language', language);
    params.set('isOverlayRequired', 'false');
    params.set('scale', 'true');
    params.set('OCREngine', '2');
    params.set('base64Image', `data:image/png;base64,${base64}`);
    
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const json = await res.json();
    
    if (json && !json.IsErroredOnProcessing && json.ParsedResults) {
      const text = cleanText(json.ParsedResults.map(p => p.ParsedText || '').join('\n'));
      if (text && text.length > 50) {
        console.log(`[OCR] Procesamiento como imagen exitoso: ${text.length} chars`);
        return text;
      }
    }
  } catch (err) {
    console.log(`[OCR] Error procesando como imagen:`, err.message);
  }
  
  // Intentar con parámetros más agresivos
  try {
    console.log(`[OCR] Intentando con parámetros agresivos...`);
    const params = new URLSearchParams();
    params.set('apikey', apiKey);
    params.set('language', language);
    params.set('isOverlayRequired', 'false');
    params.set('scale', 'true');
    params.set('OCREngine', '2');
    params.set('base64Image', `data:application/pdf;base64,${base64}`);
    params.set('detectOrientation', 'true');
    params.set('OCREngine', '1');
    
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const json = await res.json();
    
    if (json && !json.IsErroredOnProcessing && json.ParsedResults) {
      const text = cleanText(json.ParsedResults.map(p => p.ParsedText || '').join('\n'));
      if (text && text.length > 50) {
        console.log(`[OCR] Parámetros agresivos exitosos: ${text.length} chars`);
        return text;
      }
    }
  } catch (err) {
    console.log(`[OCR] Error con parámetros agresivos:`, err.message);
  }
  
  return '';
}

async function tryPageByPageProcessing(buffer, language = 'spa') {
  const apiKey = process.env.OCR_SPACE_API_KEY || 'K85780278288957';
  const base64 = buffer.toString('base64');
  
  // Intentar con parámetros optimizados para PDFs largos
  try {
    console.log(`[OCR] Intentando procesamiento optimizado para PDFs largos...`);
    const params = new URLSearchParams();
    params.set('apikey', apiKey);
    params.set('language', language);
    params.set('isOverlayRequired', 'false');
    params.set('scale', 'true');
    params.set('OCREngine', '2');
    params.set('base64Image', `data:application/pdf;base64,${base64}`);
    params.set('filetype', 'PDF');
    params.set('detectOrientation', 'true');
    
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const json = await res.json();
    
    if (json && !json.IsErroredOnProcessing && json.ParsedResults) {
      const text = cleanText(json.ParsedResults.map(p => p.ParsedText || '').join('\n'));
      if (text && text.length > 50) {
        console.log(`[OCR] Procesamiento optimizado exitoso: ${text.length} chars`);
        return text;
      }
    }
  } catch (err) {
    console.log(`[OCR] Error en procesamiento optimizado:`, err.message);
  }
  
  return '';
}

// OCR local con tesseract.js para PDFs grandes
async function extractTextWithTesseract(buffer, numPages, language = 'spa') {
  // Verificar binarios requeridos para convertir PDF -> PNG (GraphicsMagick)
  try {
    await execFileAsync('gm', ['-version']);
  } catch (_) {
    console.log('[Tesseract] GraphicsMagick (gm) no está instalado o no está en PATH. Instálelo para habilitar OCR local.');
    return '';
  }
  const tempDir = path.join(process.cwd(), 'tmp_pdf2pic');
  await fs.mkdir(tempDir, { recursive: true });
  const pdf2pic = fromBuffer(buffer, {
    density: 200,
    saveFilename: 'page',
    savePath: tempDir,
    format: 'png',
    width: 1654, // A4 @ 200dpi aprox
    height: 2339
  });
  let fullText = '';
  // Opcional: rutas locales para evitar descargas (OCR "local" 100%)
  const workerPath = process.env.OCR_TESSERACT_WORKER_PATH;
  const corePath = process.env.OCR_TESSERACT_CORE_PATH;
  const langPath = process.env.OCR_TESSERACT_LANG_PATH;
  const tesseractOptions = {};
  if (workerPath) tesseractOptions.workerPath = workerPath;
  if (corePath) tesseractOptions.corePath = corePath;
  if (langPath) tesseractOptions.langPath = langPath;
  const maxPagesEnv = Number(process.env.OCR_TESSERACT_MAX_PAGES);
  const maxPages = Number.isFinite(maxPagesEnv) && maxPagesEnv > 0 ? Math.min(numPages, maxPagesEnv) : numPages;
  try {
    for (let i = 1; i <= maxPages; i++) {
      try {
        const output = await pdf2pic(i);
        const imagePath = output.path;
        console.log(`[Tesseract] Procesando página ${i} (${imagePath})...`);
        const { data: { text } } = await Tesseract.recognize(imagePath, language, tesseractOptions);
        fullText += '\n' + text;
        await fs.unlink(imagePath); // Borrar imagen temporal
      } catch (err) {
        console.log(`[Tesseract] Error procesando página ${i}:`, err.message);
      }
    }
    // fs.rmdir recursive está deprecado en Node 22; usar fs.rm
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (err) {
    console.log(`[Tesseract] Error general OCR local:`, err.message);
  }
  return cleanText(fullText);
}


