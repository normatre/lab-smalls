import type { PhysicalState } from "@/types/lab-smalls";

export type PubChemMatch = {
  cid: number;
  name: string;
  source?: string;
  iupacName?: string;
  molecularFormula?: string;
  molecularWeight?: string;
  synonyms: string[];
  casNumber?: string;
  physicalState: PhysicalState;
};

type PropertyResponse = {
  PropertyTable?: {
    Properties?: Array<{
      CID: number;
      IUPACName?: string;
      MolecularFormula?: string;
      MolecularWeight?: string;
      Title?: string;
    }>;
  };
};

type SynonymResponse = {
  InformationList?: {
    Information?: Array<{
      CID: number;
      Synonym?: string[];
    }>;
  };
};

type OpsinResponse = {
  status?: string;
  message?: string;
  name?: string;
  smiles?: string;
  stdInChI?: string;
  stdInChIKey?: string;
};

type WikidataResponse = {
  results?: {
    bindings?: Array<{
      chemicalLabel?: { value?: string };
      cas?: { value?: string };
      pubchem?: { value?: string };
    }>;
  };
};

const stopWords = new Set([
  "warning",
  "danger",
  "hazard",
  "harmful",
  "toxic",
  "flammable",
  "corrosive",
  "irritant",
  "sigma",
  "aldrich",
  "merck",
  "millipore",
  "reagent",
  "grade",
  "label",
  "solution",
  "contains",
  "catalog",
  "product",
  "batch",
  "lot",
  "expiry",
  "exp",
  "store",
  "storage",
  "origin",
  "tested",
  "filtered",
  "acs",
  "a.c.s",
  "powder",
  "anhydrous",
  "hydrate",
]);

export async function lookupPubChemFromText(rawText: string): Promise<PubChemMatch | null> {
  const candidates = buildNameCandidates(rawText);
  for (const candidate of candidates) {
    const match = await lookupChemicalEverywhere(candidate);
    if (match) return match;
  }
  return null;
}

export async function lookupChemicalEverywhere(name: string): Promise<PubChemMatch | null> {
  const pubChem = await lookupPubChemName(name);
  if (pubChem) return pubChem;

  const cactus = await lookupCactus(name);
  if (cactus) return cactus;

  const opsin = await lookupOpsin(name);
  if (opsin) return opsin;

  return lookupWikidata(name);
}

export async function lookupPubChemName(name: string): Promise<PubChemMatch | null> {
  const encoded = encodeURIComponent(name.trim());
  if (!encoded) return null;

  try {
    const propertyUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encoded}/property/Title,IUPACName,MolecularFormula,MolecularWeight/JSON`;
    const propertyData = await fetchJson<PropertyResponse>(propertyUrl);
    const property = propertyData?.PropertyTable?.Properties?.[0];
    if (!property?.CID) return null;

    const synonymsUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${property.CID}/synonyms/JSON`;
    const synonymData = await fetchJson<SynonymResponse>(synonymsUrl);
    const synonyms = synonymData?.InformationList?.Information?.[0]?.Synonym?.slice(0, 50) ?? [];
    const displayName = property.Title || chooseDisplayName(name, synonyms) || property.IUPACName || name;

    return {
      cid: property.CID,
      name: displayName,
      source: "PubChem",
      iupacName: property.IUPACName,
      molecularFormula: property.MolecularFormula,
      molecularWeight: property.MolecularWeight,
      synonyms,
      casNumber: findCas(synonyms),
      physicalState: inferPhysicalState(`${displayName} ${synonyms.slice(0, 12).join(" ")}`),
    };
  } catch {
    return null;
  }
}

async function lookupPubChemCid(cid: string): Promise<PubChemMatch | null> {
  if (!/^\d+$/.test(cid.trim())) return null;
  try {
    const propertyUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${encodeURIComponent(cid.trim())}/property/Title,IUPACName,MolecularFormula,MolecularWeight/JSON`;
    const propertyData = await fetchJson<PropertyResponse>(propertyUrl);
    const property = propertyData?.PropertyTable?.Properties?.[0];
    if (!property?.CID) return null;

    const synonymData = await fetchJson<SynonymResponse>(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${property.CID}/synonyms/JSON`);
    const synonyms = synonymData?.InformationList?.Information?.[0]?.Synonym?.slice(0, 50) ?? [];
    const displayName = property.Title || chooseDisplayName(cid, synonyms) || property.IUPACName || `PubChem CID ${property.CID}`;
    return {
      cid: property.CID,
      name: displayName,
      source: "PubChem",
      iupacName: property.IUPACName,
      molecularFormula: property.MolecularFormula,
      molecularWeight: property.MolecularWeight,
      synonyms,
      casNumber: findCas(synonyms),
      physicalState: inferPhysicalState(`${displayName} ${synonyms.slice(0, 12).join(" ")}`),
    };
  } catch {
    return null;
  }
}

