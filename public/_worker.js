const visionPrompt =
  "Read this lab chemical container label. First locate the manufacturer banner, then read the first large bold black product-name line immediately below or beside the catalogue/pack code. That exact English product line is chemicalName. Never use the manufacturer (such as Sigma-Aldrich or Merck), a translated synonym below the main name, a solvent-only fragment such as Methanol Solution, or a shortened fragment such as Silyl Chloride. If the label says Boron trifluoride-methanol solution or Boron trifluoride in methanol, chemicalName must be Boron Trifluoride Methanol Solution, not Methanol Solution. Read the catalogue number separately: for 92337-5ML return catalogNumber 92337, quantity 1, containerSize 5, unit mL; for 89595-10X1ML return catalogNumber 89595, quantity 10, containerSize 1, unit mL. Ignore lot, purity/grade, hazard text and pictograms. Preserve full numbered names, salts, buffer names and commercial reagent names exactly. Return only compact JSON with keys: chemicalName, catalogNumber, quantity, containerSize, unit, physicalState, physicalStateEvidence, casNumber, confidence. physicalStateEvidence must be label, product-name, inferred, or none. unit must be g, kg, mL, or L. physicalState must be Solid, Liquid, Gas, or Unknown. Use Unknown rather than guessing.";

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/openai-vision") return handleVisionRequest(request, env);
    if (url.pathname === "/api/chemical-lookup") return handleChemicalLookup(request, env);
    return env.ASSETS.fetch(request);
  },
};

export default worker;

async function handleVisionRequest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured" }, 503);

  try {
    const body = await request.json();
    if (!body.image || typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
      return json({ error: "A base64 image data URL is required" }, 400);
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: visionPrompt },
              { type: "input_image", image_url: body.image },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    return json(data, response.status);
  } catch {
    return json({ error: "Vision OCR proxy failed" }, 500);
  }
}

async function handleChemicalLookup(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    const originalName = cleanText(body.name, 120);
    const suppliedCas = cleanText(body.casNumber, 24);
    const labelState = normalizeState(body.labelState);
    if (!originalName) return json({ error: "Chemical name is required" }, 400);

    if (isCommercialProductName(originalName)) {
      return json({
        name: originalName,
        source: "Product label",
        physicalState: labelState !== "Unknown" ? labelState : stateFromExplicitName(originalName),
        confidence: 0.78,
        reviewRequired: true,
      });
    }

    let identity = await lookupPubChem(originalName, suppliedCas);
    if (!identity || identity.confidence < 0.86) {
      const comptox = await lookupCompTox(originalName, suppliedCas, env);
      if (comptox && (!identity || comptox.confidence > identity.confidence)) identity = comptox;
    }
    if (!identity || identity.confidence < 0.86) {
      const echa = await lookupEcha(originalName, suppliedCas);
      if (echa && (!identity || echa.confidence > identity.confidence)) identity = echa;
    }

    const preservedName = identity && identity.confidence >= 0.86 ? identity.name : originalName;
    let physicalState = labelState !== "Unknown" ? labelState : stateFromExplicitName(originalName);
    let stateSource = labelState !== "Unknown" ? "Product label" : physicalState !== "Unknown" ? "Product name" : "";

    if (physicalState === "Unknown" && identity?.physicalState && identity.physicalState !== "Unknown") {
      physicalState = identity.physicalState;
      stateSource = identity.source;
    }

    let icsc = null;
    if (!identity || identity.confidence < 0.86 || physicalState === "Unknown") {
      icsc = await lookupIcsc(preservedName, identity?.casNumber || suppliedCas);
      if (icsc && (!identity || icsc.confidence > identity.confidence)) identity = icsc;
      if (physicalState === "Unknown" && icsc?.physicalState !== "Unknown") {
        physicalState = icsc.physicalState;
        stateSource = "ICSC";
      }
    }

    const casForState = identity?.casNumber || suppliedCas || icsc?.casNumber;
    if (physicalState === "Unknown" && casForState) {
      const nistState = await lookupNistState(casForState);
      if (nistState !== "Unknown") {
        physicalState = nistState;
        stateSource = "NIST";
      }
    }

    const confidence = identity?.confidence ?? 0.45;
    const finalName = identity && confidence >= 0.86 ? identity.name : originalName;
    return json({
      name: finalName,
      source: [identity?.source, stateSource && stateSource !== identity?.source ? stateSource : ""].filter(Boolean).join(" + ") || "OCR",
      physicalState,
      confidence,
      reviewRequired: confidence < 0.86,
    });
  } catch {
    return json({ error: "Chemical lookup failed" }, 500);
  }
}

