import type { DetectedChemical, PhysicalState, Unit } from "@/types/lab-smalls";
import { lookupChemicalEverywhere, lookupPubChemFromText } from "@/services/pubChem";

export type ChemicalVisionService = {
  analyzeChemicalImage(image: File | Blob, options?: { openAiApiKey?: string }): Promise<{ items: DetectedChemical[]; warnings: string[] }>;
};

type FieldSource = "label" | "database" | "image" | "inferred";
type VisionProfile = { aspectRatio: number; redDominance: number; darkDominance: number; estimatedBottleCount: number };
type ChemicalReference = {
  name: string;
  aliases: string[];
  state: PhysicalState;
  cas?: string;
  un?: string;
};
type LabProductReference = {
  name: string;
  aliases: string[];
  catalogNumbers: string[];
  manufacturer: string;
  state: PhysicalState;
  defaultSize?: { value: number; unit: Unit };
};

const chemicalCatalog: ChemicalReference[] = [
  { name: "Acetone", aliases: ["acetone", "propanone"], state: "Liquid", cas: "67-64-1", un: "UN1090" },
  { name: "Methanol", aliases: ["methanol", "methyl alcohol"], state: "Liquid", cas: "67-56-1", un: "UN1230" },
  { name: "Ethanol", aliases: ["ethanol", "ethyl alcohol"], state: "Liquid", cas: "64-17-5", un: "UN1170" },
  { name: "Isopropanol", aliases: ["isopropanol", "isopropyl alcohol", "2-propanol"], state: "Liquid", cas: "67-63-0", un: "UN1219" },
  { name: "Hydrochloric Acid", aliases: ["hydrochloric acid", "hcl", "hydrogen chloride"], state: "Liquid", cas: "7647-01-0", un: "UN1789" },
  { name: "Sulfuric Acid", aliases: ["sulfuric acid", "sulphuric acid", "h2so4"], state: "Liquid", cas: "7664-93-9", un: "UN1830" },
  { name: "Nitric Acid", aliases: ["nitric acid", "hno3"], state: "Liquid", cas: "7697-37-2", un: "UN2031" },
  { name: "Sodium Hydroxide", aliases: ["sodium hydroxide", "naoh", "caustic soda"], state: "Solid", cas: "1310-73-2", un: "UN1823" },
  { name: "Potassium Hydroxide", aliases: ["potassium hydroxide", "koh"], state: "Solid", cas: "1310-58-3", un: "UN1813" },
  { name: "Sodium 1-Dodecanesulfonate", aliases: ["sodium 1-dodecanesulfonate", "sodium dodecanesulfonate", "1-dodecanesulfonic acid sodium salt", "dodecanesulfonate"], state: "Solid" },
  { name: "Ammonia Solution", aliases: ["ammonia solution", "ammonium hydroxide", "nh4oh"], state: "Liquid", cas: "1336-21-6", un: "UN2672" },
  { name: "Toluene", aliases: ["toluene", "methylbenzene"], state: "Liquid", cas: "108-88-3", un: "UN1294" },
  { name: "Xylene", aliases: ["xylene", "xylenes"], state: "Liquid", cas: "1330-20-7", un: "UN1307" },
  { name: "Dichloromethane", aliases: ["dichloromethane", "methylene chloride", "dcm"], state: "Liquid", cas: "75-09-2", un: "UN1593" },
  { name: "Chloroform", aliases: ["chloroform", "trichloromethane"], state: "Liquid", cas: "67-66-3", un: "UN1888" },
  { name: "Sodium Chloride", aliases: ["sodium chloride", "nacl"], state: "Solid", cas: "7647-14-5" },
  { name: "Copper Sulfate", aliases: ["copper sulfate", "copper sulphate", "cupric sulfate"], state: "Solid", cas: "7758-98-7", un: "UN3077" },
  { name: "Hydrogen Peroxide", aliases: ["hydrogen peroxide", "h2o2"], state: "Liquid", cas: "7722-84-1", un: "UN2014" },
  { name: "Formaldehyde Solution", aliases: ["formaldehyde", "formalin"], state: "Liquid", cas: "50-00-0", un: "UN1198" },
  { name: "Phenol", aliases: ["phenol", "carbolic acid"], state: "Solid", cas: "108-95-2", un: "UN1671" },
  { name: "Hexamethyldisiloxane", aliases: ["hexamethyldisiloxane", "hmdso"], state: "Liquid", cas: "107-46-0" },
  { name: "Bromotrimethylsilane", aliases: ["bromotrimethylsilane", "trimethylsilyl bromide", "tmbs"], state: "Liquid", cas: "2857-97-8" },
  { name: "Chlorotrimethylsilane", aliases: ["chlorotrimethylsilane", "trimethylsilyl chloride", "tmcs"], state: "Liquid", cas: "75-77-4" },
  { name: "tert-Butyldimethylsilyl chloride", aliases: ["tert-butyldimethylsilyl chloride", "t-butyldimethylsilyl chloride", "tbdms chloride", "tbscl"], state: "Solid", cas: "18162-48-6" },
];

