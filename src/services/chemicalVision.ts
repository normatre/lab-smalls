import type { DetectedChemical } from "@/types/lab-smalls";

export type ChemicalVisionService = {
  analyzeChemicalImage(image: File | Blob): Promise<{ items: DetectedChemical[]; warnings: string[] }>;
};

const sourced = <T,>(value: T | null, confidence: number, source: "label" | "database" | "image" | "inferred" = "label") => ({
  value,
  confidence,
  source,
});

export class MockChemicalVisionService implements ChemicalVisionService {
  async analyzeChemicalImage(): Promise<{ items: DetectedChemical[]; warnings: string[] }> {
    await new Promise((resolve) => setTimeout(resolve, 650));

    return {
      warnings: ["Mock extraction used. Operator confirmation is required before finalisation."],
      items: [
        {
          chemicalName: sourced("Acetone", 0.94),
          quantity: sourced(2, 0.88, "image"),
          containerSize: sourced(2.5, 0.96),
          unit: sourced("L", 0.99),
          physicalState: sourced("Liquid", 0.82, "database"),
          manufacturer: "Sigma-Aldrich",
          catalogNumber: null,
          casNumber: "67-64-1",
          unNumber: "UN1090",
          confidence: 0.92,
          sourceImage: "mock-upload",
        },
        {
          chemicalName: sourced("UNKNOWN PRODUCT", 0.25, "image"),
          quantity: sourced(null, 0.2, "image"),
          containerSize: sourced(null, 0.2, "image"),
          unit: sourced(null, 0.2, "image"),
          physicalState: sourced("Unknown", 0.2, "image"),
          manufacturer: undefined,
          catalogNumber: null,
          casNumber: null,
          unNumber: null,
          confidence: 0.22,
          sourceImage: "mock-upload",
        },
      ],
    };
  }
}

export const chemicalVisionService: ChemicalVisionService = new MockChemicalVisionService();
