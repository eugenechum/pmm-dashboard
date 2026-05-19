// ============================================================
// PARSER MODULE — runs entirely in the browser
// Inputs: a JSZip instance loaded from a user-uploaded ZIP
// Output: array of derived job objects in the same shape as RAW_JOBS
// ============================================================

const PARSER = (function() {

  // -- CSV parser (RFC-4180-ish, handles quoted fields with embedded commas + newlines + escaped quotes)
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false, i = 0;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i+1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ',') { row.push(field); field = ""; i++; continue; }
        if (c === '\r') { i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
        field += c; i++; continue;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows[0];
    return rows.slice(1).filter(r => r.length && !(r.length === 1 && r[0] === ""))
      .map(r => {
        const o = {};
        headers.forEach((h, idx) => { o[h] = r[idx] !== undefined ? r[idx] : ""; });
        return o;
      });
  }

  // -- Brand list (must match dashboard order)
  const BRAND_ORDER = ["Dunhill", "Mevius", "LD", "Marlboro", "Chesterfield"];

  // -- Parse brand sell-through from a human reply like:
  //    "1 yes 2 yes 3 no 4 no 5 no" or "1 ya 2 ya 3 tak 4 tak 5 tak"
  //    Also tolerant of "1. yes" / "1) ya" / "yes, yes, no, no, no" / brand names
  function parseBrandReply(text) {
    if (!text) return null;
    const result = { Dunhill: null, Mevius: null, LD: null, Marlboro: null, Chesterfield: null };
    const lower = text.toLowerCase();

    // Try numbered pattern first: capture (number)(separator)(yes|no|ya|tak|tidak)
    const numbered = [...lower.matchAll(/([1-5])\s*[.):,\-]?\s*(ya|yes|y|ada|jual|tak|no|n|tidak|takde|tiada)/g)];
    if (numbered.length >= 3) {
      let foundAny = false;
      numbered.forEach(m => {
        const idx = parseInt(m[1], 10) - 1;
        const tok = m[2];
        const isYes = ["ya","yes","y","ada","jual"].includes(tok);
        result[BRAND_ORDER[idx]] = isYes;
        foundAny = true;
      });
      if (foundAny) {
        // Fill any unmentioned with false (driver answered partially → unmentioned ≈ none)
        BRAND_ORDER.forEach(b => { if (result[b] === null) result[b] = false; });
        return result;
      }
    }

    // Fallback: search for brand names directly
    let foundAny = false;
    BRAND_ORDER.forEach(b => {
      const re = new RegExp("\\b" + b.toLowerCase() + "\\b");
      if (re.test(lower)) { result[b] = true; foundAny = true; }
    });
    if (foundAny) {
      // Negative phrases that mean none
      if (/\b(takde|tiada|none|no\s+cigarettes|tak\s+jual|nothing)\b/.test(lower)) {
        BRAND_ORDER.forEach(b => { result[b] = false; });
        return result;
      }
      // Unmentioned brands → false
      BRAND_ORDER.forEach(b => { if (result[b] === null) result[b] = false; });
      return result;
    }

    // "takde semua" / "no cigarettes" → all false
    if (/\b(takde\s+semua|none|tak\s+jual|tiada|no\s+stock|takde)\b/.test(lower)) {
      BRAND_ORDER.forEach(b => { result[b] = false; });
      return result;
    }

    return null; // could not interpret
  }

  // -- Classify outcome by scanning ai messages for terminal markers
  function classifyOutcome(messages) {
    // Walk AI messages looking for the closing line
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.Role !== "ai") continue;
      const text = (m.Message || "").toLowerCase();
      if (text.includes("lead captured successfully") ||
          text.includes("maklumat prospek berjaya")) return "INTERESTED";
      if (text.includes("already selling philip morris") ||
          text.includes("sudah menjual produk philip morris")) return "ALREADY_SELLING";
      if (text.includes("photo was declined") ||
          text.includes("foto ditolak")) return "NOT_INTERESTED_NO_PHOTO";
      if (text.includes("recorded as not interested") ||
          text.includes("direkodkan sebagai tidak berminat")) return "NOT_INTERESTED";
    }
    return null;
  }

  // -- Find owner name + contact. Strategy: locate the AI prompts, then
  //    search forward in the message stream (within reasonable window)
  //    for human replies that match the expected format. We don't stop at
  //    the next AI prompt — real conversations have timestamp ties &
  //    out-of-order delivery, so format-matching is more reliable.
  function findOwnerInfo(messages) {
    // Find indices of the prompts
    let namePromptIdx = -1, contactPromptIdx = -1;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].Role !== "ai") continue;
      const text = (messages[i].Message || "").toLowerCase();
      if (namePromptIdx === -1 && (text.includes("enter the store owner's name") ||
                                    text.includes("masukkan nama pemilik kedai"))) {
        namePromptIdx = i;
      }
      if (contactPromptIdx === -1 && (text.includes("enter the store owner's contact") ||
                                       text.includes("masukkan nombor telefon pemilik"))) {
        contactPromptIdx = i;
      }
    }

    let name = null, contact = null;

    // Name = first human reply after name prompt that doesn't look like a yes/no
    //        AND doesn't look like a phone number (since the contact reply
    //        might also appear in the window)
    if (namePromptIdx !== -1) {
      for (let j = namePromptIdx + 1; j < messages.length; j++) {
        const next = messages[j];
        if (next.Role !== "human" || next.Message.startsWith("[Image:")) continue;
        const v = next.Message.trim();
        if (/^(ya|yes|y|tidak|tak|no|n|berminat|minat|tak\s*berminat|nak\s+jual)$/i.test(v)) continue;
        if (/^\+?\d[\d\s\-]{6,}$/.test(v)) continue; // skip phone numbers
        // Stop searching if we hit the dispenser prompt or survey complete
        // (means name was never given)
        if (j > namePromptIdx + 10) break;
        name = v;
        break;
      }
    }

    // Contact = first human reply after contact prompt that looks like a phone number.
    // If the AI says "Invalid format" we keep searching for the corrected number.
    if (contactPromptIdx !== -1) {
      for (let j = contactPromptIdx + 1; j < messages.length; j++) {
        const next = messages[j];
        if (next.Role !== "human" || next.Message.startsWith("[Image:")) continue;
        const v = next.Message.trim();
        if (!/^\+?\d[\d\s\-]{6,}$/.test(v)) continue; // must look like phone
        // The LAST valid phone number wins (handles "Invalid format" retries
        // where the first phone was rejected and a corrected one was sent)
        // BUT we need to make sure we don't go past the survey close.
        // Check: is there an AI "Survey complete" between this and the prompt?
        let pastClose = false;
        for (let k = contactPromptIdx + 1; k < j; k++) {
          if (messages[k].Role === "ai") {
            const t = (messages[k].Message || "").toLowerCase();
            if (t.includes("survey complete") || t.includes("tinjauan selesai")) {
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

  // -- Find the human reply that contains the brand answer (comes after the "1. Dunhill 2. Mevius..." prompt)
  function findBrandReply(messages) {
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      if (m.Role !== "ai") continue;
      const text = (m.Message || "");
      if (text.includes("1. Dunhill") || text.includes("**1. Dunhill**")) {
        // Find the next human msg that LOOKS like a brand answer (has numbers OR brand names)
        for (let j = i + 1; j < messages.length; j++) {
          const next = messages[j];
          if (next.Role !== "human" || next.Message.startsWith("[Image:")) continue;
          const v = next.Message.trim().toLowerCase();
          // Must contain at least one of: numbered list, brand name, or negation
          const hasNumbered = /\b[1-5]\b.*?(yes|no|ya|tak|tidak)/i.test(v);
          const hasBrand = /(dunhill|mevius|marlboro|chesterfield|\bld\b)/i.test(v);
          const hasNegation = /\b(takde|tiada|none|tak\s*jual)\b/i.test(v);
          if (hasNumbered || hasBrand || hasNegation) {
            return next.Message;
          }
        }
      }
    }
    return null;
  }

  // -- Find duration reply (after "How long has this store not been selling")
  function findDuration(messages) {
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      if (m.Role !== "ai") continue;
      const text = (m.Message || "").toLowerCase();
      if (text.includes("how long has this store not been selling") ||
          text.includes("berapa lama kedai ini sudah tidak menjual")) {
        for (let j = i + 1; j < messages.length; j++) {
          const next = messages[j];
          if (next.Role === "ai") {
            const nt = (next.Message || "").toLowerCase();
            if (nt.includes("interested in selling") ||
                nt.includes("berminat untuk menjual") ||
                nt.includes("survey complete")) break;
          }
          if (next.Role === "human" && !next.Message.startsWith("[Image:")) {
            const v = next.Message.trim();
            // Reject brand-answer format like "1 yes 2 yes 3 no..."
            if (/^\d\s+(yes|no|ya|tak|tidak)/i.test(v)) continue;
            // Reject obvious interest answers
            if (/^(ya|yes|y|tidak|tak|no|n|berminat|minat)$/i.test(v)) continue;
            return v;
          }
        }
      }
    }
    return null;
  }

  // -- Extract photo IDs (in order) from [Image: ...] markers in human messages
  function extractPhotos(messages) {
    const photos = [];
    messages.forEach(m => {
      if (m.Role !== "human") return;
      const match = (m.Message || "").match(/\[Image:\s*([^\]]+)\]/);
      if (match) photos.push(match[1].trim());
    });
    return photos;
  }

  // -- Guess region+city from owner contact prefix or fall back to "Unknown".
  //    For this prototype we don't have real address data per job, so we'll
  //    leave region/city blank when uploading real ZIPs. The dashboard handles this.
  function guessRegion(job) {
    // The real ZIP doesn't contain region data — left blank for honesty
    return { region: "Unknown", city: "Unknown" };
  }

  // -- Main pipeline: zip -> array of derived jobs
  async function processZip(zip, onProgress) {
    onProgress && onProgress({ stage: "reading", message: "Reading ZIP contents..." });

    const files = Object.keys(zip.files);
    const csvNames = files.filter(f => f.toLowerCase().endsWith(".csv"));
    const imageNames = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

    if (!csvNames.some(n => /jobs\.csv$/i.test(n))) {
      throw new Error("Could not find jobs.csv in ZIP. Expected files: jobs.csv, conversation.csv, tasks.csv");
    }
    if (!csvNames.some(n => /conversation\.csv$/i.test(n))) {
      throw new Error("Could not find conversation.csv in ZIP.");
    }

    onProgress && onProgress({ stage: "parsing", message: "Parsing jobs.csv..." });
    const jobsFile = csvNames.find(n => /jobs\.csv$/i.test(n));
    const jobsCsv = await zip.files[jobsFile].async("string");
    const jobs = parseCSV(jobsCsv);

    onProgress && onProgress({ stage: "parsing", message: "Parsing conversation.csv..." });
    const convFile = csvNames.find(n => /conversation\.csv$/i.test(n));
    const convCsv = await zip.files[convFile].async("string");
    const allMessages = parseCSV(convCsv);

    // Group messages by Job ID
    const byJob = {};
    allMessages.forEach(m => {
      const jid = m["Job ID"];
      if (!byJob[jid]) byJob[jid] = [];
      byJob[jid].push(m);
    });
    // Sort each group by Created At (lexicographic on the timestamp string works for ISO-like format)
    Object.keys(byJob).forEach(jid => {
      byJob[jid].sort((a, b) => {
        if (a["Created At"] !== b["Created At"]) return a["Created At"].localeCompare(b["Created At"]);
        // tiebreak by Message ID numerically
        return (+a["Message ID"]) - (+b["Message ID"]);
      });
    });

    onProgress && onProgress({ stage: "classifying", message: "Classifying " + jobs.length + " jobs..." });

    // Pre-load all images as data URLs (browser only — Node test skips this)
    const imageBlobs = {};
    if (typeof window !== "undefined") {
      onProgress && onProgress({ stage: "images", message: "Loading " + imageNames.length + " images..." });
      for (const name of imageNames) {
        try {
          const blob = await zip.files[name].async("blob");
          const url = URL.createObjectURL(blob);
          imageBlobs[name] = url;
          // Also key by base filename (in case path differs)
          const base = name.split("/").pop();
          if (base !== name) imageBlobs[base] = url;
        } catch (e) { /* skip bad images */ }
      }
    }

    // Build derived job records
    const derived = [];
    for (const j of jobs) {
      const jobId = j["Job ID"];
      const msgs = byJob[jobId] || [];
      const status = (j["Status"] || "").toLowerCase();

      const photos = extractPhotos(msgs);
      const photoShopFront = photos[0] || null;
      const photoDispenser = photos[1] || null;

      let outcome = null;
      let brands = { Dunhill: null, Mevius: null, LD: null, Marlboro: null, Chesterfield: null };
      let ownerName = null, ownerContact = null, duration = null;

      if (status === "success" && msgs.length > 0) {
        outcome = classifyOutcome(msgs);
        const brandReply = findBrandReply(msgs);
        if (brandReply) {
          const parsed = parseBrandReply(brandReply);
          if (parsed) brands = parsed;
        }
        if (outcome === "INTERESTED") {
          const info = findOwnerInfo(msgs);
          ownerName = info.name;
          ownerContact = info.contact;
        }
        if (outcome === "INTERESTED" || outcome === "NOT_INTERESTED" || outcome === "NOT_INTERESTED_NO_PHOTO") {
          duration = findDuration(msgs);
        }
      }

      const loc = guessRegion(j);

      // Date / created — be tolerant of formats
      const date = (j["Date"] || (j["Created At"] || "").slice(0, 10) || "").trim();
      const createdAt = (j["Created At"] || "").trim();

      derived.push({
        jobId: jobId,
        date: date,
        region: loc.region,
        city: loc.city,
        status: status,
        outcome: outcome,
        brands: brands,
        interestedInPmm: outcome === "INTERESTED" ? true
                       : (outcome === "NOT_INTERESTED" || outcome === "NOT_INTERESTED_NO_PHOTO") ? false
                       : null,
        ownerName: ownerName,
        ownerContact: ownerContact,
        howLongNoPmm: duration,
        photoShopFront: photoShopFront,
        photoDispenser: photoDispenser,
        createdAt: createdAt,
        _agent: j["Telegram First Name"] || null,
        _agentTgId: j["Telegram User ID"] || null,
      });
    }

    onProgress && onProgress({ stage: "done", message: "Parsed " + derived.length + " jobs" });

    return {
      jobs: derived,
      images: imageBlobs,
      meta: {
        totalJobs: jobs.length,
        totalImages: imageNames.length,
        totalMessages: allMessages.length,
        files: { csv: csvNames.length, images: imageNames.length },
      }
    };
  }

  return { processZip, parseCSV, parseBrandReply, classifyOutcome };
})();

// Expose on global scope so the React app (in a separate script block) can use it
if (typeof window !== "undefined") window.PARSER = PARSER;
