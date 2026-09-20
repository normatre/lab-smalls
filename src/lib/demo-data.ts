import type { AuditEvent, Drum, InventoryItem, Product } from "@/types/lab-smalls";

export const field = <T,>(value: T | null, confidence: number, source: InventoryItem["chemicalName"]["source"]) => ({
  value,
  confidence,
  source,
});

export const demoItems: InventoryItem[] = [
  {
    id: "item-acetone",
    chemicalName: field("Acetone", 0.98, "label"),
    quantity: field(3, 0.95, "user"),
    containerSize: field(2.5, 0.96, "label"),
    unit: field("L", 0.99, "label"),
    physicalState: field("Liquid", 0.9, "database"),
    manufacturer: "Sigma-Aldrich",
    casNumber: "67-64-1",
    unNumber: "UN1090",
    confidence: 0.96,
    status: "Confirmed",
  },
  {
    id: "item-methanol",
    chemicalName: field("Methanol", 0.97, "label"),
    quantity: field(2, 0.93, "label"),
    containerSize: field(1, 0.94, "label"),
    unit: field("L", 0.98, "label"),
    physicalState: field("Liquid", 0.88, "database"),
    manufacturer: "Fisher Chemical",
    casNumber: "67-56-1",
    unNumber: "UN1230",
    confidence: 0.92,
    status: "Confirmed",
  },
  {
    id: "item-sodium-hydroxide",
    chemicalName: field("Sodium Hydroxide", 0.91, "label"),
    quantity: field(4, 0.89, "label"),
    containerSize: field(500, 0.91, "label"),
    unit: field("g", 0.95, "label"),
    physicalState: field("Solid", 0.87, "database"),
    casNumber: "1310-73-2",
    unNumber: "UN1823",
    confidence: 0.89,
    status: "Confirmed",
  },
  {
    id: "item-hcl-review",
    chemicalName: field("Hydrochloric Acid", 0.82, "label"),
    quantity: field(1, 0.77, "image"),
    containerSize: field(2.5, 0.8, "label"),
    unit: field("L", 0.95, "label"),
    physicalState: field("Liquid", 0.79, "database"),
    manufacturer: "VWR",
    casNumber: "7647-01-0",
    unNumber: "UN1789",
    confidence: 0.8,
    status: "Review Required",
  },
  {
    id: "item-unknown",
    chemicalName: field("UNKNOWN PRODUCT", 0.2, "image"),
    quantity: field(null, 0.2, "image"),
    containerSize: field(null, 0.2, "image"),
    unit: field(null, 0.2, "image"),
    physicalState: field("Unknown", 0.2, "image"),
    confidence: 0.2,
    status: "Unknown",
    notes: "Label partially obscured. Manual entry required.",
  },
];

export const demoDrums: Drum[] = [
  {
    id: "drum-001",
    drumId: "LS-2026-001",
    size: "205 L",
    category: "Lab Smalls",
    operatorName: "A. Morgan",
    date: "2026-09-20",
    notes: "Demo drum with review examples.",
    status: "Active",
    imagesScanned: 4,
    scanImages: [],
    items: demoItems,
  },
  {
    id: "drum-014",
    drumId: "LS-2026-014",
    size: "60 L",
    category: "Lab Smalls",
    operatorName: "Priya Shah",
    date: "2026-09-18",
    status: "Completed",
    imagesScanned: 3,
    scanImages: [],
    finalisedAt: "2026-09-18T14:45:00.000Z",
    items: [
      {
        ...demoItems[0],
        id: "item-complete-acetone",
        quantity: field(1, 1, "user"),
        containerSize: field(1, 1, "user"),
        status: "Confirmed",
      },
    ],
  },
];

export const demoProducts: Product[] = [
  {
    id: "prod-acetone",
    canonicalName: "Acetone",
    manufacturer: "Sigma-Aldrich",
    catalogNumber: "179124",
    casNumber: "67-64-1",
    unNumber: "UN1090",
    typicalContainerSize: 2.5,
    unit: "L",
    physicalState: "Liquid",
  },
  {
    id: "prod-methanol",
    canonicalName: "Methanol",
    manufacturer: "Fisher Chemical",
    casNumber: "67-56-1",
    unNumber: "UN1230",
    typicalContainerSize: 1,
    unit: "L",
    physicalState: "Liquid",
  },
];

export const demoAudit: AuditEvent[] = [
  { id: "audit-1", drumId: "LS-2026-001", action: "drum created", user: "A. Morgan", timestamp: "2026-09-20T09:01:00.000Z" },
  { id: "audit-2", drumId: "LS-2026-001", action: "photo processed", user: "A. Morgan", timestamp: "2026-09-20T09:04:00.000Z" },
  { id: "audit-3", drumId: "LS-2026-001", action: "item extracted", user: "System", timestamp: "2026-09-20T09:04:02.000Z" },
];
