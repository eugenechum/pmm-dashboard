/**
 * Ninja FieldSight PMM Dashboard Backend — Phase 1-full
 * - Supabase database for persistent job storage
 * - Supabase storage for photos
 * - Password-protected endpoints
 */

const express = require('express');
const cors = require('cors');
const busboy = require('busboy');
const JSZip = require('jszip');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.UPLOAD_PASSWORD || 'changeme';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'pmm photos';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
console.log(`FieldSight backend starting on port ${PORT}`);
console.log(`Supabase: ${SUPABASE_URL ? '✓ configured' : '✗ MISSING'}`);

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) row.push(field);
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).filter(r => r.length && !(r.length === 1 && r[0] === '')).map(r => {
    const o = {}; headers.forEach((h, idx) => { o[h] = r[idx] || ''; }); return o;
  });
}

const BRANDS = ['Dunhill', 'Mevius', 'LD', 'Marlboro', 'Chesterfield'];

function parseBrandReply(text) {
  if (!text) return null;
  const result = { Dunhill: null, Mevius: null, LD: null, Marlboro: null, Chesterfield: null };
  const lower = text.toLowerCase();
  const numbered = [...lower.matchAll(/([1-5])\s*[.):,\-]?\s*(ya|yes|y|ada|jual|tak|no|n|tidak|takde|tiada)/g)];
  if (numbered.length >= 3) {
    let any = false;
    numbered.forEach(m => { result[BRANDS[parseInt(m[1])-1]] = ['ya','yes','y','ada','jual'].includes(m[2]); any = true; });
    if (any) { BRANDS.forEach(b => { if (result[b] === null) result[b] = false; }); return result; }
  }
  let any = false;
  BRANDS.forEach(b => { if (new RegExp('\\b'+b.toLowerCase()+'\\b').test(lower)) { result[b] = true; any = true; } });
  if (any) { BRANDS.forEach(b => { if (result[b] === null) result[b] = false; }); return result; }
  if (/\b(takde\s+semua|none|tak\s+jual|tiada|no\s+stock|takde)\b/.test(lower)) { BRANDS.forEach(b => { result[b] = false; }); return result; }
  return null;
}

function classifyOutcome(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].Role !== 'ai') continue;
    const t = (messages[i].Message || '').toLowerCase();
    if (t.includes('lead captured successfully') || t.includes('maklumat prospek berjaya')) return 'INTERESTED';
    if (t.includes('already selling philip morris') || t.includes('sudah menjual produk philip morris')) return 'ALREADY_SELLING';
    if (t.includes('photo was declined') || t.includes('foto ditolak')) return 'NOT_INTERESTED_NO_PHOTO';
    if (t.includes('recorded as not interested') || t.includes('direkodkan sebagai tidak berminat')) return 'NOT_INTERESTED';
  }
  return null;
}

function findOwnerInfo(messages) {
  let ni = -1, ci = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].Role !== 'ai') continue;
    const t = (messages[i].Message || '').toLowerCase();
    if (ni === -1 && (t.includes("enter the store owner's name") || t.includes('masukkan nama pemilik kedai'))) ni = i;
    if (ci === -1 && (t.includes("enter the store owner's contact") || t.includes('masukkan nombor telefon pemilik'))) ci = i;
  }
  let name = null, contact = null;
  if (ni !== -1) {
    for (let j = ni+1; j < Math.min(ni+10, messages.length); j++) {
      const next = messages[j];
      if (next.Role !== 'human' || next.Message.startsWith('[Image:')) continue;
      const v = next.Message.trim();
      if (/^(ya|yes|y|tidak|tak|no|n|berminat|minat)$/i.test(v)) continue;
      if (/^\+?\d[\d\s\-]{6,}$/.test(v)) continue;
      name = v; break;
    }
  }
  if (ci !== -1) {
    for (let j = ci+1; j < messages.length; j++) {
      const next = messages[j];
      if (next.Role !== 'human' || next.Message.startsWith('[Image:')) continue;
      const v = next.Message.trim();
      if (/^\+?\d[\d\s\-]{6,}$/.test(v)) { contact = v; break; }
    }
  }
  return { name, contact };
}

