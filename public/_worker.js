const visionPrompt =
  "Transcribe this lab chemical label before identifying it. Return every legible text line in ocrLines. Separately identify manufacturer, catalogue/pack code, CAS, lot, purity/grade, package size, and the large bold English product-name line. Never use Sigma-Aldrich, Merck, a translated synonym, solvent-only fragment, shortened fragment, or hazard wording as chemicalName. Do not invent missing letters. Return only compact JSON with keys: ocrLines, chemicalName, manufacturer, catalogNumber, quantity, containerSize, unit, physicalState, physicalStateEvidence, casNumber, confidence. unit must be g, kg, mL, or L. physicalState must be Solid, Liquid, Gas, or Unknown. Use Unknown rather than guessing.";

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/openai-vision") return handleVisionRequest(request, env);
    if (url.pathname === "/api/chemical-lookup") return handleChemicalLookup(request, env);
    if (url.pathname === "/api/resolve-ocr") return handleResolveOcr(request, env);
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

async function handleResolveOcr(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    const ocrText = cleanMultilineText(body.ocrText, 12000);
    const hints = {
      name: cleanText(body.name, 160),
      manufacturer: cleanText(body.manufacturer, 80),
      catalogNumber: cleanText(body.catalogNumber, 40),
      casNumber: cleanText(body.casNumber, 24),
      labelState: normalizeState(body.labelState),
    };
    const categories = categorizeOcrText(ocrText, hints);
    const result = await resolveCategorizedIdentity(categories, hints, env);
    if (!result) {
      return json({
        name: "",
        source: "Unverified OCR",
        physicalState: hints.labelState,
        confidence: 0,
        reviewRequired: true,
        categories,
      });
    }
    return json({ ...result, categories });
  } catch {
    return json({ error: "OCR identity resolution failed" }, 500);
  }
}

async function resolveCategorizedIdentity(categories, hints, env) {
  const catalogNumbers = [...new Set([hints.catalogNumber, ...categories.catalogNumbers].filter(Boolean))];
  const brandText = [hints.manufacturer, ...categories.brands].join(" ");
  for (const catalogNumber of catalogNumbers.slice(0, 3)) {
    const vendor = await lookupOfficialVendorProduct(catalogNumber, brandText);
    if (!vendor) continue;
    const pubChem = await lookupPubChem(vendor.name, vendor.casNumber || hints.casNumber);
    if (pubChem && (pubChem.confidence >= 0.86 || vendor.casNumber === pubChem.casNumber)) {
      return {
        ...pubChem,
        name: vendor.name,
        source: `${vendor.source} + PubChem`,
        physicalState: hints.labelState !== "Unknown" ? hints.labelState : vendor.physicalState !== "Unknown" ? vendor.physicalState : pubChem.physicalState,
        confidence: 0.99,
        reviewRequired: false,
      };
    }
    return { ...vendor, confidence: 0.96, reviewRequired: false };
  }

  const casNumber = hints.casNumber || categories.casNumbers[0] || "";
  if (casNumber) {
    const casMatch = await lookupPubChem(hints.name || casNumber, casNumber);
    if (casMatch) return { ...casMatch, confidence: 0.99, reviewRequired: false };
  }

  const candidates = [...new Set([hints.name, ...categories.chemicalCandidates].filter(Boolean))]
    .sort((left, right) => scoreChemicalCandidate(right) - scoreChemicalCandidate(left))
    .slice(0, 7);
  const pubChemMatches = await Promise.all(candidates.map((candidate) => lookupPubChem(candidate, "")));
  const strongPubChem = pubChemMatches
    .filter((match) => match && match.confidence >= 0.86)
    .sort((left, right) => right.confidence - left.confidence)[0];
  if (strongPubChem) {
    return {
      ...strongPubChem,
      physicalState: hints.labelState !== "Unknown" ? hints.labelState : strongPubChem.physicalState,
      reviewRequired: false,
    };
  }

  for (const candidate of candidates.slice(0, 4)) {
    const [comptox, echa] = await Promise.all([
      lookupCompTox(candidate, casNumber, env),
      lookupEcha(candidate, casNumber),
    ]);
    const match = [comptox, echa].filter(Boolean).sort((left, right) => right.confidence - left.confidence)[0];
    if (match?.confidence >= 0.86) return { ...match, reviewRequired: false };
  }
  return null;
}

