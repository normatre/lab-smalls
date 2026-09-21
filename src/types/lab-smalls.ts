export type Role = "Chemist" | "Supervisor" | "Admin";
export type Unit = "g" | "kg" | "mL" | "L";
export type PhysicalState = "Solid" | "Liquid" | "Gas" | "Unknown";
export type FieldSource = "label" | "database" | "user" | "inferred" | "image";
export type ItemStatus = "Confirmed" | "Review Required" | "Unknown";
export type DrumStatus = "Active" | "Completed" | "Blocked";
export type RetentionPolicy = "Delete after processing" | "Keep until drum completion" | "Keep permanently";

export type SourcedField<T> = {
  value: T | null;
  confidence: number;
  source: FieldSource;
};

export type InventoryItem = {
  id: string;
  chemicalName: SourcedField<string>;
  quantity: SourcedField<number>;
  containerSize: SourcedField<number>;
  unit: SourcedField<Unit>;
  physicalState: SourcedField<PhysicalState>;
  manufacturer?: string;
  catalogNumber?: string | null;
  casNumber?: string | null;
  unNumber?: string | null;
  confidence: number;
  status: ItemStatus;
  sourceImage?: string;
  sourceImageIds?: string[];
  notes?: string;
};

export type Drum = {
  id: string;
  drumId: string;
  size: "30 L" | "60 L" | "205 L" | "Other";
  category: "Lab Smalls";
  operatorName: string;
  date: string;
  notes?: string;
  status: DrumStatus;
  imagesScanned: number;
  scanImages?: string[];
  scanImageIds?: string[];
  scanWarnings?: string[];
  finalisedAt?: string;
  items: InventoryItem[];
};

export type Product = {
  id: string;
  canonicalName: string;
  manufacturer?: string;
  catalogNumber?: string;
  barcode?: string;
  casNumber?: string;
  unNumber?: string;
  typicalContainerSize?: number;
  unit?: Unit;
  physicalState: PhysicalState;
};

export type AuditEvent = {
  id: string;
  drumId: string;
  action: string;
  user: string;
  timestamp: string;
  previousValue?: unknown;
  newValue?: unknown;
};

export type DetectedChemical = Omit<InventoryItem, "id" | "status">;
