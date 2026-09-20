import type { Drum, InventoryItem } from "@/types/lab-smalls";

export const confidenceNeedsReview = (confidence: number) => confidence < 0.85;

export function itemBlocksCompletion(item: InventoryItem) {
  const requiredMissing =
    !item.chemicalName.value ||
    item.chemicalName.value === "UNKNOWN PRODUCT" ||
    !item.quantity.value ||
    !item.containerSize.value ||
    !item.unit.value ||
    !item.physicalState.value ||
    item.physicalState.value === "Unknown";

  return requiredMissing || item.status !== "Confirmed";
}

export function completionBlockers(drum: Drum) {
  return drum.items.filter(itemBlocksCompletion);
}

export function totalContainers(drum: Drum) {
  return drum.items.reduce((sum, item) => sum + (Number(item.quantity.value) || 0), 0);
}

export function mergeDuplicateItems(items: InventoryItem[]) {
  const merged = new Map<string, InventoryItem>();

  for (const item of items) {
    const key = [
      item.chemicalName.value?.trim().toLowerCase(),
      item.containerSize.value,
      item.unit.value,
    ].join("|");

    if (!item.chemicalName.value || item.chemicalName.value === "UNKNOWN PRODUCT" || !item.containerSize.value || !item.unit.value) {
      merged.set(item.id, item);
      continue;
    }

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      continue;
    }

    merged.set(key, {
      ...existing,
      quantity: {
        value: (Number(existing.quantity.value) || 0) + (Number(item.quantity.value) || 0),
        confidence: Math.min(existing.quantity.confidence, item.quantity.confidence),
        source: existing.quantity.source === "user" || item.quantity.source === "user" ? "user" : "label",
      },
      confidence: Math.min(existing.confidence, item.confidence),
      status: existing.status === "Confirmed" && item.status === "Confirmed" ? "Confirmed" : "Review Required",
    });
  }

  return Array.from(merged.values());
}