function findBrandReply(messages) {
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].Role !== 'ai') continue;
    const text = messages[i].Message || '';
    if (text.includes('1. Dunhill') || text.includes('**1. Dunhill**')) {
      for (let j = i+1; j < messages.length; j++) {
        const next = messages[j];
        if (next.Role !== 'human' || next.Message.startsWith('[Image:')) continue;
        const v = next.Message.trim().toLowerCase();
        if (/\b[1-5]\b.*?(yes|no|ya|tak|tidak)/i.test(v) || /(dunhill|mevius|marlboro|chesterfield|\bld\b)/i.test(v) || /\b(takde|tiada|none|tak\s*jual)\b/i.test(v)) return next.Message;
      }
    }
  }
  return null;
}

function findDuration(messages) {
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].Role !== 'ai') continue;
    const t = (messages[i].Message || '').toLowerCase();
    if (t.includes('how long has this store not been selling') || t.includes('berapa lama kedai ini sudah tidak menjual')) {
      for (let j = i+1; j < messages.length; j++) {
        const next = messages[j];
        if (next.Role === 'human' && !next.Message.startsWith('[Image:')) {
          const v = next.Message.trim();
          if (/^\d\s+(yes|no|ya|tak|tidak)/i.test(v) || /^(ya|yes|y|tidak|tak|no|n|berminat|minat)$/i.test(v)) continue;
          return v;
        }
      }
    }
  }
  return null;
}

function extractPhotoFilenames(messages) {
  const photos = [];
  messages.forEach(m => {
    if (m.Role !== 'human') return;
    const match = (m.Message || '').match(/\[Image:\s*([^\]]+)\]/);
    if (match) photos.push(match[1].trim());
  });
  return photos;
}

async function processZip(zipBuffer, batchId) {
  const zip = await JSZip.loadAsync(zipBuffer);
  const csvNames = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith('.csv'));
  if (!csvNames.some(n => /jobs\.csv$/i.test(n))) throw new Error('No jobs.csv found');
  if (!csvNames.some(n => /conversation\.csv$/i.test(n))) throw new Error('No conversation.csv found');

  const jobsCsv = await zip.files[csvNames.find(n => /jobs\.csv$/i.test(n))].async('string');
  const convCsv = await zip.files[csvNames.find(n => /conversation\.csv$/i.test(n))].async('string');
  const jobs = parseCSV(jobsCsv);
  const allMessages = parseCSV(convCsv);

  const byJob = {};
  allMessages.forEach(m => { const jid = m['Job ID']; if (!byJob[jid]) byJob[jid] = []; byJob[jid].push(m); });
  Object.keys(byJob).forEach(jid => {
    byJob[jid].sort((a, b) => a['Created At'] !== b['Created At'] ? a['Created At'].localeCompare(b['Created At']) : (+a['Message ID']) - (+b['Message ID']));
  });

  // Upload photos to Supabase storage
  const photoUrls = {};
  const imageFiles = {};
  Object.keys(zip.files).forEach(name => {
    if (/\.(jpg|jpeg|png)$/i.test(name)) imageFiles[name.split('/').pop()] = zip.files[name];
  });

  for (const [filename, file] of Object.entries(imageFiles)) {
    try {
      const buffer = await file.async('nodebuffer');
      const storagePath = `batch_${batchId}/${filename}`;
      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
      if (!error) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
        photoUrls[filename] = data.publicUrl;
      } else {
        console.error('Photo upload error:', filename, error.message);
      }
    } catch (e) { console.error('Photo error:', filename, e.message); }
  }

  // Parse jobs
  const derived = [];
  for (const j of jobs) {
    const jobId = j['Job ID'];
    const msgs = byJob[jobId] || [];
    const status = (j['Status'] || '').toLowerCase();
    const photoFilenames = extractPhotoFilenames(msgs);
    let outcome = null, brands = { Dunhill: null, Mevius: null, LD: null, Marlboro: null, Chesterfield: null };
    let ownerName = null, ownerContact = null, duration = null;
    if (status === 'success' && msgs.length > 0) {
      outcome = classifyOutcome(msgs);
      const br = findBrandReply(msgs); if (br) { const p = parseBrandReply(br); if (p) brands = p; }
      if (outcome === 'INTERESTED') { const info = findOwnerInfo(msgs); ownerName = info.name; ownerContact = info.contact; }
      if (['INTERESTED','NOT_INTERESTED','NOT_INTERESTED_NO_PHOTO'].includes(outcome)) duration = findDuration(msgs);
    }
    derived.push({
      job_id: jobId,
      date: (j['Date'] || (j['Created At'] || '').slice(0,10)).trim(),
      region: 'Unknown', city: 'Unknown', status, outcome,
      dunhill: brands.Dunhill, mevius: brands.Mevius, ld: brands.LD, marlboro: brands.Marlboro, chesterfield: brands.Chesterfield,
      interested_in_pmm: outcome === 'INTERESTED' ? true : ['NOT_INTERESTED','NOT_INTERESTED_NO_PHOTO'].includes(outcome) ? false : null,
      owner_name: ownerName, owner_contact: ownerContact, how_long_no_pmm: duration,
      photo_shop_front: photoFilenames[0] ? (photoUrls[photoFilenames[0]] || photoFilenames[0]) : null,
      photo_dispenser: photoFilenames[1] ? (photoUrls[photoFilenames[1]] || photoFilenames[1]) : null,
      created_at: (j['Created At'] || '').trim(),
      agent: j['Telegram First Name'] || null,
      batch_id: batchId,
    });
  }
  return { jobs: derived, photoCount: Object.keys(photoUrls).length };
}

