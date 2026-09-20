import type { DetectedChemical, PhysicalState, Unit } from "@/types/lab-smalls";

export type ChemicalVisionService = {
  analyzeChemicalImage(image: File | Blob): Promise<{ items: DetectedChemical[]; warnings: string[] }>;
};

type VisionProfile = {
  aspectRatio: number;
  redDominance: number;
  darkDominance: number;
  estimatedBottleCount: number;
};

const sourced = <T,>(value: T | null, confidence: number, source: "label" | "database" | "image" | "inferred" = "label") => ({
  value,
  confidence,
  source,
});

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
  source?: "label" | "database" | "image" | "inferred";
}): DetectedChemical => ({
  chemicalName: sourced(name, confidence, source),
  quantity: sourced(quantity, confidence < 0.85 ? 0.72 : 0.9, "image"),
  containerSize: sourced(size, confidence < 0.85 ? 0.74 : 0.9, source),
  unit: sourced(unit, unit ? 0.9 : 0.35, source),
  physicalState: sourced(state, state === "Unknown" ? 0.3 : 0.82, state === "Unknown" ? "image" : "database"),
  manufacturer,
  catalogNumber: null,
  casNumber: cas,
  unNumber: un,
  confidence,
  sourceImage: "enhanced-mock-upload",
});

export class MockChemicalVisionService implements ChemicalVisionService {
  async analyzeChemicalImage(image: File | Blob): Promise<{ items: DetectedChemical[]; warnings: string[] }> {
    await new Promise((resolve) => setTimeout(resolve, 650));
    const profile = await profileImage(image);

    if (profile.estimatedBottleCount >= 3) {
      return {
        warnings: [
          `Detected approximately ${profile.estimatedBottleCount} lab reagent containers from bottle shape and red-cap pattern.`,
          "Label text is too small for reliable reading in this static demo; verify each chemical name before finalisation.",
        ],
        items: [
          detected({ name: "Acetone", quantity: 1, size: 500, unit: "mL", state: "Liquid", confidence: 0.78, cas: "67-64-1", un: "UN1090" }),
          detected({ name: "Methanol", quantity: 1, size: 500, unit: "mL", state: "Liquid", confidence: 0.72, cas: "67-56-1", un: "UN1230" }),
          detected({ name: "UNKNOWN MERCK REAGENT", quantity: Math.max(1, profile.estimatedBottleCount - 2), size: null, unit: null, state: "Unknown", confidence: 0.42, source: "image" }),
        ],
      };
    }

    if (profile.redDominance > 0.08 || profile.darkDominance > 0.14) {
      return {
        warnings: [
          "Detected one close-up Merck/Sigma-style reagent bottle with GHS hazard pictograms.",
          "Chemical name is partially readable at best; the extracted result is a candidate and must be reviewed.",
        ],
        items: [
          detected({
            name: "Sodium Hydroxide",
            quantity: 1,
            size: 100,
            unit: "g",
            state: "Solid",
            confidence: 0.68,
            cas: "1310-73-2",
            un: "UN1823",
          }),
        ],
      };
    }

    return {
      warnings: ["Image could not be confidently matched to a known lab reagent pattern. Manual review is required."],
      items: [
        detected({
          name: "UNKNOWN PRODUCT",
          quantity: null,
          size: null,
          unit: null,
          state: "Unknown",
          confidence: 0.22,
          manufacturer: undefined,
          source: "image",
        }),
      ],
    };
  }
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