export async function searchPubChem(query: string): Promise<PubChemMatch[]> {
  const direct = await lookupChemicalEverywhere(query);
  if (direct) return [direct];

  const candidates = buildNameCandidates(query);
  const results: PubChemMatch[] = [];
  for (const candidate of candidates) {
    const match = await lookupChemicalEverywhere(candidate);
    if (match && !results.some((item) => item.cid === match.cid)) results.push(match);
    if (results.length >= 6) break;
  }
  return results;
}

async function lookupCactus(name: string): Promise<PubChemMatch | null> {
  const encoded = encodeURIComponent(name.trim());
  if (!encoded) return null;
  try {
    const [iupacName, casNumber] = await Promise.all([
      fetchText(`https://cactus.nci.nih.gov/chemical/structure/${encoded}/iupac_name`),
      fetchText(`https://cactus.nci.nih.gov/chemical/structure/${encoded}/cas`),
    ]);
    const resolvedName = cleanResolverText(iupacName) || name;
    const pubChem = await lookupPubChemName(casNumber ?? resolvedName);
    if (pubChem) return { ...pubChem, source: "NCI CACTUS + PubChem", casNumber: pubChem.casNumber ?? casNumber ?? undefined };
    if (!iupacName && !casNumber) return null;
    return {
      cid: -stableSyntheticId(`cactus:${name}`),
      name: titleCaseName(name),
      source: "NCI CACTUS",
      iupacName: resolvedName,
      synonyms: [name, resolvedName].filter(Boolean),
      casNumber: casNumber ?? undefined,
      physicalState: inferPhysicalState(`${name} ${resolvedName}`),
    };
  } catch {
    return null;
  }
}

async function lookupOpsin(name: string): Promise<PubChemMatch | null> {
  const encoded = encodeURIComponent(name.trim());
  if (!encoded) return null;
  try {
    const data = await fetchJson<OpsinResponse>(`https://www.ebi.ac.uk/opsin/${encoded}.json`);
    if (!data || data.status === "FAILURE") return null;
    const resolvedName = data.name || name;
    const pubChem = await lookupPubChemName(data.stdInChIKey ?? data.stdInChI ?? data.smiles ?? resolvedName);
    if (pubChem) return { ...pubChem, source: "OPSIN + PubChem" };
    return {
      cid: -stableSyntheticId(`opsin:${name}`),
      name: titleCaseName(name),
      source: "OPSIN",
      iupacName: resolvedName,
      synonyms: [name, data.smiles, data.stdInChIKey].filter(Boolean) as string[],
      physicalState: inferPhysicalState(name),
    };
  } catch {
    return null;
  }
}

async function lookupWikidata(name: string): Promise<PubChemMatch | null> {
  const cleaned = name.replace(/"/g, "");
  if (!cleaned.trim()) return null;
  const query = `
    SELECT ?chemical ?chemicalLabel ?cas ?pubchem WHERE {
      ?chemical rdfs:label "${cleaned}"@en.
      OPTIONAL { ?chemical wdt:P231 ?cas. }
      OPTIONAL { ?chemical wdt:P662 ?pubchem. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 1
  `;
  try {
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    const data = await fetchJson<WikidataResponse>(url);
    const result = data?.results?.bindings?.[0];
    if (!result) return null;
    if (result.pubchem?.value) {
      const pubChem = await lookupPubChemCid(result.pubchem.value);
      if (pubChem) return { ...pubChem, source: "Wikidata + PubChem", casNumber: pubChem.casNumber ?? result.cas?.value };
    }
    if (result.cas?.value) {
      const pubChem = await lookupPubChemName(result.cas.value);
      if (pubChem) return { ...pubChem, source: "Wikidata + PubChem", casNumber: pubChem.casNumber ?? result.cas.value };
    }
    return {
      cid: -stableSyntheticId(`wikidata:${name}`),
      name: result.chemicalLabel?.value ?? titleCaseName(name),
      source: "Wikidata",
      synonyms: [name],
      casNumber: result.cas?.value,
      physicalState: inferPhysicalState(name),
    };
  } catch {
    return null;
  }
}

function buildNameCandidates(rawText: string) {
  const cleanedLines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/[|()[\]{}]/g, " ").replace(/[^a-zA-Z0-9+,\-./\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && line.length <= 80);

  const candidates: string[] = [];
  const addCandidate = (candidate: string) => {
    const cleaned = cleanupCandidate(candidate);
    if (!cleaned) return;
    if (!candidates.some((item) => item.toLowerCase() === cleaned.toLowerCase())) candidates.push(cleaned);
  };

  for (const cas of rawText.match(/\b\d{2,7}-\d{2}-\d\b/g) ?? []) addCandidate(cas);

  for (const line of cleanedLines) {
    const lower = line.toLowerCase();
    if (isNoiseLine(lower)) continue;
    addCandidate(line);
    for (const fragment of line.split(/\s{2,}|[,;]/)) addCandidate(fragment);
  }

  const words = rawText
    .toLowerCase()
    .replace(/[^a-z0-9+\-\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word) && !/^[a-z]\d+$/i.test(word));

  for (let size = 4; size >= 1; size--) {
    for (let index = 0; index <= words.length - size; index++) {
      const phrase = words.slice(index, index + size).join(" ");
      if (phrase.length >= 4) addCandidate(phrase);
      if (candidates.length >= 28) break;
    }
    if (candidates.length >= 28) break;
  }

  return candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a)).slice(0, 28);
}