// ============================================================
// ROUTES
// ============================================================

app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString(), supabase: !!SUPABASE_URL });
});

app.get('/api/jobs', async (req, res) => {
  if (req.headers['x-password'] !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { data, error } = await supabase.from('jobs').select('*').order('date', { ascending: false });
    if (error) throw error;
    const jobs = (data || []).map(r => ({
      jobId: r.job_id, date: r.date, region: r.region, city: r.city, status: r.status, outcome: r.outcome,
      brands: { Dunhill: r.dunhill, Mevius: r.mevius, LD: r.ld, Marlboro: r.marlboro, Chesterfield: r.chesterfield },
      interestedInPmm: r.interested_in_pmm, ownerName: r.owner_name, ownerContact: r.owner_contact,
      howLongNoPmm: r.how_long_no_pmm, photoShopFront: r.photo_shop_front, photoDispenser: r.photo_dispenser,
      createdAt: r.created_at, _agent: r.agent,
    }));
    res.json({ jobs, count: jobs.length, source: 'supabase' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/upload', (req, res) => {
  if (req.headers['x-password'] !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  const bb = busboy({ headers: req.headers, limits: { fileSize: 200 * 1024 * 1024 } });
  let fileBuffer = null, uploaderName = 'unknown';
  bb.on('file', (f, file) => { const chunks = []; file.on('data', c => chunks.push(c)); file.on('end', () => { fileBuffer = Buffer.concat(chunks); }); });
  bb.on('field', (f, val) => { if (f === 'uploader') uploaderName = val; });
  bb.on('close', async () => {
    if (!fileBuffer) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const { data: uploads } = await supabase.from('uploads').select('batch_id').order('batch_id', { ascending: false }).limit(1);
      const batchId = uploads && uploads.length > 0 ? uploads[0].batch_id + 1 : 1;
      const { jobs, photoCount } = await processZip(fileBuffer, batchId);
      const { error } = await supabase.from('jobs').upsert(jobs, { onConflict: 'job_id' });
      if (error) throw error;
      await supabase.from('uploads').insert([{ uploader_name: uploaderName, job_count: jobs.length, batch_id: batchId }]);
      res.json({ ok: true, batchId, jobsUploaded: jobs.length, photosUploaded: photoCount });
    } catch (e) { console.error('Upload error:', e); res.status(400).json({ error: e.message }); }
  });
  req.pipe(bb);
});

app.listen(PORT, () => { console.log(`✓ Listening on port ${PORT}`); });
