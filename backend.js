/**
 * Ninja FieldSight PMM Dashboard Backend
 * - File storage on Railway disk (data.json)
 * - No Google Sheets/Firebase needed
 * - Password-protected endpoints
 */

const express = require('express');
const cors = require('cors');
const busboy = require('busboy');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.UPLOAD_PASSWORD || 'changeme';
const DATA_FILE = path.join(__dirname, 'data.json');

console.log(`FieldSight backend starting on port ${PORT}`);
console.log(`Password: ${PASSWORD === 'changeme' ? '⚠️  DEFAULT (change in .env!)' : '✓ Custom'}`);

// ============================================================
// FILE STORAGE
// ============================================================

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { batches: [] };
    const txt = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.error('Read error:', e.message);
    return { batches: [] };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Write error:', e.message);
    return false;
  }
}

function getMergedJobs() {
  const data = readData();
  const map = {};
  (data.batches || []).forEach(b => {
    (b.jobs || []).forEach(j => { map[String(j.jobId)] = j; });
  });
  return Object.values(map);
}

// ============================================================
// ZIP PARSER (same as frontend)
// ============================================================

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) row.push(field);
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).filter(r => r.length && !(r.length === 1 && r[0] === '')).map(r => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = r[idx] || ''; });
    return o;
  });
}

const BRANDS = ['Dunhill', 'Mevius', 'LD', 'Marlboro', 'Chesterfield'];
const PMM_BRANDS = ['Marlboro', 'Chesterfield'];

function parseBrandReply(text) {
  if (!text) return null;
  const result = { Dunhill: null, Mevius: null, LD: null, Marlboro: null, Chesterfield: null };
  const lower = text.toLowerCase();
  const numbered = [...lower.matchAll(/([1-5])\s*[.):,\-]?\s*(ya|yes|y|ada|jual|tak|no|n|tidak|takde|tiada)/g)];
  if (numbered.length >= 3) {
    let foundAny = false;
    numbered.forEach(m => {
      const idx = parseInt(m[1], 10) - 1;
      const tok = m[2];
      const isYes = ['ya', 'yes', 'y', 'ada', 'jual'].includes(tok);
      result[BRANDS[idx]] = isYes;
      foundAny = true;
    });
    if (foundAny) {
      BRANDS.forEach(b => { if (result[b] === null) result[b] = false; });
      return result;
    }
  }
  let foundAny = false;
  BRANDS.forEach(b => {
    const re = new RegExp('\\b' + b.toLowerCase() + '\\b');
    if (re.test(lower)) { result[b] = true; foundAny = true; }
  });
  if (foundAny) {
    if (/\b(takde|tiada|none|no\s+cigarettes|tak\s+jual|nothing)\b/.test(lower)) {
      BRANDS.forEach(b => { result[b] = false; });
      return result;
    }
    BRANDS.forEach(b => { if (result[b] === null) result[b] = false; });
    return result;
  }
  if (/\b(takde\s+semua|none|tak\s+jual|tiada|no\s+stock|takde)\b/.test(lower)) {
    BRANDS.forEach(b => { result[b] = false; });
    return result;
  }
  return null;
}

function classifyOutcome(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.Role !== 'ai') continue;
    const text = (m.Message || '').toLowerCase();
    if (text.includes('lead captured successfully') || text.includes('maklumat prospek berjaya')) return 'INTERESTED';
    if (text.includes('already selling philip morris') || text.includes('sudah menjual produk philip morris')) return 'ALREADY_SELLING';
    if (text.includes('photo was declined') || text.includes('foto ditolak')) return 'NOT_INTERESTED_NO_PHOTO';
    if (text.includes('recorded as not interested') || text.includes('direkodkan sebagai tidak berminat')) return 'NOT_INTERESTED';
  }
  return null;
}

