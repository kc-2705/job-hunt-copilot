// Turns resume text into searchable chunks: one per bullet point or short paragraph,
// each tagged with the section it came from (Experience, Skills, Projects...).

const BULLET = /^\s*([•●▪◦‣∙·*\-–]|\d+[.)])\s+/;
const MIN_CHARS = 25;
const MAX_CHARS = 450;

async function pdfToText(buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

// A short line in capitals or ending with ":" is treated as a section heading.
function isHeading(line) {
  const t = line.trim();
  if (!t || t.length > 40 || BULLET.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return (letters.length >= 3 && letters === letters.toUpperCase()) || /^[A-Z][A-Za-z &/]+:$/.test(t);
}

function toChunks(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  const chunks = [];
  let section = '';
  let current = null;

  const flush = () => {
    if (current && current.text.length >= MIN_CHARS) chunks.push(current);
    current = null;
  };

  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    if (isHeading(line)) {
      flush();
      section = line.replace(/:$/, '');
      continue;
    }
    if (BULLET.test(line)) {
      flush();
      current = { section, text: line.replace(BULLET, '') };
      continue;
    }
    // A line that continues the previous bullet (PDFs wrap long bullets onto several lines).
    if (current && current.text.length < MAX_CHARS && !/[.!?]$/.test(current.text)) {
      current.text += ` ${line}`;
    } else {
      flush();
      current = { section, text: line };
    }
  }
  flush();

  // Very long paragraphs are split on sentence boundaries so each chunk stays focused.
  return chunks.flatMap((c) => {
    if (c.text.length <= MAX_CHARS) return [c];
    return (c.text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [c.text])
      .map((s) => s.trim())
      .filter((s) => s.length >= MIN_CHARS)
      .map((s) => ({ section: c.section, text: s }));
  });
}

module.exports = { pdfToText, toChunks, isHeading };
