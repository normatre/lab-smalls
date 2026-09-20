import type { DetectedChemical, PhysicalState, Unit } from "@/types/lab-smalls";
import { lookupPubChemFromText } from "@/services/pubChem";

export type ChemicalVisionService = {
  analyzeChemicalImage(image: File | Blob): Promise<{ items: DetectedChemical[]; warnings: string[] }>;
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
  manufacturer,
  catalogNumber,
  casNumber: cas,
  unNumber: un,
  confidence,
  sourceImage: "ocr-upload",
});

export class MockChemicalVisionService implements ChemicalVisionService {
  async analyzeChemicalImage(image: File | Blob): Promise<{ items: DetectedChemical[]; warnings: string[] }> {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const [profile, ocr] = await Promise.all([profileImage(image), readLabelText(image)]);
    const parsed = await parseLabelText(ocr.text);

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

async function readLabelText(image: File | Blob): Promise<{ text: string; confidence: number }> {
  if (image.size === 0 || typeof window === "undefined") return { text: "", confidence: 0 };
  let url: string | null = null;
  try {
    url = URL.createObjectURL(image);
    const { recognize } = await import("tesseract.js");
    const variants = await buildOcrVariants(image, url);
    const results = await Promise.all(
      variants.map(async (variant) => {
        try {
          const result = await recognize(variant, "eng");
          return { text: result.data.text ?? "", confidence: Number(result.data.confidence ?? 0) };
        } catch {
          return { text: "", confidence: 0 };
        }
      }),
    );
    const result = results.sort((a, b) => scoreOcrResult(b) - scoreOcrResult(a))[0] ?? { text: "", confidence: 0 };
    const combinedText = uniqueTextLines(results.map((item) => item.text).join("\n"));
    return {
      text: combinedText || result.text,
      confidence: result.confidence,
    };
  } catch {
    return { text: "", confidence: 0 };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

async function buildOcrVariants(image: File | Blob, objectUrl: string) {
  const variants = [objectUrl];
  if (typeof createImageBitmap === "undefined") return variants;
  try {
    const bitmap = await createImageBitmap(image);
    const crops = [
      { x: 0.08, y: 0.20, w: 0.84, h: 0.70 },
      { x: 0.18, y: 0.28, w: 0.64, h: 0.62 },
      { x: 0.23, y: 0.35, w: 0.54, h: 0.48 },
      { x: 0.12, y: 0.18, w: 0.76, h: 0.72 },
      { x: 0.20, y: 0.42, w: 0.60, h: 0.24 },
    ];
    for (const crop of crops) {
      variants.push(renderOcrVariant(bitmap, crop, "balanced"));
      variants.push(renderOcrVariant(bitmap, crop, "threshold"));
    }
  } catch {
    return variants;
  }
  return variants;
}

function renderOcrVariant(bitmap: ImageBitmap, crop: { x: number; y: number; w: number; h: number }, mode: "balanced" | "threshold") {
  const sourceX = Math.round(bitmap.width * crop.x);
  const sourceY = Math.round(bitmap.height * crop.y);
  const sourceW = Math.round(bitmap.width * crop.w);
  const sourceH = Math.round(bitmap.height * crop.h);
  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = sourceW * scale;
  canvas.height = sourceH * scale;
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
  const state = labProduct?.state ?? pubChem?.physicalState ?? reference?.state ?? inferStateFromWords(normalized);
  const cas = extractCas(normalized) ?? pubChem?.casNumber ?? reference?.cas ?? null;
  const un = extractUn(normalized) ?? reference?.un ?? null;
  const manufacturer = labProduct?.manufacturer ?? inferManufacturer(normalized) ?? (pubChem ? "PubChem" : undefined);
  const catalogNumber = extractCatalogNumber(normalized) ?? labProduct?.catalogNumbers[0] ?? (pubChem ? `PubChem CID ${pubChem.cid}` : null);
  const labelName = extractLikelyLabelName(text);
  const name = labProduct?.name ?? pubChem?.name ?? reference?.name ?? labelName;
  const confidence = scoreExtraction(Boolean(name), Boolean(size), Boolean(quantity), state !== "Unknown", Boolean(pubChem) || Boolean(labProduct));

  if (!name && !size) {
    return { item: null, warnings: [`OCR text read, but no known chemical name or size was confidently found: "${trimForWarning(text)}"`] };
  }

  return {
    warnings: [
      !reference && !pubChem && !labProduct ? "Chemical/product name was not matched to the built-in catalogues or PubChem." : "",
      labProduct ? `Matched lab product catalogue${catalogNumber ? ` (${catalogNumber})` : ""}.` : "",
      pubChem ? `Matched PubChem CID ${pubChem.cid}${pubChem.iupacName ? ` (${pubChem.iupacName})` : ""}.` : "",
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
      manufacturer,
      catalogNumber,
      cas,
      un,
      source: pubChem || reference ? "database" : "image",
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
      const score = text.includes(alias) ? alias.length : fuzzyTokenScore(text, alias);
      if (score > (best?.score ?? 0)) best = { reference, score };
    }
  }
  return best && best.score >= 5 ? best.reference : null;
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
  if (/\b(acid|alcohol|acetone|methanol|ethanol|hydroxide|chloride|sulfate|sulphate|nitrate|carbonate|phosphate|oxide|peroxide|serum|buffer|medium|solution)\b/.test(lower)) score += 40;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 6) score += 24;
  if (line === line.toUpperCase()) score += 12;
  if (/[a-zA-Z]{5,}/.test(line)) score += 12;
  if (/[0-9]/.test(line)) score -= 20;
  if (/\b(?:reagent|grade|powder|acs|a\.?\s*c\.?\s*s\.?|puriss?|certified)\b/i.test(line)) score -= 45;
  return score;
}

function titleCaseChemicalName(name: string) {
  return name.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function inferStateFromWords(text: string): PhysicalState {
  if (/\b(solution|liquid|solvent|acid|alcohol|aqueous|serum|medium|media|culture tested|sterile filtered)\b/.test(text)) return "Liquid";
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
