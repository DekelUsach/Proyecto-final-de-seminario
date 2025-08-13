import { createClient } from "@supabase/supabase-js";

function sanitizeUrl(url) {
	if (!url) return "";
	const trimmed = String(url).trim();
	return trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
}

const SUPABASE_URL = sanitizeUrl(process.env.SUPABASE_URL) || sanitizeUrl(process.env.VITE_SUPABASE_URL) || "";
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

let supabase = null;
if (SUPABASE_URL && SUPABASE_API_KEY) {
	supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY, {
		auth: { persistSession: false }
	});
}

export function getSupabase() {
	if (!supabase) throw new Error("supabase_not_configured");
	return supabase;
}

async function getNextId(tableName) {
	const client = getSupabase();
	const { data, error } = await client
		.from(tableName)
		.select('id')
		.order('id', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error && String(error.message || '').toLowerCase().includes('permission')) {
		throw new Error(`supabase_permission_denied_${tableName}`);
	}
	const maxId = Number.parseInt(data?.id, 10);
	return Number.isFinite(maxId) ? maxId + 1 : 1;
}

export async function insertPreLoadedText(titleOrFullText) {
	const client = getSupabase();
	const newId = await getNextId('preLoadedTexts');
	const { data, error } = await client
		.from('preLoadedTexts')
		.insert({ id: newId, title: String(titleOrFullText || '') })
		.select('id')
		.single();
	if (error) throw new Error(`supabase_insert_preLoadedTexts_failed: ${error.message}`);
	return data?.id;
}

export async function insertPreLoadedTextWithFullText({ title, fullText }) {
	const client = getSupabase();
	const safeTitle = String(title || '').trim() || String(fullText || '').slice(0, 120);
	const newId = await getNextId('preLoadedTexts');
	// Intentar esquema con columna 'content' si existe
	let data, error;
	try {
		({ data, error } = await client
			.from('preLoadedTexts')
			.insert({ id: newId, title: safeTitle, content: String(fullText || '') })
			.select('id')
			.single());
	} catch (e) {
		error = e;
	}
	if (error) {
		const msg = String(error.message || "").toLowerCase();
		const schemaMismatch = msg.includes('column') && msg.includes('content') && (msg.includes('does not exist') || msg.includes('no existe'));
		if (!schemaMismatch) throw new Error(`supabase_insert_preLoadedTexts_failed: ${error.message}`);
		// Fallback: guardar todo el texto en 'title'
		const fb = await client
			.from('preLoadedTexts')
			.insert({ id: newId, title: String(fullText || '') })
			.select('id')
			.single();
		if (fb.error) throw new Error(`supabase_insert_preLoadedTexts_fallback_failed: ${fb.error.message}`);
		return fb.data?.id;
	}
	return data?.id;
}

export async function insertPreLoadedParagraphs(paragraphs, idText) {
	const client = getSupabase();
	const list = Array.isArray(paragraphs) ? paragraphs : [];
	let nextId = await getNextId('preLoadedParagraphs');
	let count = 0;
	for (let i = 0; i < list.length; i++) {
		const content = String(list[i] || '');
		const { error } = await client.from('preLoadedParagraphs').insert({
			id: nextId,
			content,
			imageURL: null,
			order: i + 1,
			idText: Number(idText)
		});
		if (error) throw new Error(`supabase_insert_preLoadedParagraph_failed_at_${i + 1}: ${error.message}`);
		count += 1;
		nextId += 1;
	}
	return { count };
}