function cleanupCandidate(candidate: string) {
  const cleaned = candidate
    .replace(/\b(?:a\.?\s*c\.?\s*s\.?|acs|reagent|grade|powder|crystalline|granular|pellets?|flakes?|anhydrous|hydrate|for\s+analysis|extra\s+pure|certified|puriss?|bio\s*reagent)\b.*$/i, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*%.*$/i, " ")
    .replace(/[,;]\s*(?:powder|crystalline|granular|pellets?|flakes?|anhydrous|hydrate|reagent|grade|acs|a\.?\s*c\.?\s*s\.?|for\s+analysis|extra\s+pure|certified|puriss?|bio\s*reagent)\b.*$/i, " ")
    .replace(/\b(?:cat|catalog|product|prod|lot|batch|exp|expiry|store|storage)\b.*$/i, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/gi, " ")
    .replace(/\b(?:un\s*)?\d{4}\b/gi, " ")
    .replace(/\s*,\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 4 || cleaned.length > 64) return "";
  if (isNoiseLine(cleaned.toLowerCase())) return "";
  return cleaned;
}

function isNoiseLine(line: string) {
  if ([...stopWords].some((word) => line === word)) return true;
  if (/^(?:a\.?\s*c\.?\s*s\.?|acs)?\s*(?:reagent|grade|powder|crystalline|granular|pellets?|flakes?|anhydrous|hydrate)\s*$/i.test(line)) return true;
  if (/\b(?:lot|batch|exp|expiry|catalog|cat|product|prod|store|storage|temperature|information|www|only)\b/.test(line)) return true;
  if (/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/i.test(line) && !/[a-z]{4,}/i.test(line.replace(/\b(?:ml|kg|g|l)\b/gi, ""))) return true;
  return false;
}

function scoreCandidate(candidate: string) {
  const lower = candidate.toLowerCase();
  let score = 0;
  if (/^\d{2,7}-\d{2}-\d$/.test(lower)) score += 100;
  if (/\b(acid|alcohol|acetone|methanol|ethanol|hydroxide|chloride|sulfate|sulphate|nitrate|carbonate|phosphate|oxide|peroxide|serum|buffer|medium|solution)\b/.test(lower)) score += 35;
  if (/^[a-z][a-z\s,+-]+$/i.test(candidate)) score += 20;
  const wordCount = candidate.split(/\s+/).length;
  if (wordCount >= 2 && wordCount <= 5) score += 18;
  if (/\b(?:reagent|grade|powder|acs|a\.?\s*c\.?\s*s\.?|puriss?|certified)\b/i.test(candidate)) score -= 45;
  if (/[a-z]\d{3,}/i.test(candidate)) score -= 35;
  if (/[0-9]/.test(candidate) && !/^\d{2,7}-\d{2}-\d$/.test(lower)) score -= 15;
  if (/[a-z]{4,}/i.test(candidate)) score += 10;
  return score;
}

function chooseDisplayName(original: string, synonyms: string[]) {
  const simple = synonyms.find((synonym) => /^[a-zA-Z0-9\s,+-]+$/.test(synonym) && synonym.length <= 42);
  return simple ?? original;
}

function cleanResolverText(text: string | null) {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || /not found|page not found|resolver error/i.test(cleaned)) return null;
  return cleaned;
}

function titleCaseName(name: string) {
  return name.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function stableSyntheticId(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return Math.max(1, hash);
}

function findCas(synonyms: string[]) {
  return synonyms.find((synonym) => /^\d{2,7}-\d{2}-\d$/.test(synonym));
}

function inferPhysicalState(text: string): PhysicalState {
  const lower = text.toLowerCase();
  if (/\b(gas|compressed gas|anhydrous gas)\b/.test(lower)) return "Gas";
  if (/\b(solution|aqueous|acid|solvent|alcohol|ether|chloroform|acetone|methanol|ethanol|toluene|xylene|water)\b/.test(lower)) return "Liquid";
  if (/\b(chloride|sulfate|sulphate|hydroxide|carbonate|nitrate|phosphate|powder|crystal|solid|salt|pellets|granules)\b/.test(lower)) return "Solid";
  return "Unknown";
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "text/plain" } });
    if (!response.ok) return null;
    return cleanResolverText(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}