function findOwnerInfo(messages) {
  let namePromptIdx = -1, contactPromptIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].Role !== 'ai') continue;
    const text = (messages[i].Message || '').toLowerCase();
    if (namePromptIdx === -1 && (text.includes("enter the store owner's name") || text.includes('masukkan nama pemilik kedai'))) {
      namePromptIdx = i;
    }
    if (contactPromptIdx === -1 && (text.includes("enter the store owner's contact") || text.includes('masukkan nombor telefon pemilik'))) {
      contactPromptIdx = i;
    }
  }
  let name = null, contact = null;
  if (namePromptIdx !== -1) {
    for (let j = namePromptIdx + 1; j < messages.length; j++) {
      const next = messages[j];
      if (next.Role !== 'human' || next.Message.startsWith('[Image:')) continue;
      const v = next.Message.trim();
      if (/^(ya|yes|y|tidak|tak|no|n|berminat|minat|tak\s*berminat|nak\s+jual)$/i.test(v)) continue;
      if (/^\+?\d[\d\s\-]{6,}$/.test(v)) continue;
      if (j > namePromptIdx + 10) break;
      name = v;
      break;
    }
  }
  if (contactPromptIdx !== -1) {
    for (let j = contactPromptIdx + 1; j < messages.length; j++) {
      const next = messages[j];
      if (next.Role !== 'human' || next.Message.startsWith('[Image:')) continue;
      const v = next.Message.trim();
      if (!/^\+?\d[\d\s\-]{6,}$/.test(v)) continue;
      let pastClose = false;
      for (let k = contactPromptIdx + 1; k < j; k++) {
        if (messages[k].Role === 'ai') {
          const t = (messages[k].Message || '').toLowerCase();
          if (t.includes('survey complete') || t.includes('tinjauan selesai')) {
            pastClose = true; break;
          }
        }
      }
      if (pastClose) break;
      contact = v;
    }
  }
  return { name, contact };
}

function findBrandReply(messages) {
  for (let i = 0; i < messages.length - 1; i++) {
    const m = messages[i];
    if (m.Role !== 'ai') continue;
    const text = m.Message || '';
    if (text.includes('1. Dunhill') || text.includes('**1. Dunhill**')) {
      for (let j = i + 1; j < messages.length; j++) {
        const next = messages[j];
        if (next.Role !== 'human' || next.Message.startsWith('[Image:')) continue;
        const v = next.Message.trim().toLowerCase();
        const hasNumbered = /\b[1-5]\b.*?(yes|no|ya|tak|tidak)/i.test(v);
        const hasBrand = /(dunhill|mevius|marlboro|chesterfield|\bld\b)/i.test(v);
        const hasNegation = /\b(takde|tiada|none|tak\s*jual)\b/i.test(v);
        if (hasNumbered || hasBrand || hasNegation) return next.Message;
      }
    }
  }
  return null;
}

function findDuration(messages) {
  for (let i = 0; i < messages.length - 1; i++) {
    const m = messages[i];
    if (m.Role !== 'ai') continue;
    const text = (m.Message || '').toLowerCase();
    if (text.includes('how long has this store not been selling') || text.includes('berapa lama kedai ini sudah tidak menjual')) {
      for (let j = i + 1; j < messages.length; j++) {
        const next = messages[j];
        if (next.Role !== 'ai') {
          const nt = (next.Message || '').toLowerCase();
          if (nt.includes('interested in selling') || nt.includes('berminat untuk menjual') || nt.includes('survey complete')) break;
        }
        if (next.Role === 'human' && !next.Message.startsWith('[Image:')) {
          const v = next.Message.trim();
          if (/^\d\s+(yes|no|ya|tak|tidak)/i.test(v)) continue;
          if (/^(ya|yes|y|tidak|tak|no|n|berminat|minat)$/i.test(v)) continue;
          return v;
        }
      }
    }
  }
  return null;
}

function extractPhotos(messages) {
  const photos = [];
  messages.forEach(m => {
    if (m.Role !== 'human') return;
    const match = (m.Message || '').match(/\[Image:\s*([^\]]+)\]/);
    if (match) photos.push(match[1].trim());
  });
  return photos;
}

