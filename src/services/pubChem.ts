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

function buildNameCandidates(rawText: string) {
  const cleanedLines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/[^a-zA-Z0-9+,\-.\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && line.length <= 80);

  const candidates = new Set<string>();

  for (const line of cleanedLines) {
    const lower = line.toLowerCase();
    if ([...stopWords].some((word) => lower === word)) continue;
    if (/\b\d{2,7}-\d{2}-\d\b/.test(lower)) continue;
    if (/\b(?:un\s*)?\d{4}\b/.test(lower)) continue;
    if (/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/i.test(lower)) continue;
    candidates.add(line);
  }

  const words = rawText
    .toLowerCase()
    .replace(/[^a-z0-9+\-\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word));

  for (let size = 4; size >= 1; size--) {
    for (let index = 0; index <= words.length - size; index++) {
      const phrase = words.slice(index, index + size).join(" ");
      if (phrase.length >= 4) candidates.add(phrase);
      if (candidates.size >= 18) break;
    }
    if (candidates.size >= 18) break;
  }

  return [...candidates].slice(0, 18);
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