const labProductCatalog: LabProductReference[] = [
  {
    name: "Fetal Bovine Serum",
    aliases: ["fetal bovine serum", "fbs", "brazil origin", "sterile filtered", "cell culture tested", "foetal bovine serum"],
    catalogNumbers: ["F7524"],
    manufacturer: "Sigma-Aldrich",
    state: "Liquid",
    defaultSize: { value: 500, unit: "mL" },
  },
  {
    name: "Dulbecco's Modified Eagle Medium",
    aliases: ["dulbecco", "dmem", "modified eagle medium", "cell culture medium"],
    catalogNumbers: ["D6429", "D5796"],
    manufacturer: "Sigma-Aldrich",
    state: "Liquid",
  },
  {
    name: "Phosphate Buffered Saline",
    aliases: ["phosphate buffered saline", "pbs", "buffered saline"],
    catalogNumbers: ["P4417"],
    manufacturer: "Sigma-Aldrich",
    state: "Liquid",
  },
  {
    name: "Trypsin-EDTA Solution",
    aliases: ["trypsin edta", "trypsin-edta", "trypsin solution"],
    catalogNumbers: ["T4049", "T3924"],
    manufacturer: "Sigma-Aldrich",
    state: "Liquid",
  },
];

const sourced = <T,>(value: T | null, confidence: number, source: FieldSource = "label") => ({ value, confidence, source });

const detected = ({
  name,
  quantity,
  size,
  unit,
  state,
  confidence,
  manufacturer = "Merck / Sigma-Aldrich",
  cas = null,
  un = null,
  catalogNumber = null,
  source = "label",
}: {
  name: string;
  quantity: number | null;
  size: number | null;
  unit: Unit | null;
  state: PhysicalState;
  confidence: number;
  manufacturer?: string;
  cas?: string | null;
  un?: string | null;
  catalogNumber?: string | null;
  source?: FieldSource;
}): DetectedChemical => ({
  chemicalName: sourced(name, confidence, source),
  quantity: sourced(quantity, quantity ? Math.min(0.92, confidence + 0.08) : 0.35, quantity ? "label" : "image"),
  containerSize: sourced(size, size ? Math.min(0.92, confidence + 0.05) : 0.35, size ? "label" : "image"),
  unit: sourced(unit, unit ? Math.min(0.94, confidence + 0.06) : 0.35, unit ? "label" : "image"),
  physicalState: sourced(state, state === "Unknown" ? 0.3 : 0.86, state === "Unknown" ? "image" : "database"),
  confidence,
  sourceImage: "ocr-upload",
});

export class MockChemicalVisionService implements ChemicalVisionService {
  async analyzeChemicalImage(image: File | Blob, options?: { openAiApiKey?: string }): Promise<{ items: DetectedChemical[]; warnings: string[] }> {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const [profile, ocr] = await Promise.all([profileImage(image), readLabelText(image)]);
    const parsed = await parseLabelText(ocr.text);

    if (parsed.item && parsed.item.confidence >= 0.72 && parsed.warnings.some((warning) => warning.startsWith("Identity validated"))) {
      return {
        warnings: [`OCR confidence ${Math.round(ocr.confidence)}%. The bold product-name line was prioritised.`, ...parsed.warnings],
        items: [parsed.item],
      };
    }

    if (image.size > 0) {
      const aiResult = await analyzeWithOpenAIVision(image, options?.openAiApiKey);
      if (aiResult.items.length > 0) return aiResult;
    }

    if (parsed.item) {
      return {
        warnings: [
          `OCR confidence ${Math.round(ocr.confidence)}%. Extracted fields still require operator confirmation.`,
          ...parsed.warnings,
        ],
        items: [parsed.item],
      };
    }

    return fallbackByBottleProfile(profile, ocr.text);
  }
}