async function processZip(zipBuffer) {
  const zip = await JSZip.loadAsync(zipBuffer);
  const csvNames = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith('.csv'));

  if (!csvNames.some(n => /jobs\.csv$/i.test(n))) throw new Error('No jobs.csv found');
  if (!csvNames.some(n => /conversation\.csv$/i.test(n))) throw new Error('No conversation.csv found');

  const jobsFile = csvNames.find(n => /jobs\.csv$/i.test(n));
  const jobsCsv = await zip.files[jobsFile].async('string');
  const jobs = parseCSV(jobsCsv);

  const convFile = csvNames.find(n => /conversation\.csv$/i.test(n));
  const convCsv = await zip.files[convFile].async('string');
  const allMessages = parseCSV(convCsv);

  const byJob = {};
  allMessages.forEach(m => {
    const jid = m['Job ID'];
    if (!byJob[jid]) byJob[jid] = [];
    byJob[jid].push(m);
  });
  Object.keys(byJob).forEach(jid => {
    byJob[jid].sort((a, b) => {
      if (a['Created At'] !== b['Created At']) return a['Created At'].localeCompare(b['Created At']);
      return (+a['Message ID']) - (+b['Message ID']);
    });
  });

  const derived = [];
  for (const j of jobs) {
    const jobId = j['Job ID'];
    const msgs = byJob[jobId] || [];
    const status = (j['Status'] || '').toLowerCase();
    const photos = extractPhotos(msgs);

    let outcome = null, brands = { Dunhill: null, Mevius: null, LD: null, Marlboro: null, Chesterfield: null };
    let ownerName = null, ownerContact = null, duration = null;

    if (status === 'success' && msgs.length > 0) {
      outcome = classifyOutcome(msgs);
      const brandReply = findBrandReply(msgs);
      if (brandReply) {
        const parsed = parseBrandReply(brandReply);
        if (parsed) brands = parsed;
      }
      if (outcome === 'INTERESTED') {
        const info = findOwnerInfo(msgs);
        ownerName = info.name;
        ownerContact = info.contact;
      }
      if (outcome === 'INTERESTED' || outcome === 'NOT_INTERESTED' || outcome === 'NOT_INTERESTED_NO_PHOTO') {
        duration = findDuration(msgs);
      }
    }

    const date = (j['Date'] || (j['Created At'] || '').slice(0, 10) || '').trim();
    const createdAt = (j['Created At'] || '').trim();

    derived.push({
      jobId: jobId,
      date: date,
      region: 'Unknown',
      city: 'Unknown',
      status: status,
      outcome: outcome,
      brands: brands,
      interestedInPmm: outcome === 'INTERESTED' ? true : (outcome === 'NOT_INTERESTED' || outcome === 'NOT_INTERESTED_NO_PHOTO') ? false : null,
      ownerName: ownerName,
      ownerContact: ownerContact,
      howLongNoPmm: duration,
      photoShopFront: photos[0] || null,
      photoDispenser: photos[1] || null,
      createdAt: createdAt,
      _agent: j['Telegram First Name'] || null,
    });
  }

  return { jobs: derived, meta: { totalJobs: jobs.length, totalMessages: allMessages.length } };
}

// ============================================================
// ROUTES
// ============================================================

app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/api/jobs', (req, res) => {
  const password = req.headers['x-password'];
  if (password !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const jobs = getMergedJobs();
    res.json({ jobs, count: jobs.length, source: 'file' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/upload', (req, res) => {
  const password = req.headers['x-password'];
  if (password !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const bb = busboy({ headers: req.headers });
  let fileBuffer = null;
  let uploaderName = null;

  bb.on('file', (fieldname, file) => {
    const chunks = [];
    file.on('data', chunk => chunks.push(chunk));
    file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
  });

  bb.on('field', (fieldname, val) => {
    if (fieldname === 'uploader') uploaderName = val;
  });

  bb.on('close', async () => {
    if (!fileBuffer) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const parsed = await processZip(fileBuffer);
      const data = readData();
      const batchId = (data.batches || []).length + 1;
      const batch = {
        batchId,
        uploaderName: uploaderName || 'unknown',
        uploadedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        jobCount: parsed.jobs.length,
        jobs: parsed.jobs,
      };
      if (!data.batches) data.batches = [];
      data.batches.push(batch);
      writeData(data);

      res.json({
        ok: true,
        batchId,
        jobsAdded: parsed.jobs.length,
        uploaderName: uploaderName || 'unknown',
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  req.pipe(bb);
});

app.listen(PORT, () => {
  console.log(`✓ Listening on port ${PORT}`);
  console.log(`✓ GET  /api/jobs (password required)`);
  console.log(`✓ POST /upload (password required)`);
  console.log(`✓ Data stored in: ${DATA_FILE}`);
});
