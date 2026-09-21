"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Archive, Camera, CheckCircle2, ClipboardCheck, Database, FileDown, Filter, History, Home, ImageUp, LogIn, Plus, Printer, RotateCcw, Search, Settings, ShieldCheck, Trash2, Wifi, WifiOff } from "lucide-react";
import { chemicalVisionService } from "@/services/chemicalVision";
import { field } from "@/lib/demo-data";
import { completionBlockers, confidenceNeedsReview, mergeDuplicateItems, totalContainers } from "@/lib/inventory";
import { downloadCsv, downloadPdf, downloadXlsx, openPrintView } from "@/lib/exporters";
import type { Drum, InventoryItem, PhysicalState, Product, RetentionPolicy, Role, Unit } from "@/types/lab-smalls";

type View = "Dashboard" | "New Drum" | "Active Drums" | "History" | "PubChem Database" | "Settings";
const navItems: { label: View; icon: typeof Home }[] = [
  { label: "Dashboard", icon: Home }, { label: "New Drum", icon: Plus }, { label: "Active Drums", icon: Archive },
  { label: "History", icon: History }, { label: "PubChem Database", icon: Database }, { label: "Settings", icon: Settings },
];
const units: Unit[] = ["g", "kg", "mL", "L"];
const states: PhysicalState[] = ["Solid", "Liquid", "Gas", "Unknown"];
const storageKey = "lab-smalls-scanner-state-v2";

