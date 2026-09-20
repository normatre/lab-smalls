import type { PhysicalState } from "@/types/lab-smalls";

export type PubChemMatch = {
  cid: number;
  name: string;
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
]);

export async function lookupPubChemFromText(rawText: string): Promise<PubChemMatch | null> {
  const candidates = buildNameCandidates(rawText);
  for (const candidate of candidates) {
    const match = await lookupPubChemName(candidate);
    if (match) return match;
  }
  return null;
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
  const direct = await lookupPubChemName(query);
  if (direct) return [direct];

  const candidates = buildNameCandidates(query);
  const results: PubChemMatch[] = [];
  for (const candidate of candidates) {
    const match = await lookupPubChemName(candidate);
    if (match && !results.some((item) => item.cid === match.cid)) results.push(match);
    if (results.length >= 6) break;
  }
  return results;
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
    .replace(/\b(?:cat|catalog|product|prod|lot|batch|exp|expiry|store|storage)\b.*$/i, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/gi, " ")
    .replace(/\b(?:un\s*)?\d{4}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 4 || cleaned.length > 64) return "";
  if (isNoiseLine(cleaned.toLowerCase())) return "";
  return cleaned;
}

function isNoiseLine(line: string) {
  if ([...stopWords].some((word) => line === word)) return true;
  if (/\b(?:lot|batch|exp|expiry|catalog|cat|product|prod|store|storage|temperature|information|www|only)\b/.test(line)) return true;
  if (/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/i.test(line) && !/[a-z]{4,}/i.test(line.replace(/\b(?:ml|kg|g|l)\b/gi, ""))) return true;
  return false;
}

function scoreCandidate(candidate: string) {
  const lower = candidate.toLowerCase();
  let score = 0;
  if (/^\d{2,7}-\d{2}-\d$/.test(lower)) score += 100;
  if (/\b(acid|alcohol|acetone|methanol|ethanol|hydroxide|chloride|sulfate|sulphate|nitrate|serum|buffer|medium|solution)\b/.test(lower)) score += 35;
  if (/^[a-z][a-z\s,+-]+$/i.test(candidate)) score += 20;
  const wordCount = candidate.split(/\s+/).length;
  if (wordCount >= 2 && wordCount <= 5) score += 18;
  if (/[a-z]\d{3,}/i.test(candidate)) score -= 35;
  if (/[0-9]/.test(candidate) && !/^\d{2,7}-\d{2}-\d$/.test(lower)) score -= 15;
  if (/[a-z]{4,}/i.test(candidate)) score += 10;
  return score;
}

function chooseDisplayName(original: string, synonyms: string[]) {
  const simple = synonyms.find((synonym) => /^[a-zA-Z0-9\s,+-]+$/.test(synonym) && synonym.length <= 42);
  return simple ?? original;
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
  const timeout = window.setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeout);
  }
}
