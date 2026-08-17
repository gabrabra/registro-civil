// Parses model output into { transcricao, registros }.
//
// Models are asked for { "transcricao_completa": "...", "registros": [...] },
// but they routinely wrap it in prose or code fences and — because the
// transcription spans many lines — emit raw newlines inside JSON strings.
// This module is deliberately forgiving so a readable page is never lost.

// Escape control chars that sit inside string literals, which is the single
// most common reason a transcription payload fails JSON.parse.
function repairJsonControlChars(str) {
  let out = '';
  let inString = false;
  let escaped  = false;

  for (const ch of str) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"')  { inString = !inString; out += ch; continue; }

    if (inString) {
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
    }
    out += ch;
  }
  return out;
}

function tryParse(candidate) {
  try { return JSON.parse(candidate); } catch (_) {}
  try { return JSON.parse(repairJsonControlChars(candidate)); } catch (_) {}
  return null;
}

// Keys that carry page-level metadata rather than record fields
const META_KEYS = ['transcricao_completa', 'transcricao', 'eh_capa', 'dados_livro'];

function normalizeParsed(parsed) {
  // Legacy shape: a bare array of records
  if (Array.isArray(parsed)) return { transcricao: null, registros: parsed, ehCapa: false, dadosLivro: null };

  if (parsed && typeof parsed === 'object') {
    const transcricao = parsed.transcricao_completa || parsed.transcricao || null;
    const ehCapa      = parsed.eh_capa === true;
    const dadosLivro  = (parsed.dados_livro && typeof parsed.dados_livro === 'object') ? parsed.dados_livro : null;

    if (Array.isArray(parsed.registros)) return { transcricao, registros: parsed.registros, ehCapa, dadosLivro };

    // Object with no "registros" key. If it only carries page metadata there
    // are no records; otherwise treat the object itself as one record.
    const otherKeys = Object.keys(parsed).filter(k => !META_KEYS.includes(k));
    return { transcricao, registros: otherKeys.length ? [parsed] : [], ehCapa, dadosLivro };
  }
  return null;
}

function parseResultFromText(text) {
  const content = String(text || '').replace(/```json\n?|\n?```/g, '').trim();
  if (!content) return { transcricao: null, registros: [], ehCapa: false, dadosLivro: null };

  const candidates = [content];

  // Outermost object, then outermost array (legacy prompt shape)
  const objStart = content.indexOf('{');
  const objEnd   = content.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) candidates.push(content.slice(objStart, objEnd + 1));

  const arrStart = content.indexOf('[');
  const arrEnd   = content.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) candidates.push(content.slice(arrStart, arrEnd + 1));

  for (const c of candidates) {
    const normalized = normalizeParsed(tryParse(c));
    if (normalized) return normalized;
  }

  // Nothing parsed — keep the raw reading rather than losing the page entirely
  console.warn('[parseResult] JSON inválido — preservando resposta bruta como transcrição');
  return { transcricao: content, registros: [], ehCapa: false, dadosLivro: null };
}

module.exports = { parseResultFromText, repairJsonControlChars };