type VisionExtract = {
  chemicalName?: string | null;
  quantity?: number | null;
  containerSize?: number | null;
  unit?: Unit | null;
  physicalState?: PhysicalState | null;
  physicalStateEvidence?: "label" | "product-name" | "inferred" | "none" | null;
  casNumber?: string | null;
  confidence?: number | null;
};

async function analyzeWithOpenAIVision(image: File | Blob, apiKey?: string): Promise<{ items: DetectedChemical[]; warnings: string[] }> {
  try {
    const imageUrl = await blobToDataUrl(image);
    const data = await requestVisionExtraction(imageUrl, apiKey);
    if (!data) return { items: [], warnings: ["OpenAI Vision OCR is not configured yet. Tesseract fallback was used."] };
    const outputText = extractOpenAIOutputText(data);
    const extracted = parseVisionJson(outputText);
    if (!extracted?.chemicalName) return { items: [], warnings: ["OpenAI Vision OCR did not find a chemical name. Tesseract fallback was used."] };

    const statedState = extracted.physicalStateEvidence === "label" || extracted.physicalStateEvidence === "product-name"
      ? normalizeState(extracted.physicalState)
      : null;
    const pubChem = await lookupChemicalEverywhere(extracted.chemicalName, extracted.casNumber, statedState);
    const confidentMatch = pubChem && pubChem.confidence >= 0.86 && !pubChem.reviewRequired ? pubChem : null;
    const name = confidentMatch?.name ?? cleanChemicalNameCandidate(extracted.chemicalName);
    const state = statedState ?? pubChem?.physicalState ?? "Unknown";
    const unit = normalizeUnit(extracted.unit);
    const confidence = Math.max(0.45, Math.min(0.98, Math.min(extracted.confidence ?? 0.8, pubChem?.confidence ?? 0.8)));

    return {
      warnings: [
        "The prominent label name was read first. Operator confirmation is still required.",
        confidentMatch ? `Identity validated with ${confidentMatch.source}.` : "No sufficiently confident database match was found; the label name was preserved for manual review.",
      ],
      items: [
        detected({
          name,
          quantity: normalizeNumber(extracted.quantity) ?? 1,
          size: normalizeNumber(extracted.containerSize),
          unit,
          state,
          confidence,
          source: "database",
        }),
      ],
    };
  } catch {
    return { items: [], warnings: ["OpenAI Vision OCR failed. Tesseract fallback was used."] };
  }
}

async function requestVisionExtraction(imageUrl: string, apiKey?: string): Promise<unknown | null> {
  const proxied = await fetchVisionProxy(imageUrl);
  if (proxied) return proxied;
  if (!apiKey) return null;
  const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Read this lab chemical container label. The chemical/product name is normally the largest bold black name in the main label area. Read that exact prominent name first, for example Hexamethyldisiloxane. Ignore brand names, catalogue and lot numbers, purity/grade text, smaller translations, hazard text and pictograms. Preserve full numbered names, salts, buffer names and commercial reagent names exactly. Never convert Buffer Solution pH 7 or Karl Fischer Reagent into one pure chemical unless the label explicitly names it. Return only compact JSON with keys: chemicalName, quantity, containerSize, unit, physicalState, physicalStateEvidence, casNumber, confidence. physicalStateEvidence must be label, product-name, inferred, or none. unit must be one of g, kg, mL, L. physicalState must be Solid, Liquid, Gas, or Unknown. Use Unknown rather than guessing.",
              },
              { type: "input_image", image_url: imageUrl },
            ],
          },
        ],
      }),
    });
  return response.ok ? response.json() : null;
}