export default function HomePage() {
  const [view, setView] = useState<View>("Dashboard");
  const [role, setRole] = useState<Role>("Chemist");
  const [drums, setDrums] = useState<Drum[]>([]);
  const [selectedDrumId, setSelectedDrumId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [retention, setRetention] = useState<RetentionPolicy>("Keep until drum completion");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [online, setOnline] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const selectedDrum = drums.find((drum) => drum.id === selectedDrumId);
  const activeDrums = drums.filter((drum) => drum.status !== "Completed");
  const completedDrums = drums.filter((drum) => drum.status === "Completed");
  const updateDrum = (updated: Drum) => { setDrums((current) => current.map((drum) => drum.id === updated.id ? updated : drum)); setSelectedDrumId(updated.id); };
  const deleteDrum = (id: string) => {
    const target = drums.find((drum) => drum.id === id);
    if (!target) return;
    const confirmed = window.confirm(`Delete drum ${target.drumId}? This removes it from this browser.`);
    if (!confirmed) return;
    setDrums((current) => {
      const next = current.filter((drum) => drum.id !== id);
      if (selectedDrumId === id) setSelectedDrumId(next[0]?.id ?? "");
      return next;
    });
    if (view === "Active Drums" && selectedDrumId === id) setView("Dashboard");
  };

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { drums?: Drum[]; products?: Product[]; retention?: RetentionPolicy; selectedDrumId?: string; openAiApiKey?: string };
        window.setTimeout(() => {
          if (parsed.drums?.length) setDrums(parsed.drums.map(stripUnneededDrumFields));
          if (parsed.products?.length) setProducts(parsed.products.map(stripUnneededProductFields));
          if (parsed.retention) setRetention(parsed.retention);
          if (parsed.openAiApiKey) setOpenAiApiKey(parsed.openAiApiKey);
          if (parsed.selectedDrumId) setSelectedDrumId(parsed.selectedDrumId);
          setHydrated(true);
        }, 0);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    if (!stored) window.setTimeout(() => setHydrated(true), 0);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ drums, products, retention, selectedDrumId, openAiApiKey }));
    } catch {
      // Mobile browsers have a small storage quota. Keep the inventory even if
      // older image previews no longer fit instead of crashing the page.
      const drumsWithoutImages = drums.map((drum) => ({ ...drum, scanImages: [] }));
      try {
        localStorage.setItem(storageKey, JSON.stringify({ drums: drumsWithoutImages, products, retention, selectedDrumId, openAiApiKey }));
      } catch {
        // Storage can also be unavailable in private browsing. The in-memory
        // inventory remains usable for the current session.
      }
    }
  }, [drums, hydrated, openAiApiKey, products, retention, selectedDrumId]);

  function createDrum(form: Omit<Drum, "id" | "status" | "imagesScanned" | "items">) {
    const drum: Drum = { ...form, id: crypto.randomUUID(), status: "Active", imagesScanned: 0, scanImages: [], scanImageIds: [], scanWarnings: [], items: [] };
    setDrums((current) => [drum, ...current]);
    setSelectedDrumId(drum.id);
    setView("Active Drums");
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-700 text-white"><ClipboardCheck size={24} /></div>
          <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold tracking-tight">Lab Smalls Scanner</h1><p className="text-sm text-slate-600">AI-assisted extraction. Operator verification required.</p></div>
          <button onClick={() => setOnline((value) => !value)} className="touch-button hidden border border-slate-300 bg-white text-sm font-semibold sm:flex">{online ? <Wifi size={18} /> : <WifiOff size={18} />}{online ? "ONLINE" : "OFFLINE"}</button>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[260px_1fr]">
        <aside className="hidden rounded-lg border border-slate-200 bg-white p-3 lg:block">
          <DemoLogin role={role} setRole={setRole} />
          <nav className="mt-4 space-y-2">{navItems.map((item) => <NavButton key={item.label} item={item} active={view === item.label} onClick={() => setView(item.label)} />)}</nav>
        </aside>
        <section className="space-y-4 pb-28 lg:pb-4">
          <OfflineStatus online={online} pending={!online && activeDrums.length > 0} />
          {view === "Dashboard" && <Dashboard drums={drums} onNew={() => setView("New Drum")} onDelete={deleteDrum} onContinue={(id) => { setSelectedDrumId(id); setView("Active Drums"); }} />}
          {view === "New Drum" && <DrumForm nextNumber={drums.length + 1} operator="Demo Chemist" onCreate={createDrum} />}
          {view === "Active Drums" && <ActiveDrums drums={activeDrums} selected={selectedDrum} onSelect={setSelectedDrumId} onDelete={deleteDrum} onUpdate={updateDrum} products={products} saveProduct={(product) => setProducts((current) => [product, ...current])} openAiApiKey={openAiApiKey} />}
          {view === "History" && <HistoryView drums={completedDrums.length ? completedDrums : drums} onDelete={deleteDrum} onOpen={(id) => { setSelectedDrumId(id); setView("Active Drums"); }} />}
          {view === "PubChem Database" && <ProductDatabase products={products} />}
          {view === "Settings" && <SettingsView retention={retention} setRetention={setRetention} role={role} openAiApiKey={openAiApiKey} setOpenAiApiKey={setOpenAiApiKey} resetDemo={() => { localStorage.removeItem(storageKey); setDrums([]); setProducts([]); setOpenAiApiKey(""); setSelectedDrumId(""); }} />}
        </section>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white lg:hidden">
        {navItems.slice(1).map((item) => <button key={item.label} onClick={() => setView(item.label)} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${view === item.label ? "text-emerald-700" : "text-slate-600"}`}><item.icon size={22} /><span>{item.label.replace("PubChem Database", "PubChem").replace("Active Drums", "Active")}</span></button>)}
      </nav>
    </main>
  );
}

function DemoLogin({ role, setRole }: { role: Role; setRole: (role: Role) => void }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2 font-semibold"><LogIn size={18} /> Demo login</div><select value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-3 input"><option>Chemist</option><option>Supervisor</option><option>Admin</option></select></div>;
}
function NavButton({ item, active, onClick }: { item: { label: View; icon: typeof Home }; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`touch-button w-full justify-start ${active ? "bg-emerald-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}><item.icon size={20} />{item.label}</button>;
}
function OfflineStatus({ online, pending }: { online: boolean; pending: boolean }) {
  return <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold ${online ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{online ? <Wifi size={18} /> : <WifiOff size={18} />}{online ? "ONLINE" : pending ? "OFFLINE - SYNC PENDING" : "OFFLINE"}</div>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="mb-3 text-lg font-bold">{title}</h2>{children}</section>;
}
function Metric({ label, value, urgent = false }: { label: string; value: number; urgent?: boolean }) {
  return <div className={`rounded-lg border bg-white p-4 ${urgent ? "border-amber-300" : "border-slate-200"}`}><div className="text-3xl font-bold">{value}</div><div className="text-sm font-semibold text-slate-600">{label}</div></div>;
}
function MetricMini({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-3 text-center"><div className="text-2xl font-bold">{value}</div><div className="text-sm font-semibold text-slate-600">{label}</div></div>;
}
function Dashboard({ drums, onNew, onContinue, onDelete }: { drums: Drum[]; onNew: () => void; onContinue: (id: string) => void; onDelete: (id: string) => void }) {
  const reviewCount = drums.flatMap((drum) => drum.items).filter((item) => item.status !== "Confirmed").length;
  const active = drums.filter((d) => d.status === "Active");
  return <div className="space-y-4"><section className="grid gap-3 md:grid-cols-2"><button onClick={onNew} className="rounded-lg bg-emerald-700 p-5 text-left text-white shadow-sm"><Plus size={30} /><strong className="mt-3 block text-2xl">Start new drum</strong><span className="mt-1 block text-sm text-emerald-50">Create ID, operator details, then begin scanning.</span></button><button onClick={() => active[0] && onContinue(active[0].id)} className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm disabled:opacity-50" disabled={!active[0]}><Archive size={30} className="text-slate-700" /><strong className="mt-3 block text-2xl">Continue active drum</strong><span className="mt-1 block text-sm text-slate-600">{active[0] ? `${active[0].drumId} has ${completionBlockers(active[0]).length} review blocker(s).` : "No active drums."}</span></button></section><div className="grid gap-3 sm:grid-cols-4"><Metric label="Active drums" value={active.length} /><Metric label="Completed today" value={drums.filter((d) => d.status === "Completed" && d.date === "2026-09-20").length} /><Metric label="Items requiring review" value={reviewCount} urgent={reviewCount > 0} /><Metric label="Recently completed" value={drums.filter((d) => d.status === "Completed").length} /></div><Panel title="Recently touched drums"><div className="space-y-3">{drums.length === 0 && <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">No drums on this device yet. Start a new drum to begin a private local inventory for this browser.</p>}{drums.map((drum) => <DrumListButton key={drum.id} drum={drum} onClick={() => onContinue(drum.id)} onDelete={() => onDelete(drum.id)} />)}</div></Panel></div>;
}
function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-bold text-slate-700"><span>{text}</span>{children}</label>;
}
function DrumForm({ nextNumber, operator, onCreate }: { nextNumber: number; operator: string; onCreate: (drum: Omit<Drum, "id" | "status" | "imagesScanned" | "items">) => void }) {
  const [drumId, setDrumId] = useState(`LS-2026-${String(nextNumber).padStart(3, "0")}`);
  const [size, setSize] = useState<Drum["size"]>("205 L");
  const [operatorName, setOperatorName] = useState(operator);
  const [date, setDate] = useState("2026-09-20");
  const [notes, setNotes] = useState("");
  return <Panel title="New Drum"><form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); onCreate({ drumId, size, category: "Lab Smalls", operatorName, date, notes }); }}><Label text="Drum ID"><input className="input" value={drumId} onChange={(e) => setDrumId(e.target.value)} /></Label><Label text="Drum size"><select className="input" value={size} onChange={(e) => setSize(e.target.value as Drum["size"])}><option>30 L</option><option>60 L</option><option>205 L</option><option>Other</option></select></Label><Label text="Waste/category"><input className="input" value="Lab Smalls" readOnly /></Label><Label text="Operator name"><input className="input" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} /></Label><Label text="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Label><Label text="Optional notes"><textarea className="input min-h-28" value={notes} onChange={(e) => setNotes(e.target.value)} /></Label><button className="touch-button min-h-14 justify-center bg-emerald-700 text-white" type="submit"><Camera size={22} />START SCANNING</button></form></Panel>;
}
function DrumListButton({ drum, onClick, onDelete }: { drum: Drum; onClick: () => void; onDelete?: () => void }) {
  const blockers = completionBlockers(drum).length;
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><button onClick={onClick} className="min-h-11 flex-1 text-left"><strong>{drum.drumId}</strong><div className="mt-1 text-sm text-slate-600">{totalContainers(drum)} containers · {drum.operatorName}</div></button><div className="flex shrink-0 items-center gap-2"><ReviewBadge status={drum.status === "Completed" ? "Completed" : blockers ? "Review Required" : "Active"} />{onDelete && <button onClick={onDelete} className="inline-flex min-h-11 items-center gap-1 rounded-md border border-red-200 bg-white px-3 text-sm font-bold text-red-700"><Trash2 size={16} />Delete</button>}</div></div></div>;
}
function ActiveDrums({ drums, selected, onSelect, onDelete, onUpdate, products, saveProduct, openAiApiKey }: { drums: Drum[]; selected?: Drum; onSelect: (id: string) => void; onDelete: (id: string) => void; onUpdate: (drum: Drum) => void; products: Product[]; saveProduct: (product: Product) => void; openAiApiKey: string }) {
  if (!selected) return <Panel title="Active Drums"><p className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-semibold text-slate-700">No active drum selected.</p></Panel>;
  return <div className="grid gap-4 xl:grid-cols-[300px_1fr]"><Panel title="Active Drums"><div className="space-y-3">{drums.map((drum) => <DrumListButton key={drum.id} drum={drum} onClick={() => onSelect(drum.id)} onDelete={() => onDelete(drum.id)} />)}</div></Panel><div className="space-y-4"><CameraScanner drum={selected} onUpdate={onUpdate} openAiApiKey={openAiApiKey} /><ReviewSection drum={selected} onUpdate={onUpdate} products={products} saveProduct={saveProduct} /><DrumSummary drum={selected} onUpdate={onUpdate} /></div></div>;
}
function CameraScanner({ drum, onUpdate, openAiApiKey }: { drum: Drum; onUpdate: (drum: Drum) => void; openAiApiKey: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [scanError, setScanError] = useState("");
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);
  async function processImage(file?: File) {
    if (!file || processing) return;
    setProcessing(true);
    setScanError("");
    try {
      const { analysisImage, preview } = await prepareCameraImage(file);
      const result = await chemicalVisionService.analyzeChemicalImage(analysisImage, { openAiApiKey: openAiApiKey.trim() || undefined });
      const imageId = crypto.randomUUID();
      const additions: InventoryItem[] = result.items.map((item) => ({ ...item, id: crypto.randomUUID(), sourceImageIds: [imageId], status: item.chemicalName.value === "UNKNOWN PRODUCT" ? "Unknown" : "Review Required" }));
      const scanImages = [preview, ...(drum.scanImages ?? [])].slice(0, 8);
      const scanImageIds = [imageId, ...(drum.scanImageIds ?? [])].slice(0, 8);
      onUpdate({ ...drum, imagesScanned: scanImages.length, scanImages, scanImageIds, scanWarnings: result.warnings, items: mergeDuplicateItems([...drum.items, ...additions]) });
    } catch {
      setScanError("The photo could not be processed. Please try again with the label closer to the camera.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      setProcessing(false);
    }
  }
  return <Panel title={`DRUM ${drum.drumId}`}><div className="flex min-h-56 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-center"><div><Camera className="mx-auto mb-3 text-slate-500" size={44} /><p className="font-semibold">Camera area</p><p className="text-sm text-slate-600">Take photos or upload label images.</p><p className="mt-1 text-xs font-semibold text-slate-500">OpenAI Vision proxy first</p></div></div>{Boolean(drum.scanImages?.length) && <div className="mt-3 grid grid-cols-4 gap-2">{drum.scanImages?.map((image, index) => <button type="button" key={`${drum.scanImageIds?.[index] ?? image.slice(0, 24)}-${index}`} aria-label={`Open scan ${index + 1}`} onClick={() => setOpenPhoto(image)} className="h-20 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><img src={image} alt={`Chemical label scan ${index + 1}`} className="h-full w-full object-cover" /></button>)}</div>}{openPhoto && <div role="dialog" aria-modal="true" aria-label="Chemical label photo" onClick={() => setOpenPhoto(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"><div className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}><img src={openPhoto} alt="Full-size chemical label" className="max-h-[88vh] max-w-full rounded-lg object-contain" /><button type="button" onClick={() => setOpenPhoto(null)} className="touch-button absolute right-2 top-2 bg-white text-slate-950 shadow-lg">Close</button></div></div>}{Boolean(drum.scanWarnings?.length) && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{drum.scanWarnings?.map((warning) => <p key={warning} className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{warning}</p>)}</div>}{scanError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{scanError}</p>}<div className="mt-4 grid grid-cols-3 gap-2"><MetricMini label="Images" value={drum.imagesScanned} /><MetricMini label="Detected" value={drum.items.length} /><MetricMini label="Review" value={completionBlockers(drum).length} /></div><input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void processImage(e.target.files?.[0])} /><div className="mt-4 grid gap-3 sm:grid-cols-4"><button type="button" disabled={processing} onClick={() => fileRef.current?.click()} className="touch-button justify-center bg-slate-900 text-white"><Camera size={20} />TAKE PHOTO</button><button type="button" disabled={processing} onClick={() => fileRef.current?.click()} className="touch-button justify-center border border-slate-300 bg-white"><ImageUp size={20} />UPLOAD IMAGE</button><a href="#review" className="touch-button justify-center border border-slate-300 bg-white"><AlertTriangle size={20} />REVIEW ITEMS</a><a href="#summary" className="touch-button justify-center bg-emerald-700 text-white"><CheckCircle2 size={20} />FINISH SCANNING</a></div>{processing && <p className="mt-3 text-sm font-semibold text-amber-800" aria-live="polite">Optimising the photo and reading the label. Keep this page open for a few seconds...</p>}</Panel>;
}

async function prepareCameraImage(file: File) {
  const source = await loadImageSource(file);
  try {
    const analysisImage = await renderCompressedImage(source, 1600, 0.82);
    const previewImage = await renderCompressedImage(source, 480, 0.68);
    const preview = await fileToDataUrl(previewImage);
    return { analysisImage, preview };
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}

async function loadImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return createImageBitmap(file, { imageOrientation: "from-image" });
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderCompressedImage(source: ImageBitmap | HTMLImageElement, maxDimension: number, quality: number) {
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Canvas is unavailable"));
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image compression failed")), "image/jpeg", quality));
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function stripUnneededDrumFields(drum: Drum): Drum {
  const scanImages = drum.scanImages ?? [];
  const scanImageIds = drum.scanImageIds?.length === scanImages.length
    ? drum.scanImageIds
    : scanImages.map(() => crypto.randomUUID());
  const items = drum.items.map(({ manufacturer: _manufacturer, catalogNumber: _catalogNumber, casNumber: _casNumber, unNumber: _unNumber, ...item }, index) => ({
    ...item,
    sourceImageIds: item.sourceImageIds?.length
      ? item.sourceImageIds
      : scanImageIds.length === drum.items.length
        ? [scanImageIds[scanImageIds.length - 1 - index]]
        : [],
  }));
  return {
    ...drum,
    imagesScanned: scanImages.length,
    scanImages,
    scanImageIds,
    items,
  };
}

function stripUnneededProductFields(product: Product): Product {
  const { manufacturer: _manufacturer, catalogNumber: _catalogNumber, casNumber: _casNumber, unNumber: _unNumber, ...required } = product;
  return required;
}

function ReviewSection({ drum, onUpdate, products, saveProduct }: { drum: Drum; onUpdate: (drum: Drum) => void; products: Product[]; saveProduct: (product: Product) => void }) {
  const [reviewOnly, setReviewOnly] = useState(false);
  const updateItem = (item: InventoryItem) => onUpdate({ ...drum, items: drum.items.map((current) => current.id === item.id ? item : current) });
  const deleteItem = (item: InventoryItem) => {
    const confirmed = window.confirm(`Delete ${item.chemicalName.value || "this item"} from ${drum.drumId}?`);
    if (!confirmed) return;
    const items = drum.items.filter((current) => current.id !== item.id);
    const retainedImageIds = new Set(items.flatMap((current) => current.sourceImageIds ?? []));
    const removedImageIds = new Set((item.sourceImageIds ?? []).filter((imageId) => !retainedImageIds.has(imageId)));
    const scanImageIds = drum.scanImageIds ?? [];
    const keptIndexes = scanImageIds.map((imageId, index) => ({ imageId, index })).filter(({ imageId }) => !removedImageIds.has(imageId));
    const scanImages = keptIndexes.map(({ index }) => drum.scanImages?.[index]).filter((image): image is string => Boolean(image));
    onUpdate({ ...drum, items, scanImages, scanImageIds: keptIndexes.map(({ imageId }) => imageId), imagesScanned: scanImages.length });
  };
  const addManual = () => onUpdate({ ...drum, items: [{ id: crypto.randomUUID(), chemicalName: field("", 1, "user"), quantity: field(1, 1, "user"), containerSize: field(1, 1, "user"), unit: field("L", 1, "user"), physicalState: field("Unknown", 1, "user"), confidence: 1, status: "Review Required" }, ...drum.items] });
  const visibleItems = reviewOnly ? drum.items.filter(itemNeedsReview) : drum.items;
  const confirmSafe = () => onUpdate({ ...drum, items: drum.items.map((item) => itemNeedsReview(item) ? item : { ...item, status: "Confirmed" }) });
  return <Panel title="Review Items"><div id="review" className="mb-3 flex flex-wrap gap-3"><button onClick={addManual} className="touch-button bg-slate-900 text-white"><Plus size={20} />ADD MANUALLY</button><button onClick={() => onUpdate({ ...drum, items: mergeDuplicateItems(drum.items) })} className="touch-button border border-slate-300 bg-white">Combine duplicates</button><button onClick={() => setReviewOnly((value) => !value)} className="touch-button border border-slate-300 bg-white"><Filter size={20} />{reviewOnly ? "Show all" : "Review only"}</button><button onClick={confirmSafe} className="touch-button border border-emerald-300 bg-white text-emerald-800"><CheckCircle2 size={20} />Confirm safe items</button></div><div className="grid gap-3">{visibleItems.map((item) => <ScanResultCard key={item.id} item={item} onUpdate={updateItem} onDelete={() => deleteItem(item)} products={products} saveProduct={saveProduct} />)}{visibleItems.length === 0 && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-800">No items need review.</p>}</div></Panel>;
}

function itemNeedsReview(item: InventoryItem) {
  return item.status !== "Confirmed" || item.chemicalName.value === "UNKNOWN PRODUCT" || !item.chemicalName.value || !item.quantity.value || !item.containerSize.value || !item.unit.value || item.physicalState.value === "Unknown" || confidenceNeedsReview(item.confidence);
}
function ScanResultCard({ item, onUpdate, onDelete, products, saveProduct }: { item: InventoryItem; onUpdate: (item: InventoryItem) => void; onDelete: () => void; products: Product[]; saveProduct: (product: Product) => void }) {
  const [expanded, setExpanded] = useState(item.status !== "Confirmed" || item.chemicalName.value === "UNKNOWN PRODUCT");
  const needsReview = itemNeedsReview(item);
  function updateField(name: "chemicalName" | "quantity" | "containerSize" | "unit" | "physicalState", value: string) {
    const numeric = name === "quantity" || name === "containerSize" ? Number(value) : value;
    onUpdate({ ...item, [name]: { ...item[name], value: numeric as never, confidence: 1, source: "user" } });
  }
  return <article className={`rounded-lg border bg-white p-4 ${needsReview ? "border-amber-300" : "border-slate-200"}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><button onClick={() => setExpanded((value) => !value)} className="min-h-11 flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{item.chemicalName.value || "Manual item"}</h3><ReviewBadge status={item.status} /></div><p className="mt-1 text-sm font-semibold text-slate-700">{item.quantity.value ?? "-"} × {item.containerSize.value ?? "-"} {item.unit.value ?? ""} · {item.physicalState.value ?? "Unknown"} · Confidence {Math.round(item.confidence * 100)}%</p>{needsReview && <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-amber-900"><AlertTriangle size={15} />Review required</p>}</button><div className="flex flex-wrap gap-2"><button onClick={() => setExpanded((value) => !value)} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-bold">{expanded ? "Hide details" : "Edit"}</button><button onClick={onDelete} className="inline-flex min-h-11 items-center gap-1 rounded-md border border-red-200 px-3 text-sm font-bold text-red-700"><Trash2 size={16} />Delete item</button></div></div>{expanded && <><div className="mt-4 grid gap-3 sm:grid-cols-2"><FieldEditor label="Chemical Name" value={item.chemicalName.value ?? ""} confidence={item.chemicalName.confidence} source={item.chemicalName.source} onChange={(v) => updateField("chemicalName", v)} /><FieldEditor label="Quantity" type="number" value={item.quantity.value ?? ""} confidence={item.quantity.confidence} source={item.quantity.source} onChange={(v) => updateField("quantity", v)} /><FieldEditor label="Container Size" type="number" value={item.containerSize.value ?? ""} confidence={item.containerSize.confidence} source={item.containerSize.source} onChange={(v) => updateField("containerSize", v)} /><Label text={`Unit · source: ${item.unit.source}`}><select className={`input ${confidenceNeedsReview(item.unit.confidence) ? "review-field" : ""}`} value={item.unit.value ?? ""} onChange={(e) => updateField("unit", e.target.value)}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></Label><Label text={`Physical State · source: ${item.physicalState.source}`}><select className={`input ${item.physicalState.value === "Unknown" || confidenceNeedsReview(item.physicalState.confidence) ? "review-field" : ""}`} value={item.physicalState.value ?? "Unknown"} onChange={(e) => updateField("physicalState", e.target.value)}>{states.map((state) => <option key={state}>{state}</option>)}</select></Label></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><button onClick={() => onUpdate({ ...item, status: "Confirmed", confidence: 1 })} className="touch-button justify-center bg-emerald-700 text-white"><CheckCircle2 size={20} />CONFIRM</button><button onClick={() => onUpdate({ ...item, status: "Review Required" })} className="touch-button justify-center border border-amber-300 bg-white text-amber-900"><AlertTriangle size={20} />FLAG FOR REVIEW</button><button onClick={() => saveProduct({ id: crypto.randomUUID(), canonicalName: item.chemicalName.value ?? "Unnamed product", typicalContainerSize: item.containerSize.value ?? undefined, unit: item.unit.value ?? undefined, physicalState: item.physicalState.value ?? "Unknown" })} className="touch-button justify-center border border-slate-300 bg-white"><Database size={20} />Save product</button></div>{products.find((p) => p.canonicalName.toLowerCase() === item.chemicalName.value?.toLowerCase()) && <p className="mt-3 text-sm font-semibold text-emerald-800">Matched local product database. Confirm before applying known values.</p>}</>}</article>;
}
function FieldEditor({ label, value, onChange, confidence, source, type = "text" }: { label: string; value: string | number; onChange: (value: string) => void; confidence: number; source: string; type?: string }) {
  return <Label text={`${label} · source: ${source}`}><input className={`input ${confidenceNeedsReview(confidence) ? "review-field" : ""}`} type={type} value={value} onChange={(e) => onChange(e.target.value)} /></Label>;
}
function ReviewBadge({ status }: { status: string }) {
  const style = status === "Confirmed" || status === "Completed" ? "bg-emerald-100 text-emerald-800" : status === "Unknown" || status === "Review Required" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${style}`}>{status === "Confirmed" || status === "Completed" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{status}</span>;
}
function DrumSummary({ drum, onUpdate }: { drum: Drum; onUpdate: (drum: Drum) => void }) {
  const blockers = completionBlockers(drum);
  const [checked, setChecked] = useState(false);
  return <Panel title="Drum Summary"><div id="summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricMini label="Unique lines" value={drum.items.length} /><MetricMini label="Containers" value={totalContainers(drum)} /><MetricMini label="Review blockers" value={blockers.length} /><MetricMini label="Images" value={drum.imagesScanned} /></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b">{["Chemical", "Quantity", "Size", "State", "Status"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{drum.items.map((item) => <tr key={item.id} className="border-b"><td className="px-3 py-3 font-semibold">{item.chemicalName.value}</td><td className="px-3 py-3">{item.quantity.value}</td><td className="px-3 py-3">{item.containerSize.value} {item.unit.value}</td><td className="px-3 py-3">{item.physicalState.value}</td><td className="px-3 py-3"><ReviewBadge status={item.status} /></td></tr>)}</tbody></table></div>{blockers.length > 0 && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong className="mb-2 block">Cannot complete yet</strong><ul className="space-y-2">{blockers.map((item) => <li key={item.id} className="flex gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><span><strong>{item.chemicalName.value || "Unnamed item"}</strong>: {blockerReasons(item).join(", ")}</span></li>)}</ul></div>}<ExportMenu drum={drum} /><label className="mt-4 flex items-center gap-3 font-semibold"><input type="checkbox" className="h-6 w-6" checked={checked} onChange={(e) => setChecked(e.target.checked)} />I have reviewed this inventory.</label><button disabled={blockers.length > 0 || !checked} onClick={() => onUpdate({ ...drum, status: "Completed", finalisedAt: new Date().toISOString() })} className="touch-button mt-3 min-h-14 justify-center bg-emerald-700 text-white disabled:bg-slate-300"><ShieldCheck size={22} />FINALISE DRUM</button></Panel>;
}

function blockerReasons(item: InventoryItem) {
  const reasons: string[] = [];
  if (!item.chemicalName.value || item.chemicalName.value === "UNKNOWN PRODUCT") reasons.push("chemical name required");
  if (!item.quantity.value) reasons.push("quantity required");
  if (!item.containerSize.value) reasons.push("container size required");
  if (!item.unit.value) reasons.push("unit required");
  if (item.physicalState.value === "Unknown") reasons.push("physical state required");
  if (item.status !== "Confirmed") reasons.push("operator confirmation required");
  return reasons;
}
function ExportMenu({ drum }: { drum: Drum }) {
  return <div className="mt-4 grid gap-3 sm:grid-cols-4"><button className="touch-button border border-slate-300 bg-white" onClick={() => downloadPdf(drum)}><FileDown size={18} />PDF</button><button className="touch-button border border-slate-300 bg-white" onClick={() => downloadCsv(drum)}><FileDown size={18} />CSV</button><button className="touch-button border border-slate-300 bg-white" onClick={() => downloadXlsx(drum)}><FileDown size={18} />XLSX</button><button className="touch-button border border-slate-300 bg-white" onClick={openPrintView}><Printer size={18} />Print</button></div>;
}
function HistoryView({ drums, onOpen, onDelete }: { drums: Drum[]; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => drums.filter((drum) => [drum.drumId, drum.operatorName, drum.date, ...drum.items.map((item) => item.chemicalName.value)].join(" ").toLowerCase().includes(query.toLowerCase())), [drums, query]);
  return <Panel title="Searchable History"><div className="relative mb-4"><Search className="absolute left-3 top-4 text-slate-500" size={20} /><input className="input pl-11" placeholder="Search drum ID, chemical, date, operator, CAS, UN" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="space-y-3">{results.map((drum) => <DrumListButton key={drum.id} drum={drum} onClick={() => onOpen(drum.id)} onDelete={() => onDelete(drum.id)} />)}</div></Panel>;
}
function ProductDatabase({ products }: { products: Product[] }) {
  return <Panel title="PubChem Database"><div className="grid gap-3 md:grid-cols-3"><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><Database className="mb-3 text-emerald-800" size={28} /><h3 className="font-bold text-emerald-950">Automatic chemical lookup</h3><p className="mt-2 text-sm text-emerald-900">When a photo is uploaded, the app reads the prominent label name and validates it with PubChem first, then trusted fallback sources.</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><ClipboardCheck className="mb-3 text-slate-700" size={28} /><h3 className="font-bold">Only required inventory fields</h3><p className="mt-2 text-sm text-slate-600">Database results improve the chemical name and physical state. The inventory keeps only name, quantity, container size, unit and physical state.</p></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><AlertTriangle className="mb-3 text-amber-800" size={28} /><h3 className="font-bold text-amber-950">Operator review</h3><p className="mt-2 text-sm text-amber-900">Commercial reagent names are preserved. Uncertain matches remain unchanged and are flagged for review.</p></div></div><section className="mt-5"><h3 className="mb-3 text-base font-bold">Local fallback products</h3><div className="grid gap-3">{products.length === 0 && <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">No local fallback products are saved in this browser.</p>}{products.map((product) => <div key={product.id} className="rounded-lg border border-slate-200 bg-white p-4"><strong>{product.canonicalName}</strong><p className="mt-1 text-sm text-slate-600">{product.typicalContainerSize ?? "-"} {product.unit ?? ""} · {product.physicalState}</p></div>)}</div></section></Panel>;
}
function SettingsView({ retention, setRetention, role, openAiApiKey, setOpenAiApiKey, resetDemo }: { retention: RetentionPolicy; setRetention: (value: RetentionPolicy) => void; role: Role; openAiApiKey: string; setOpenAiApiKey: (value: string) => void; resetDemo: () => void }) {
  return <Panel title="Settings"><div className="grid gap-4"><Label text="Image retention"><select className="input" value={retention} onChange={(e) => setRetention(e.target.value as RetentionPolicy)}><option>Delete after processing</option><option>Keep until drum completion</option><option>Keep permanently</option></select></Label><Label text="OpenAI Vision fallback API key"><input className="input" type="password" placeholder="sk-..." value={openAiApiKey} onChange={(e) => setOpenAiApiKey(e.target.value)} autoComplete="off" /></Label><p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">OCR engine: server OpenAI Vision proxy first, local key fallback if provided, then Tesseract fallback. Local API keys are stored only in this browser.</p><p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Current policy: {retention}. Drum, image preview, product, OCR, and setting changes are saved only in this browser. Other phones or PCs start with their own separate local inventory.</p><button onClick={resetDemo} className="touch-button justify-center border border-slate-300 bg-white"><RotateCcw size={20} />Clear this device</button><div className="rounded-lg border border-slate-200 p-3"><strong>Role permissions</strong><p className="text-sm text-slate-600">{role}: {role === "Chemist" ? "Create, scan, edit active drums, complete drums, view history." : role === "Supervisor" ? "Chemist permissions plus review all drums." : "Full access including users, products, and settings."}</p></div></div></Panel>;
}