async function lookupPubChem(name, casNumber) {
  const searches = [casNumber, name].filter(Boolean);
  for (const search of searches) {
    const property = await pubChemProperty(search);
    if (property) return enrichPubChemMatch(name, casNumber, property);
  }

  const suggestions = await fetchJson(
    `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(name)}/JSON?limit=5`,
    5000,
  );
  for (const suggestion of suggestions?.dictionary_terms?.compound ?? []) {
    if (nameSimilarity(name, suggestion) < 0.78) continue;
    const property = await pubChemProperty(suggestion);
    if (property) return enrichPubChemMatch(name, casNumber, property);
  }
  return null;
}

async function pubChemProperty(search) {
  const data = await fetchJson(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(search)}/property/Title,IUPACName/JSON`,
    6000,
  );
  return data?.PropertyTable?.Properties?.[0] ?? null;
}

async function enrichPubChemMatch(originalName, suppliedCas, property) {
  const synonymData = await fetchJson(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${property.CID}/synonyms/JSON`,
    6000,
  );
  const synonyms = synonymData?.InformationList?.Information?.[0]?.Synonym?.slice(0, 100) ?? [];
  const casNumber = synonyms.find((value) => /^\d{2,7}-\d{2}-\d$/.test(value));
  const candidates = [property.Title, ...synonyms, property.IUPACName].filter(Boolean);
  const bestSimilarity = Math.max(...candidates.map((candidate) => nameSimilarity(originalName, candidate)));
  const casExact = Boolean(suppliedCas && casNumber === suppliedCas);
  const confidence = casExact ? 0.99 : bestSimilarity >= 0.98 ? 0.97 : bestSimilarity >= 0.88 ? 0.92 : bestSimilarity >= 0.78 ? 0.82 : 0.68;
  const name = chooseCommonName(property.Title, synonyms, property.IUPACName, originalName);
  const physicalState = await lookupPubChemState(property.CID);
  return { name, source: "PubChem", confidence, casNumber, physicalState };
}

async function lookupPubChemState(cid) {
  const data = await fetchJson(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON?heading=Physical%20Description`,
    6000,
  );
  const text = collectStrings(data?.Record?.Section).join(" ");
  return stateFromDescription(text);
}

async function lookupCompTox(name, casNumber, env) {
  if (!env.EPA_COMPTOX_API_KEY) return null;
  for (const search of [casNumber, name].filter(Boolean)) {
    const response = await fetch(
      `https://comptox.epa.gov/ctx-api/chemical/search/equal/${encodeURIComponent(search)}?projection=chemicalsearchall`,
      { headers: { Accept: "application/json", "x-api-key": env.EPA_COMPTOX_API_KEY } },
    );
    if (!response.ok) continue;
    const payload = await response.json();
    const result = Array.isArray(payload) ? payload[0] : payload;
    if (!result?.preferredName) continue;
    const casExact = Boolean(casNumber && result.casrn === casNumber);
    const similarity = Math.max(nameSimilarity(name, result.preferredName), nameSimilarity(name, result.searchName || ""));
    const confidence = casExact ? 0.98 : similarity >= 0.98 ? 0.95 : similarity >= 0.86 ? 0.89 : 0.72;
    return { name: result.preferredName, source: "EPA CompTox", confidence, casNumber: result.casrn, physicalState: "Unknown" };
  }
  return null;
}

async function lookupEcha(name, casNumber) {
  const search = casNumber || name;
  const data = await fetchJson(
    `https://chem.echa.europa.eu/api-substance/v1/substance?searchText=${encodeURIComponent(search)}&pageIndex=1&pageSize=5`,
    7000,
  );
  const items = data?.items ?? [];
  let best = null;
  for (const item of items) {
    const substance = item?.substanceIndex;
    if (!substance) continue;
    const names = [substance.rmlName, ...(substance.ecName ?? []), ...(substance.iupacName ?? []), ...(substance.tradeName ?? [])].filter(Boolean);
    const similarity = Math.max(...names.map((candidate) => nameSimilarity(name, candidate)));
    const echaCas = substance.rmlCas || substance.casNumber?.find((value) => /^\d{2,7}-\d{2}-\d$/.test(value));
    const casExact = Boolean(casNumber && echaCas === casNumber);
    const confidence = casExact ? 0.98 : similarity >= 0.98 ? 0.95 : similarity >= 0.88 ? 0.9 : 0.7;
    if (!best || confidence > best.confidence) {
      best = { name: substance.rmlName || names[0] || name, source: "ECHA CHEM", confidence, casNumber: echaCas, physicalState: "Unknown" };
    }
  }
  return best;
}