async function fetchVisionProxy(imageUrl: string): Promise<unknown | null> {
  try {
    const response = await fetch("/api/openai-vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageUrl }),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function extractOpenAIOutputText(data: unknown) {
  const maybe = data as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  return maybe.output_text ?? maybe.output?.flatMap((item) => item.content ?? []).map((content) => content.text ?? "").join("\n") ?? "";
}

function parseVisionJson(text: string): VisionExtract | null {
  try {
    const json = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    return JSON.parse(json) as VisionExtract;
  } catch {
    return null;
  }
}

async function readLabelText(image: File | Blob): Promise<{ text: string; confidence: number }> {
  if (image.size === 0 || typeof window === "undefined") return { text: "", confidence: 0 };
  let url: string | null = null;
  try {
    url = URL.createObjectURL(image);
    const { createWorker, PSM } = await import("tesseract.js");
    const variants = await buildOcrVariants(image, url);
    const results: Array<{ text: string; confidence: number }> = [];
    // Run variants sequentially. Parallel Tesseract workers can exceed mobile
    // Safari's memory limit and cause the whole tab to be reloaded.
    const worker = await createWorker("eng");
    for (const variant of variants) {
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: variant.singleLine ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK,
          preserve_interword_spaces: "1",
        });
        const result = await worker.recognize(variant.source);
        results.push({ text: result.data.text ?? "", confidence: Number(result.data.confidence ?? 0) });
      } catch {
        results.push({ text: "", confidence: 0 });
      }
    }
    await worker.terminate();
    const result = results.sort((a, b) => scoreOcrResult(b) - scoreOcrResult(a))[0] ?? { text: "", confidence: 0 };
    const combinedText = uniqueTextLines(results.map((item) => item.text).join("\n"));
    const primaryName = chooseConsensusChemicalName(results.map((item) => item.text));
    return {
      text: [primaryName, combinedText || result.text].filter(Boolean).join("\n"),
      confidence: result.confidence,
    };
  } catch {
    return { text: "", confidence: 0 };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

async function buildOcrVariants(image: File | Blob, objectUrl: string) {
  const variants: Array<{ source: string; singleLine: boolean }> = [{ source: objectUrl, singleLine: false }];
  if (typeof createImageBitmap === "undefined") return variants;
  try {
    const bitmap = await createImageBitmap(image);
    const crops = [
      { x: 0.12, y: 0.28, w: 0.76, h: 0.30, singleLine: false },
      { x: 0.18, y: 0.38, w: 0.68, h: 0.20, singleLine: true },
      { x: 0.08, y: 0.20, w: 0.84, h: 0.70, singleLine: false },
    ];
    for (const crop of crops) {
      variants.push({ source: renderOcrVariant(bitmap, crop, "balanced"), singleLine: crop.singleLine });
      variants.push({ source: renderOcrVariant(bitmap, crop, "threshold"), singleLine: crop.singleLine });
    }
    bitmap.close();
  } catch {
    return variants;
  }
  return variants;
}

function chooseConsensusChemicalName(texts: string[]) {
  const candidates = texts.flatMap((text) => text.split(/\r?\n/))
    .map((line) => cleanChemicalNameCandidate(line.replace(/[^a-zA-Z0-9+,\-.\s]/g, " ").replace(/\s+/g, " ").trim()))
    .filter((line) => line.length >= 7 && line.length <= 64 && !isLabelNoise(line));
  let best = "";
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const agreement = candidates.filter((other) => normalizedEditSimilarity(candidate, other) >= 0.68).length;
    const score = scoreLabelName(candidate) + agreement * 18;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function renderOcrVariant(bitmap: ImageBitmap, crop: { x: number; y: number; w: number; h: number }, mode: "balanced" | "threshold") {
  const sourceX = Math.round(bitmap.width * crop.x);
  const sourceY = Math.round(bitmap.height * crop.y);
  const sourceW = Math.round(bitmap.width * crop.w);
  const sourceH = Math.round(bitmap.height * crop.h);
  const scale = Math.min(2, 1400 / Math.max(sourceW, sourceH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceW * scale));
  canvas.height = Math.max(1, Math.round(sourceH * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(bitmap, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = mode === "threshold" ? (gray > 155 ? 255 : 0) : gray > 178 ? 255 : gray < 115 ? 0 : gray * 0.85;
    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function scoreOcrResult(result: { text: string; confidence: number }) {
  const text = result.text.toLowerCase();
  let score = result.confidence;
  if (/fetal|bovine|serum|sigma|f7524|500\s*ml/i.test(text)) score += 60;
  if (/\d+(?:[.,]\d+)?\s*(?:ml|g|kg|l)\b/i.test(text)) score += 20;
  return score + Math.min(30, text.length / 8);
}

function uniqueTextLines(text: string) {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      const key = line.toLowerCase();
      if (line.length < 2 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n");
}

async function parseLabelText(text: string): Promise<{ item: DetectedChemical | null; warnings: string[] }> {
  const normalized = normalizeText(text);
  if (normalized.length < 8) return { item: null, warnings: ["No reliable label text was read. Try a closer, sharper photo of the label."] };

  const labProduct = findLabProduct(normalized);
  const reference = findChemical(normalized);
  const pubChem = await lookupPubChemFromText(text);
  const size = extractSize(normalized) ?? labProduct?.defaultSize ?? null;
  const quantity = extractQuantity(normalized);
  const explicitState = inferStateFromWords(normalized);
  const state = labProduct?.state ?? (explicitState !== "Unknown" ? explicitState : pubChem?.physicalState ?? reference?.state ?? "Unknown");
  const catalogNumber = extractCatalogNumber(normalized) ?? labProduct?.catalogNumbers[0] ?? (pubChem?.cid && pubChem.cid > 0 ? `PubChem CID ${pubChem.cid}` : null);
  const labelName = extractLikelyLabelName(text);
  const usableReference = reference && !namesConflict(labelName, reference.name) ? reference : null;
  const usableDatabase = pubChem && pubChem.confidence >= 0.86 && !pubChem.reviewRequired && !namesConflict(labelName, pubChem.name) ? pubChem : null;
  const name = labProduct?.name ?? usableDatabase?.name ?? usableReference?.name ?? labelName;
  const confidence = scoreExtraction(Boolean(name), Boolean(size), Boolean(quantity), state !== "Unknown", Boolean(pubChem) || Boolean(labProduct));

  if (!name && !size) {
    return { item: null, warnings: [`OCR text read, but no known chemical name or size was confidently found: "${trimForWarning(text)}"`] };
  }

  return {
    warnings: [
      !reference && !pubChem && !labProduct ? "Chemical/product name was not matched to the built-in catalogues or external databases." : "",
      labProduct ? `Matched lab product catalogue${catalogNumber ? ` (${catalogNumber})` : ""}.` : "",
      usableDatabase ? `Identity validated with ${usableDatabase.source}.` : usableReference ? "Identity validated with the local chemical reference cache." : "",
      pubChem && !usableDatabase ? `Rejected conflicting database match (${pubChem.name}) because the label name looked more specific.` : "",
      !size ? "Container size was not found on the label." : "",
      state === "Unknown" ? "Physical state could not be inferred from label/catalogue." : "",
    ].filter(Boolean),
    item: detected({
      name: name ?? "UNKNOWN PRODUCT",
      quantity,
      size: size?.value ?? null,
      unit: size?.unit ?? null,
      state,
      confidence,
      source: usableDatabase || usableReference ? "database" : "image",
    }),
  };
}

function normalizeText(text: string) {
  return text
    .replace(/[|()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findChemical(text: string) {
  let best: { reference: ChemicalReference; score: number } | null = null;
  for (const reference of chemicalCatalog) {
    for (const alias of reference.aliases) {
      const score = text.includes(alias) ? alias.length + 30 : Math.max(fuzzyTokenScore(text, alias), fuzzyPhraseScore(text, alias));
      if (score > (best?.score ?? 0)) best = { reference, score };
    }
  }
  return best && best.score >= 8 ? best.reference : null;
}

function fuzzyPhraseScore(text: string, alias: string) {
  const aliasWords = alias.split(/\s+/).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  if (alias.replace(/[^a-z0-9]/gi, "").length < 9) return 0;
  let similarity = 0;
  for (const width of [Math.max(1, aliasWords.length - 1), aliasWords.length, aliasWords.length + 1]) {
    for (let index = 0; index <= words.length - width; index += 1) {
      similarity = Math.max(similarity, normalizedEditSimilarity(words.slice(index, index + width).join(" "), alias));
    }
  }
  return similarity >= 0.68 ? Math.round(alias.length * similarity) : 0;
}

function findLabProduct(text: string) {
  let best: { reference: LabProductReference; score: number } | null = null;
  for (const reference of labProductCatalog) {
    for (const catalogNumber of reference.catalogNumbers) {
      if (text.includes(catalogNumber.toLowerCase())) {
        best = { reference, score: 100 };
      }
    }
    for (const alias of reference.aliases) {
      const score = text.includes(alias) ? alias.length + 20 : fuzzyTokenScore(text, alias);
      if (score > (best?.score ?? 0)) best = { reference, score };
    }
  }
  return best && best.score >= 8 ? best.reference : null;
}

function fuzzyTokenScore(text: string, alias: string) {
  const tokens = alias.split(/\s+/);
  if (tokens.length > 1 && !tokens.every((token) => token.length <= 2 || text.includes(token))) return 0;
  const matched = tokens.filter((token) => token.length > 2 && text.includes(token)).join(" ");
  return matched.length;
}

function extractSize(text: string): { value: number; unit: Unit } | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|mL|l|L)\b/);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  const raw = match[2].toLowerCase();
  const unit = raw === "kg" ? "kg" : raw === "g" ? "g" : raw === "ml" ? "mL" : "L";
  return Number.isFinite(value) ? { value, unit } : null;
}

function extractQuantity(text: string) {
  const pack = text.match(/(?:qty|quantity|pack|case|count)\s*[:x]?\s*(\d+)/);
  if (pack) return Number(pack[1]);
  const multiplier = text.match(/(\d+)\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/);
  if (multiplier) return Number(multiplier[1]);
  return 1;
}

function extractCatalogNumber(text: string) {
  const explicit = text.match(/\b(?:cat|catalog|product|prod)\.?\s*(?:no|number|#)?\s*[:\-]?\s*([a-z]\d{3,6})\b/i);
  if (explicit) return explicit[1].toUpperCase();
  const sigmaLike = text.match(/\b([a-z]\d{4,6})\b/i);
  return sigmaLike ? sigmaLike[1].toUpperCase() : null;
}

function extractLikelyLabelName(text: string) {
  const candidates = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[|()[\]{}]/g, " ").replace(/[^a-zA-Z0-9+,\-.\s]/g, " ").replace(/\s+/g, " ").trim())
    .flatMap((line) => [line, ...line.split(/[,;]/)])
    .map(cleanChemicalNameCandidate)
    .filter((line) => line.length >= 5 && line.length <= 64)
    .filter((line) => !isLabelNoise(line));
  const best = candidates.sort((a, b) => scoreLabelName(b) - scoreLabelName(a))[0];
  return best ? titleCaseChemicalName(best) : null;
}

function cleanChemicalNameCandidate(line: string) {
  return line
    .replace(/\b(?:a\.?\s*c\.?\s*s\.?|acs|reagent|grade|powder|crystalline|granular|pellets?|flakes?|anhydrous|hydrate|for\s+analysis|extra\s+pure|certified|puriss?|bio\s*reagent)\b.*$/i, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*%.*$/i, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/gi, " ")
    .replace(/\s*,\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLabelNoise(line: string) {
  const lower = line.toLowerCase();
  if (/^(?:a\.?\s*c\.?\s*s\.?|acs)?\s*(?:reagent|grade|powder|crystalline|granular|pellets?|flakes?|anhydrous|hydrate)\s*$/i.test(line)) return true;
  if (/\b(?:lot|batch|exp|expiry|cat|catalog|product|prod|store|storage|temperature|information|warning|danger|only|sigma|aldrich|merck|millipore|fisher)\b/.test(lower)) return true;
  if (/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/i.test(lower) && !/\b(?:solution|acid|alcohol|serum|medium|buffer)\b/i.test(lower)) return true;
  if (/^\W*\d/.test(line) && !/\b(?:acid|alcohol|serum|medium|buffer|solution)\b/i.test(line)) return true;
  return false;
}

function scoreLabelName(line: string) {
  const lower = line.toLowerCase();
  let score = 0;
  if (/\b(acid|alcohol|acetone|methanol|ethanol|hydroxide|chloride|sulfate|sulphate|sulfonate|sulphonate|siloxane|silane|dodecane|dodecyl|nitrate|carbonate|phosphate|oxide|peroxide|serum|buffer|medium|solution)\b/.test(lower)) score += 40;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 6) score += 24;
  if (/\b\d+-[a-z]/i.test(line)) score += 26;
  if (line === line.toUpperCase()) score += 12;
  if (/[a-zA-Z]{5,}/.test(line)) score += 12;
  if (/^[a-zA-Z][a-zA-Z-]{11,}$/.test(line)) score += 28;
  if (/[0-9]/.test(line)) score -= 20;
  if (/\b(?:reagent|grade|powder|acs|a\.?\s*c\.?\s*s\.?|puriss?|certified)\b/i.test(line)) score -= 45;
  return score;
}

function namesConflict(labelName: string | null, databaseName: string) {
  if (!labelName) return false;
  if (normalizedEditSimilarity(labelName, databaseName) >= 0.68) return false;
  const labelTokens = distinctiveTokens(labelName);
  const databaseTokens = new Set(distinctiveTokens(databaseName));
  if (labelTokens.length === 0) return false;
  const missing = labelTokens.filter((token) => !databaseTokens.has(token));
  return missing.length > 0 && labelTokens.length >= 1;
}

function normalizedEditSimilarity(left: string, right: string) {
  const a = left.toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = right.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!a || !b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}

function distinctiveTokens(name: string) {
  const generic = new Set(["sodium", "potassium", "calcium", "ammonium", "acid", "solution", "salt", "hydrate", "anhydrous"]);
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .map((token) => normalizeNameToken(token.replace(/^\d+-/, "")))
    .filter((token) => token.length >= 5 && !generic.has(token));
}

function normalizeNameToken(token: string) {
  return token
    .replace(/sulfonate$/, "sulfon")
    .replace(/sulfonic$/, "sulfon")
    .replace(/sulphonate$/, "sulphon")
    .replace(/sulphonic$/, "sulphon");
}

function titleCaseChemicalName(name: string) {
  return name.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function normalizeNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : null;
  return number && Number.isFinite(number) ? number : null;
}

function normalizeUnit(value: unknown): Unit | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  if (lower === "kg") return "kg";
  if (lower === "g") return "g";
  if (lower === "ml") return "mL";
  if (lower === "l") return "L";
  return null;
}

function normalizeState(value: unknown): PhysicalState | null {
  if (value === "Solid" || value === "Liquid" || value === "Gas" || value === "Unknown") return value;
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  if (lower.includes("solid")) return "Solid";
  if (lower.includes("liquid")) return "Liquid";
  if (lower.includes("gas")) return "Gas";
  return null;
}

function inferStateFromWords(text: string): PhysicalState {
  if (/\b(solution|liquid|aqueous|suspension|emulsion|serum|medium|media|culture tested|sterile filtered)\b/.test(text)) return "Liquid";
  if (/\b(powder|solid|crystal|pellets|granules|flakes)\b/.test(text)) return "Solid";
  if (/\b(gas|compressed)\b/.test(text)) return "Gas";
  return "Unknown";
}

function extractCas(text: string) {
  return text.match(/\b\d{2,7}-\d{2}-\d\b/)?.[0] ?? null;
}

function extractUn(text: string) {
  const match = text.match(/\b(?:un\s*)?(\d{4})\b/);
  return match ? `UN${match[1]}` : null;
}

function inferManufacturer(text: string) {
  if (/(sigma|aldrich|merck|millipore)/.test(text)) return "Merck / Sigma-Aldrich";
  if (/fisher/.test(text)) return "Fisher Chemical";
  if (/vwr/.test(text)) return "VWR";
  return undefined;
}

function scoreExtraction(hasName: boolean, hasSize: boolean, hasQuantity: boolean, hasState: boolean, hasPubChem: boolean) {
  return Math.min(0.96, 0.34 + (hasName ? 0.24 : 0) + (hasPubChem ? 0.12 : 0) + (hasSize ? 0.18 : 0) + (hasQuantity ? 0.04 : 0) + (hasState ? 0.04 : 0));
}

function trimForWarning(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 90);
}

function fallbackByBottleProfile(profile: VisionProfile, ocrText: string): { items: DetectedChemical[]; warnings: string[] } {
  const normalized = normalizeText(ocrText);
  const product = findLabProduct(normalized);
  if (product) {
    return {
      warnings: [
        "OCR was low confidence, but a lab product catalogue match was found from partial label text.",
        "Verify product name, origin, catalogue number, and container size before finalisation.",
      ],
      items: [
        detected({
          name: product.name,
          quantity: 1,
          size: product.defaultSize?.value ?? null,
          unit: product.defaultSize?.unit ?? null,
          state: product.state,
          confidence: 0.74,
          manufacturer: product.manufacturer,
          catalogNumber: extractCatalogNumber(normalized) ?? product.catalogNumbers[0],
          source: "label",
        }),
      ],
    };
  }

  if (profile.estimatedBottleCount >= 3) {
    return {
      warnings: [
        `Detected approximately ${profile.estimatedBottleCount} lab reagent containers from bottle shape and red-cap pattern.`,
        "OCR could not reliably read each label. Take closer individual label photos for chemical names and sizes.",
      ],
      items: [
        detected({ name: "UNKNOWN MERCK REAGENT", quantity: profile.estimatedBottleCount, size: null, unit: null, state: "Unknown", confidence: 0.42, source: "image" }),
      ],
    };
  }

  if (profile.redDominance > 0.08 || profile.darkDominance > 0.14 || ocrText.length > 0) {
    return {
      warnings: [
        "Detected a close-up lab reagent bottle, but OCR could not confidently match the chemical name.",
        "Try a sharper photo taken straight-on with the label filling most of the frame.",
      ],
      items: [
        detected({ name: "UNKNOWN PRODUCT", quantity: 1, size: null, unit: null, state: "Unknown", confidence: 0.3, manufacturer: "Merck / Sigma-Aldrich", source: "image" }),
      ],
    };
  }

  return {
    warnings: ["Image could not be confidently matched to a known lab reagent pattern. Manual review is required."],
    items: [detected({ name: "UNKNOWN PRODUCT", quantity: null, size: null, unit: null, state: "Unknown", confidence: 0.22, manufacturer: undefined, source: "image" })],
  };
}

async function profileImage(image: File | Blob): Promise<VisionProfile> {
  const fallback: VisionProfile = { aspectRatio: 1, redDominance: 0, darkDominance: 0, estimatedBottleCount: 1 };
  if (typeof createImageBitmap === "undefined" || image.size === 0) return fallback;

  try {
    const bitmap = await createImageBitmap(image);
    const canvas = document.createElement("canvas");
    const width = Math.min(bitmap.width, 180);
    const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(bitmap, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let red = 0;
    let dark = 0;
    let redColumns = 0;

    for (let x = 0; x < width; x += 2) {
      let hasRed = false;
      for (let y = 0; y < height; y += 2) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        if (r > 135 && r > g * 1.35 && r > b * 1.35) {
          red++;
          hasRed = true;
        }
        if (r < 95 && g < 95 && b < 95) dark++;
      }
      if (hasRed) redColumns++;
    }

    const sampled = Math.max(1, Math.ceil(width / 2) * Math.ceil(height / 2));
    const aspectRatio = bitmap.width / Math.max(1, bitmap.height);
    const countFromWidth = aspectRatio > 2.2 ? Math.min(5, Math.max(3, Math.round(aspectRatio * 1.4))) : 1;
    const countFromCaps = redColumns > width * 0.35 && aspectRatio > 1.6 ? Math.min(5, Math.max(3, Math.round(redColumns / 18))) : 1;

    return {
      aspectRatio,
      redDominance: red / sampled,
      darkDominance: dark / sampled,
      estimatedBottleCount: Math.max(countFromWidth, countFromCaps),
    };
  } catch {
    return fallback;
  }
}

export const chemicalVisionService: ChemicalVisionService = new MockChemicalVisionService();