function categorizeOcrText(ocrText, hints) {
  const lines = ocrText.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const result = {
    chemicalCandidates: [], brands: [], catalogNumbers: [], casNumbers: [], packageSizes: [],
    lotNumbers: [], purityAndGrade: [], ignoredText: [],
  };
  for (const line of lines) {
    const brand = line.match(/\b(?:sigma(?:-aldrich)?|aldrich|merck|millipore|supelco)\b/i);
    const cas = line.match(/\b\d{2,7}-\d{2}-\d\b/);
    const packCode = line.match(/\b([A-Z]?\d[\d.]{3,}[A-Z]?)\s*-\s*(?:\d+\s*[X×]\s*)?\d+(?:[.,]\d+)?\s*(?:ML|G|KG|L)\b/i);
    const size = line.match(/\b(?:\d+\s*[X×]\s*)?\d+(?:[.,]\d+)?\s*(?:ML|G|KG|L)\b/i);
    const lot = line.match(/\b(?:lot|batch)\s*(?:no\.?|#)?\s*[:#-]?\s*[A-Z0-9-]+/i);
    const purity = /\b(?:puriss?|purum|reagent|grade|assay|ACS|GC|HPLC|≥|>|%)\b/i.test(line);
    if (brand) result.brands.push(brand[0]);
    if (cas) result.casNumbers.push(cas[0]);
    if (packCode) result.catalogNumbers.push(packCode[1].replace(/\.$/, ""));
    if (size) result.packageSizes.push(size[0]);
    if (lot) result.lotNumbers.push(lot[0]);
    if (purity) result.purityAndGrade.push(line);
    const candidate = cleanOcrChemicalCandidate(line);
    if (candidate && !brand && !cas && !lot && !purity && !/\b(?:danger|warning|store|storage|safety|www\.|made in|for research|no ghs|symbol)\b/i.test(line)) {
      result.chemicalCandidates.push(candidate);
    } else if (!brand && !cas && !packCode && !size && !lot && !purity) {
      result.ignoredText.push(line);
    }
  }
  if (hints.name) result.chemicalCandidates.unshift(hints.name);
  if (hints.manufacturer) result.brands.unshift(hints.manufacturer);
  if (hints.catalogNumber) result.catalogNumbers.unshift(hints.catalogNumber);
  if (hints.casNumber) result.casNumbers.unshift(hints.casNumber);
  for (const key of Object.keys(result)) result[key] = [...new Set(result[key])].slice(0, 20);
  return result;
}

function cleanOcrChemicalCandidate(line) {
  const candidate = line
    .replace(/^\s*[A-Z]?\d[\d.]{3,}[A-Z]?\s*-\s*(?:\d+\s*[X×]\s*)?\d+(?:[.,]\d+)?\s*(?:ML|G|KG|L)\s*/i, "")
    .replace(/\b(?:puriss?|purum|reagent|grade|assay|ACS|GC|HPLC)\b.*$/i, "")
    .replace(/[^A-Za-z0-9,+().'\-\s]/g, " ").replace(/\s+/g, " ").trim();
  if (candidate.length < 5 || candidate.length > 120 || !/[A-Za-z]{4}/.test(candidate)) return "";
  if (/^(?:lot|batch|sigma|aldrich|merck|millipore|supelco)/i.test(candidate)) return "";
  return candidate;
}

function scoreChemicalCandidate(value) {
  let score = Math.min(50, value.length);
  if (/\b(?:acid|alcohol|chloride|bromide|fluoride|hydroxide|sulfate|silane|siloxane|solution|buffer|reagent|oxide|nitrate|phosphate)\b/i.test(value)) score += 35;
  if (/^[A-Za-z][A-Za-z0-9,+'().\-\s]{7,}$/.test(value)) score += 15;
  if (/\b(?:lot|batch|sigma|aldrich|merck|puriss?|grade|store|warning)\b/i.test(value)) score -= 80;
  return score;
}

async function lookupOfficialVendorProduct(catalogNumber, brandText) {
  const compact = catalogNumber.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  if (compact.length < 4) return null;
  const preferredBrands = /\bmerck|millipore\b/i.test(brandText)
    ? ["mm", "sial", "aldrich", "supelco"]
    : ["sial", "aldrich", "supelco", "mm"];
  const pages = await Promise.all(preferredBrands.map(async (brand) => {
    const url = `https://www.sigmaaldrich.com/GB/en/product/${brand}/${compact}`;
    const html = await fetchText(url, 7500);
    return html ? parseOfficialProductPage(html, catalogNumber, brand === "mm" ? "Merck" : "Sigma-Aldrich") : null;
  }));
  const product = pages.find(Boolean);
  if (product) return product;

  const merckUrl = `https://www.merckmillipore.com/GB/en/search/${encodeURIComponent(catalogNumber)}?searchterm=${encodeURIComponent(catalogNumber)}`;
  const merckHtml = await fetchText(merckUrl, 7500);
  return merckHtml ? parseOfficialProductPage(merckHtml, catalogNumber, "Merck") : null;
}

function parseOfficialProductPage(html, catalogNumber, source) {
  const plain = stripHtml(html);
  const compactCatalog = catalogNumber.replace(/[^A-Za-z0-9]/g, "");
  if (!plain.replace(/[^A-Za-z0-9]/g, "").toLowerCase().includes(compactCatalog.toLowerCase())) return null;
  const h1 = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").split(/\s+[|–-]\s+/)[0].trim();
  const name = [h1, title].find((value) => value && value.length >= 4 && value.length <= 120 && !/search results|sigma-aldrich|merck millipore/i.test(value));
  if (!name) return null;
  const casNumber = plain.match(/CAS(?: Number| #)?\s*:?\s*(\d{2,7}-\d{2}-\d)/i)?.[1] || "";
  return {
    name: titleCaseWords(name), source, casNumber,
    physicalState: stateFromDescription(plain.match(/\bform\s+([A-Za-z -]{3,40})/i)?.[1] || plain),
  };
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

function cleanMultilineText(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/[<>]/g, "").replace(/\r/g, "").replace(/[\t ]+/g, " ").trim().slice(0, maxLength)
    : "";
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Lab-Smalls-Scanner/1.0" },
    });
    if (!response.ok) return "";
    return (await response.text()).slice(0, 1500000);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
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