async function lookupIcsc(name, casNumber) {
  const indexResponse = await fetch("https://www.inchem.org/pages/icsc.html");
  if (!indexResponse.ok) return null;
  const indexHtml = await indexResponse.text();
  const links = [...indexHtml.matchAll(/<a[^>]+href=["']([^"']*eics\d+\.htm)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  let selected = null;
  let bestScore = 0;
  for (const link of links) {
    const title = stripHtml(link[2]).replace(/\s*\(ICSC\)\s*$/i, "").trim();
    const score = nameSimilarity(name, title);
    if (score > bestScore) {
      bestScore = score;
      selected = { href: link[1], title };
    }
  }
  if (!selected || bestScore < 0.82) return null;
  const cardUrl = new URL(selected.href, "https://www.inchem.org/pages/icsc.html").toString();
  const cardResponse = await fetch(cardUrl);
  if (!cardResponse.ok) return null;
  const html = await cardResponse.text();
  const cardCas = stripHtml(html.match(/CAS\s*#?\s*:\s*([\d-]+)/i)?.[1] ?? "");
  if (casNumber && cardCas && casNumber !== cardCas) return null;
  const description = html.match(/Physical State;?\s*Appearance<\/b>\s*<br\s*\/?>([\s\S]*?)<p/i)?.[1] ?? "";
  return {
    name: titleCaseWords(selected.title),
    source: "ICSC",
    confidence: casNumber && cardCas === casNumber ? 0.97 : bestScore >= 0.97 ? 0.94 : 0.86,
    casNumber: cardCas || casNumber,
    physicalState: stateFromDescription(stripHtml(description)),
  };
}

async function lookupNistState(casNumber) {
  const compactCas = casNumber.replace(/-/g, "");
  if (!/^\d{5,10}$/.test(compactCas)) return "Unknown";
  const response = await fetch(`https://webbook.nist.gov/cgi/cbook.cgi?ID=C${compactCas}&Units=SI&Mask=4`);
  if (!response.ok) return "Unknown";
  const html = await response.text();
  const boiling = readNistTemperature(html, "boil");
  const melting = readNistTemperature(html, "fus");
  const roomTemperature = 298.15;
  if (Number.isFinite(boiling) && boiling < roomTemperature) return "Gas";
  if (Number.isFinite(melting) && melting > roomTemperature) return "Solid";
  if (Number.isFinite(boiling) && Number.isFinite(melting) && melting <= roomTemperature && boiling >= roomTemperature) return "Liquid";
  return "Unknown";
}

function readNistTemperature(html, kind) {
  const match = html.match(new RegExp(`T<sub>${kind}<\\/sub><\\/td><td[^>]*>([0-9.]+)`, "i"));
  return match ? Number(match[1]) : NaN;
}

function chooseCommonName(title, synonyms, iupacName, fallback) {
  if (title && title.length <= 80 && !/CID|InChI/i.test(title)) return titleCaseWords(title);
  const preferred = [...synonyms.slice(0, 30)]
    .filter((value) => value && value.length <= 64 && /^[a-z0-9][a-z0-9\s,+'()\-.]+$/i.test(value))
    .sort((a, b) => commonNameScore(b) - commonNameScore(a))[0];
  return titleCaseWords(preferred || title || iupacName || fallback);
}

function commonNameScore(value) {
  let score = 60 - value.length;
  if (/^[A-Za-z][A-Za-z\s-]+$/.test(value)) score += 20;
  if (/\d{2,7}-\d{2}-\d/.test(value) || /CID|InChI/i.test(value)) score -= 100;
  return score;
}

function isCommercialProductName(name) {
  return /\b(buffer|reagent|standard|indicator|medium|media|mixture|kit|solution\s*pH|calibration|reference)\b/i.test(name);
}

function stateFromExplicitName(value) {
  const lower = value.toLowerCase();
  if (/\b(gas|compressed gas)\b/.test(lower)) return "Gas";
  if (/\b(solution|liquid|aqueous|suspension|emulsion)\b/.test(lower)) return "Liquid";
  if (/\b(powder|crystal|crystalline|solid|pellets|granules|flakes)\b/.test(lower)) return "Solid";
  return "Unknown";
}

function stateFromDescription(value) {
  const lower = String(value || "").toLowerCase();
  if (/\b(colou?rless |compressed |liquefied )?gas\b/.test(lower)) return "Gas";
  if (/\b(liquid|solution|oil|fluid)\b/.test(lower)) return "Liquid";
  if (/\b(solid|powder|crystal|crystalline|pellets|granules|flakes)\b/.test(lower)) return "Solid";
  return "Unknown";
}

function normalizeState(value) {
  return value === "Solid" || value === "Liquid" || value === "Gas" ? value : "Unknown";
}

function nameSimilarity(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function collectStrings(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, result));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, result));
  return result;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function titleCaseWords(value) {
  return String(value || "").toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
