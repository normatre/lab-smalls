import type { OcrCategories, PhysicalState } from "@/types/lab-smalls";

export type PubChemMatch = {
  cid: number;
  name: string;
  source: string;
  synonyms: string[];
  physicalState: PhysicalState;
  confidence: number;
  reviewRequired: boolean;
  categories?: OcrCategories;
};

type ChemicalLookupResponse = {
  name: string;
  source: string;
  physicalState: PhysicalState;
  confidence: number;
  reviewRequired: boolean;
  categories?: OcrCategories;
};

type CachedLookup = ChemicalLookupResponse & {
  normalizedName: string;
  originalSearchTerm: string;
  lastVerified: string;
};

const cacheKey = "lab-smalls-chemical-cache-v1";
const cacheTtl = 90 * 24 * 60 * 60 * 1000;

export async function lookupPubChemFromText(rawText: string): Promise<PubChemMatch | null> {
  return lookupChemicalFromOcr(rawText);
}

export async function lookupChemicalFromOcr(
  rawText: string,
  hints?: { name?: string | null; catalogNumber?: string | null; casNumber?: string | null; labelState?: PhysicalState | null; manufacturer?: string | null },
): Promise<PubChemMatch | null> {
  try {
    const response = await fetch("/api/resolve-ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ocrText: rawText, ...hints }),
    });
    if (!response.ok) return null;
    const result = (await response.json()) as ChemicalLookupResponse;
    if (!result?.name) return null;
    return toPublicMatch(result);
  } catch {
    return null;
  }
}

export async function lookupChemicalEverywhere(
  name: string,
  casNumber?: string | null,
  labelState?: PhysicalState | null,
): Promise<PubChemMatch | null> {
  const searchTerm = name.trim();
  if (!searchTerm) return null;
  const normalizedName = normalizeName(searchTerm);
  const cached = readCache().find((entry) => entry.normalizedName === normalizedName && Date.now() - Date.parse(entry.lastVerified) < cacheTtl);
  if (cached) return toPublicMatch(cached);

  try {
    const response = await fetch("/api/chemical-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: searchTerm, casNumber: casNumber || undefined, labelState: labelState && labelState !== "Unknown" ? labelState : undefined }),
    });
    if (!response.ok) return null;
    const result = (await response.json()) as ChemicalLookupResponse;
    if (!result?.name) return null;
    writeCache({ ...result, normalizedName, originalSearchTerm: searchTerm, lastVerified: new Date().toISOString() });
    return toPublicMatch(result);
  } catch {
    return null;
  }
}

export async function lookupPubChemName(name: string): Promise<PubChemMatch | null> {
  return lookupChemicalEverywhere(name);
}

export async function searchPubChem(query: string): Promise<PubChemMatch[]> {
  const match = await lookupChemicalEverywhere(query);
  return match ? [match] : [];
}

function toPublicMatch(result: ChemicalLookupResponse): PubChemMatch {
  return {
    cid: -1,
    name: result.name,
    source: result.source,
    synonyms: [],
    physicalState: result.physicalState,
    confidence: result.confidence,
    reviewRequired: result.reviewRequired,
    categories: result.categories,
  };
}

function readCache(): CachedLookup[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey) ?? "[]") as CachedLookup[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(entry: CachedLookup) {
  if (typeof window === "undefined") return;
  try {
    const remaining = readCache().filter((item) => item.normalizedName !== entry.normalizedName).slice(0, 199);
    localStorage.setItem(cacheKey, JSON.stringify([entry, ...remaining]));
  } catch {
    // A lookup still succeeds when private browsing or storage limits prevent caching.
  }
}

function buildNameCandidates(rawText: string) {
  const lines = rawText
    .split(/\r?\n/)
    .map(cleanCandidate)
    .filter((candidate): candidate is string => Boolean(candidate));
  const fragments = lines.flatMap((line) => {
    const words = line.split(/\s+/).filter(Boolean);
    return [
      ...line.split(/[,;]/).map(cleanCandidate),
      ...words,
      ...words.slice(0, -1).map((_, index) => words.slice(index, index + 2).join(" ")),
      ...words.slice(0, -2).map((_, index) => words.slice(index, index + 3).join(" ")),
    ].filter((candidate): candidate is string => Boolean(candidate) && candidate.length >= 6);
  });
  const cas = extractCas(rawText);
  const unique = [...new Set([cas, ...lines, ...fragments].filter((candidate): candidate is string => Boolean(candidate)))];
  return unique.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
}

function cleanCandidate(value: string) {
  const candidate = value
    .replace(/[|()[\]{}]/g, " ")
    .replace(/\b(?:lot|batch|exp|expiry|catalog|cat|store|storage)\b.*$/i, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return candidate.length >= 4 && candidate.length <= 80 ? candidate : "";
}

function scoreCandidate(candidate: string) {
  let score = /^\d{2,7}-\d{2}-\d$/.test(candidate) ? 100 : 0;
  if (/\b(acid|alcohol|acetone|hydroxide|chloride|bromide|sulfate|sulphate|silane|siloxane|solution|buffer|reagent|medium)\b/i.test(candidate)) score += 35;
  if (/^[a-z][a-z-]{11,}$/i.test(candidate)) score += 30;
  if (candidate.split(/\s+/).length >= 2) score += 15;
  return score;
}

function extractCas(value: string) {
  return value.match(/\b\d{2,7}-\d{2}-\d\b/)?.[0] ?? null;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
