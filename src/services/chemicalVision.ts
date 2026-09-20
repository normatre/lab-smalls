import type { DetectedChemical, PhysicalState, Unit } from "@/types/lab-smalls";

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
  source?: FieldSource;
}): DetectedChemical => ({
  chemicalName: sourced(name, confidence, source),
  quantity: sourced(quantity, quantity ? Math.min(0.92, confidence + 0.08) : 0.35, quantity ? "label" : "image"),
  containerSize: sourced(size, size ? Math.min(0.92, confidence + 0.05) : 0.35, size ? "label" : "image"),
  unit: sourced(unit, unit ? Math.min(0.94, confidence + 0.06) : 0.35, unit ? "label" : "image"),
  physicalState: sourced(state, state === "Unknown" ? 0.3 : 0.86, state === "Unknown" ? "image" : "database"),
  manufacturer,
  catalogNumber: null,
  casNumber: cas,
  unNumber: un,
  confidence,
  sourceImage: "ocr-upload",
});

export class MockChemicalVisionService implements ChemicalVisionService {
  async analyzeChemicalImage(image: File | Blob): Promise<{ items: DetectedChemical[]; warnings: string[] }> {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const [profile, ocr] = await Promise.all([profileImage(image), readLabelText(image)]);
    const parsed = parseLabelText(ocr.text);

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
    const result = await recognize(url, "eng");
    return {
      text: result.data.text ?? "",
      confidence: Number(result.data.confidence ?? 0),
    };
  } catch {
    return { text: "", confidence: 0 };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function parseLabelText(text: string): { item: DetectedChemical | null; warnings: string[] } {
  const normalized = normalizeText(text);
  if (normalized.length < 8) return { item: null, warnings: ["No reliable label text was read. Try a closer, sharper photo of the label."] };

  const reference = findChemical(normalized);
  const size = extractSize(normalized);
  const quantity = extractQuantity(normalized);
  const state = reference?.state ?? inferStateFromWords(normalized);
  const cas = extractCas(normalized) ?? reference?.cas ?? null;
  const un = extractUn(normalized) ?? reference?.un ?? null;
  const manufacturer = inferManufacturer(normalized);
  const confidence = scoreExtraction(Boolean(reference), Boolean(size), Boolean(quantity), state !== "Unknown");

  if (!reference && !size) {
    return { item: null, warnings: [`OCR text read, but no known chemical name or size was confidently found: "${trimForWarning(text)}"`] };
  }

  return {
    warnings: [
      !reference ? "Chemical name was not matched to the built-in chemical catalogue." : "",
      !size ? "Container size was not found on the label." : "",
      state === "Unknown" ? "Physical state could not be inferred from label/catalogue." : "",
    ].filter(Boolean),
    item: detected({
      name: reference?.name ?? "UNKNOWN PRODUCT",
      quantity,
      size: size?.value ?? null,
      unit: size?.unit ?? null,
      state,
      confidence,
      manufacturer,
      cas,
      un,
      source: reference ? "label" : "image",
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

function inferStateFromWords(text: string): PhysicalState {
  if (/\b(solution|liquid|solvent|acid|alcohol|aqueous)\b/.test(text)) return "Liquid";
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

function scoreExtraction(hasName: boolean, hasSize: boolean, hasQuantity: boolean, hasState: boolean) {
  return Math.min(0.94, 0.34 + (hasName ? 0.28 : 0) + (hasSize ? 0.2 : 0) + (hasQuantity ? 0.06 : 0) + (hasState ? 0.06 : 0));
}

function trimForWarning(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 90);
}

function fallbackByBottleProfile(profile: VisionProfile, ocrText: string): { items: DetectedChemical[]; warnings: string[] } {
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
