"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Archive, Camera, CheckCircle2, ClipboardCheck, Database, FileDown, Filter, History, Home, ImageUp, LogIn, Plus, Printer, RotateCcw, Search, Settings, ShieldCheck, Trash2, Wifi, WifiOff } from "lucide-react";
import { chemicalVisionService } from "@/services/chemicalVision";
import { demoAudit, demoDrums, demoProducts, field } from "@/lib/demo-data";
import { completionBlockers, confidenceNeedsReview, mergeDuplicateItems, totalContainers } from "@/lib/inventory";
import { downloadCsv, downloadPdf, downloadXlsx, openPrintView } from "@/lib/exporters";
import type { Drum, InventoryItem, PhysicalState, Product, RetentionPolicy, Role, Unit } from "@/types/lab-smalls";

type View = "Dashboard" | "New Drum" | "Active Drums" | "History" | "Product Database" | "Settings";
const navItems: { label: View; icon: typeof Home }[] = [
  { label: "Dashboard", icon: Home }, { label: "New Drum", icon: Plus }, { label: "Active Drums", icon: Archive },
  { label: "History", icon: History }, { label: "Product Database", icon: Database }, { label: "Settings", icon: Settings },
];
const units: Unit[] = ["g", "kg", "mL", "L"];
const states: PhysicalState[] = ["Solid", "Liquid", "Gas", "Unknown"];
const storageKey = "lab-smalls-scanner-state-v2";

export default function HomePage() {
  const [view, setView] = useState<View>("Dashboard");
  const [role, setRole] = useState<Role>("Chemist");
  const [drums, setDrums] = useState<Drum[]>(demoDrums);
  const [selectedDrumId, setSelectedDrumId] = useState(demoDrums[0].id);
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [retention, setRetention] = useState<RetentionPolicy>("Keep until drum completion");
  const [online, setOnline] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const selectedDrum = drums.find((drum) => drum.id === selectedDrumId) ?? drums[0];
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
        const parsed = JSON.parse(stored) as { drums?: Drum[]; products?: Product[]; retention?: RetentionPolicy; selectedDrumId?: string };
        window.setTimeout(() => {
          if (parsed.drums?.length) setDrums(parsed.drums);
          if (parsed.products?.length) setProducts(parsed.products);
          if (parsed.retention) setRetention(parsed.retention);
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
    localStorage.setItem(storageKey, JSON.stringify({ drums, products, retention, selectedDrumId }));
  }, [drums, hydrated, products, retention, selectedDrumId]);

  function createDrum(form: Omit<Drum, "id" | "status" | "imagesScanned" | "items">) {
    const drum: Drum = { ...form, id: crypto.randomUUID(), status: "Active", imagesScanned: 0, scanImages: [], scanWarnings: [], items: [] };
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
          {view === "Active Drums" && <ActiveDrums drums={activeDrums} selected={selectedDrum} onSelect={setSelectedDrumId} onDelete={deleteDrum} onUpdate={updateDrum} products={products} saveProduct={(product) => setProducts((current) => [product, ...current])} />}
          {view === "History" && <HistoryView drums={completedDrums.length ? completedDrums : drums} onDelete={deleteDrum} onOpen={(id) => { setSelectedDrumId(id); setView("Active Drums"); }} />}
          {view === "Product Database" && <ProductDatabase products={products} setProducts={setProducts} />}
          {view === "Settings" && <SettingsView retention={retention} setRetention={setRetention} role={role} resetDemo={() => { localStorage.removeItem(storageKey); setDrums(demoDrums); setProducts(demoProducts); setSelectedDrumId(demoDrums[0].id); }} />}
        </section>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white lg:hidden">
        {navItems.slice(1).map((item) => <button key={item.label} onClick={() => setView(item.label)} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${view === item.label ? "text-emerald-700" : "text-slate-600"}`}><item.icon size={22} /><span>{item.label.replace("Product Database", "Products").replace("Active Drums", "Active")}</span></button>)}
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
  return <div className="space-y-4"><section className="grid gap-3 md:grid-cols-2"><button onClick={onNew} className="rounded-lg bg-emerald-700 p-5 text-left text-white shadow-sm"><Plus size={30} /><strong className="mt-3 block text-2xl">Start new drum</strong><span className="mt-1 block text-sm text-emerald-50">Create ID, operator details, then begin scanning.</span></button><button onClick={() => active[0] && onContinue(active[0].id)} className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm disabled:opacity-50" disabled={!active[0]}><Archive size={30} className="text-slate-700" /><strong className="mt-3 block text-2xl">Continue active drum</strong><span className="mt-1 block text-sm text-slate-600">{active[0] ? `${active[0].drumId} has ${completionBlockers(active[0]).length} review blocker(s).` : "No active drums."}</span></button></section><div className="grid gap-3 sm:grid-cols-4"><Metric label="Active drums" value={active.length} /><Metric label="Completed today" value={drums.filter((d) => d.status === "Completed" && d.date === "2026-09-20").length} /><Metric label="Items requiring review" value={reviewCount} urgent={reviewCount > 0} /><Metric label="Recently completed" value={drums.filter((d) => d.status === "Completed").length} /></div><Panel title="Recently touched drums"><div className="space-y-3">{drums.map((drum) => <DrumListButton key={drum.id} drum={drum} onClick={() => onContinue(drum.id)} onDelete={() => onDelete(drum.id)} />)}</div></Panel></div>;
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
function ActiveDrums({ drums, selected, onSelect, onDelete, onUpdate, products, saveProduct }: { drums: Drum[]; selected: Drum; onSelect: (id: string) => void; onDelete: (id: string) => void; onUpdate: (drum: Drum) => void; products: Product[]; saveProduct: (product: Product) => void }) {
  if (!selected) return <Panel title="Active Drums"><p className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-semibold text-slate-700">No active drum selected.</p></Panel>;
  return <div className="grid gap-4 xl:grid-cols-[300px_1fr]"><Panel title="Active Drums"><div className="space-y-3">{drums.map((drum) => <DrumListButton key={drum.id} drum={drum} onClick={() => onSelect(drum.id)} onDelete={() => onDelete(drum.id)} />)}</div></Panel><div className="space-y-4"><CameraScanner drum={selected} onUpdate={onUpdate} /><ReviewSection drum={selected} onUpdate={onUpdate} products={products} saveProduct={saveProduct} /><DrumSummary drum={selected} onUpdate={onUpdate} /></div></div>;
}
function CameraScanner({ drum, onUpdate }: { drum: Drum; onUpdate: (drum: Drum) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  async function processImage(file?: File) {
    setProcessing(true);
    const preview = file ? await fileToDataUrl(file) : undefined;
    const result = await chemicalVisionService.analyzeChemicalImage(file ?? new Blob());
    const additions: InventoryItem[] = result.items.map((item) => ({ ...item, id: crypto.randomUUID(), status: item.chemicalName.value === "UNKNOWN PRODUCT" ? "Unknown" : "Review Required" }));
    onUpdate({ ...drum, imagesScanned: drum.imagesScanned + 1, scanImages: preview ? [preview, ...(drum.scanImages ?? [])].slice(0, 8) : drum.scanImages, scanWarnings: result.warnings, items: mergeDuplicateItems([...drum.items, ...additions]) });
    setProcessing(false);
  }
  return <Panel title={`DRUM ${drum.drumId}`}><div className="flex min-h-56 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-center"><div><Camera className="mx-auto mb-3 text-slate-500" size={44} /><p className="font-semibold">Camera area</p><p className="text-sm text-slate-600">Take photos or upload label images.</p></div></div>{Boolean(drum.scanImages?.length) && <div className="mt-3 grid grid-cols-4 gap-2">{drum.scanImages?.map((image, index) => <div key={`${image.slice(0, 24)}-${index}`} aria-label={`Scan ${index + 1}`} className="h-20 w-full rounded-lg border border-slate-200 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} />)}</div>}{Boolean(drum.scanWarnings?.length) && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{drum.scanWarnings?.map((warning) => <p key={warning} className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{warning}</p>)}</div>}<div className="mt-4 grid grid-cols-3 gap-2"><MetricMini label="Images" value={drum.imagesScanned} /><MetricMini label="Detected" value={drum.items.length} /><MetricMini label="Review" value={completionBlockers(drum).length} /></div><input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void processImage(e.target.files?.[0])} /><div className="mt-4 grid gap-3 sm:grid-cols-4"><button disabled={processing} onClick={() => fileRef.current?.click()} className="touch-button justify-center bg-slate-900 text-white"><Camera size={20} />TAKE PHOTO</button><button disabled={processing} onClick={() => fileRef.current?.click()} className="touch-button justify-center border border-slate-300 bg-white"><ImageUp size={20} />UPLOAD IMAGE</button><a href="#review" className="touch-button justify-center border border-slate-300 bg-white"><AlertTriangle size={20} />REVIEW ITEMS</a><a href="#summary" className="touch-button justify-center bg-emerald-700 text-white"><CheckCircle2 size={20} />FINISH SCANNING</a></div>{processing && <p className="mt-3 text-sm font-semibold text-amber-800">Reading label text with OCR and matching chemical data. This can take a few seconds...</p>}</Panel>;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
function ReviewSection({ drum, onUpdate, products, saveProduct }: { drum: Drum; onUpdate: (drum: Drum) => void; products: Product[]; saveProduct: (product: Product) => void }) {
  const [reviewOnly, setReviewOnly] = useState(false);
  const updateItem = (item: InventoryItem) => onUpdate({ ...drum, items: drum.items.map((current) => current.id === item.id ? item : current) });
  const addManual = () => onUpdate({ ...drum, items: [{ id: crypto.randomUUID(), chemicalName: field("", 1, "user"), quantity: field(1, 1, "user"), containerSize: field(1, 1, "user"), unit: field("L", 1, "user"), physicalState: field("Unknown", 1, "user"), confidence: 1, status: "Review Required" }, ...drum.items] });
  const visibleItems = reviewOnly ? drum.items.filter(itemNeedsReview) : drum.items;
  const confirmSafe = () => onUpdate({ ...drum, items: drum.items.map((item) => itemNeedsReview(item) ? item : { ...item, status: "Confirmed" }) });
  return <Panel title="Review Items"><div id="review" className="mb-3 flex flex-wrap gap-3"><button onClick={addManual} className="touch-button bg-slate-900 text-white"><Plus size={20} />ADD MANUALLY</button><button onClick={() => onUpdate({ ...drum, items: mergeDuplicateItems(drum.items) })} className="touch-button border border-slate-300 bg-white">Combine duplicates</button><button onClick={() => setReviewOnly((value) => !value)} className="touch-button border border-slate-300 bg-white"><Filter size={20} />{reviewOnly ? "Show all" : "Review only"}</button><button onClick={confirmSafe} className="touch-button border border-emerald-300 bg-white text-emerald-800"><CheckCircle2 size={20} />Confirm safe items</button></div><div className="grid gap-3">{visibleItems.map((item) => <ScanResultCard key={item.id} item={item} onUpdate={updateItem} products={products} saveProduct={saveProduct} />)}{visibleItems.length === 0 && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-800">No items need review.</p>}</div></Panel>;
}

function itemNeedsReview(item: InventoryItem) {
  return item.status !== "Confirmed" || item.chemicalName.value === "UNKNOWN PRODUCT" || !item.chemicalName.value || !item.quantity.value || !item.containerSize.value || !item.unit.value || item.physicalState.value === "Unknown" || confidenceNeedsReview(item.confidence);
}
function ScanResultCard({ item, onUpdate, products, saveProduct }: { item: InventoryItem; onUpdate: (item: InventoryItem) => void; products: Product[]; saveProduct: (product: Product) => void }) {
  const needsReview = itemNeedsReview(item);
  function updateField(name: "chemicalName" | "quantity" | "containerSize" | "unit" | "physicalState", value: string) {
    const numeric = name === "quantity" || name === "containerSize" ? Number(value) : value;
    onUpdate({ ...item, [name]: { ...item[name], value: numeric as never, confidence: 1, source: "user" } });
  }
  return <article className={`rounded-lg border p-4 ${needsReview ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{item.chemicalName.value || "Manual item"}</h3><ConfidenceIndicator confidence={item.confidence} /></div><ReviewBadge status={item.status} /></div>{needsReview && <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900"><AlertTriangle size={18} />Review required: confirm uncertain or missing fields.</div>}<div className="grid gap-3 sm:grid-cols-2"><FieldEditor label="Chemical Name" value={item.chemicalName.value ?? ""} confidence={item.chemicalName.confidence} source={item.chemicalName.source} onChange={(v) => updateField("chemicalName", v)} /><FieldEditor label="Quantity" type="number" value={item.quantity.value ?? ""} confidence={item.quantity.confidence} source={item.quantity.source} onChange={(v) => updateField("quantity", v)} /><FieldEditor label="Container Size" type="number" value={item.containerSize.value ?? ""} confidence={item.containerSize.confidence} source={item.containerSize.source} onChange={(v) => updateField("containerSize", v)} /><Label text={`Unit · source: ${item.unit.source}`}><select className={`input ${confidenceNeedsReview(item.unit.confidence) ? "review-field" : ""}`} value={item.unit.value ?? ""} onChange={(e) => updateField("unit", e.target.value)}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></Label><Label text={`Physical State · source: ${item.physicalState.source}`}><select className={`input ${item.physicalState.value === "Unknown" || confidenceNeedsReview(item.physicalState.confidence) ? "review-field" : ""}`} value={item.physicalState.value ?? "Unknown"} onChange={(e) => updateField("physicalState", e.target.value)}>{states.map((state) => <option key={state}>{state}</option>)}</select></Label><FieldEditor label="Manufacturer" value={item.manufacturer ?? ""} confidence={1} source="label" onChange={(v) => onUpdate({ ...item, manufacturer: v })} /><FieldEditor label="CAS" value={item.casNumber ?? ""} confidence={1} source="label" onChange={(v) => onUpdate({ ...item, casNumber: v })} /><FieldEditor label="UN Number" value={item.unNumber ?? ""} confidence={1} source="label" onChange={(v) => onUpdate({ ...item, unNumber: v })} /></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><button onClick={() => onUpdate({ ...item, status: "Confirmed", confidence: 1 })} className="touch-button justify-center bg-emerald-700 text-white"><CheckCircle2 size={20} />CONFIRM</button><button onClick={() => onUpdate({ ...item, status: "Review Required" })} className="touch-button justify-center border border-amber-300 bg-white text-amber-900"><AlertTriangle size={20} />FLAG FOR REVIEW</button><button onClick={() => saveProduct({ id: crypto.randomUUID(), canonicalName: item.chemicalName.value ?? "Unnamed product", manufacturer: item.manufacturer, catalogNumber: item.catalogNumber ?? undefined, casNumber: item.casNumber ?? undefined, unNumber: item.unNumber ?? undefined, typicalContainerSize: item.containerSize.value ?? undefined, unit: item.unit.value ?? undefined, physicalState: item.physicalState.value ?? "Unknown" })} className="touch-button justify-center border border-slate-300 bg-white"><Database size={20} />Save product</button></div>{products.find((p) => p.manufacturer === item.manufacturer && p.catalogNumber === item.catalogNumber) && <p className="mt-3 text-sm font-semibold text-emerald-800">Matched product database. Confirm before applying known values.</p>}</article>;
}
function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  return <p className={`text-sm font-semibold ${percent < 85 ? "text-amber-900" : "text-slate-600"}`}>Confidence {percent}%{percent < 85 ? " · Review required" : ""}</p>;
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
  return <Panel title="Drum Summary"><div id="summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricMini label="Unique lines" value={drum.items.length} /><MetricMini label="Containers" value={totalContainers(drum)} /><MetricMini label="Review blockers" value={blockers.length} /><MetricMini label="Images" value={drum.imagesScanned} /></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b">{["Chemical", "Quantity", "Size", "State", "CAS", "UN", "Status"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{drum.items.map((item) => <tr key={item.id} className="border-b"><td className="px-3 py-3 font-semibold">{item.chemicalName.value}</td><td className="px-3 py-3">{item.quantity.value}</td><td className="px-3 py-3">{item.containerSize.value} {item.unit.value}</td><td className="px-3 py-3">{item.physicalState.value}</td><td className="px-3 py-3">{item.casNumber}</td><td className="px-3 py-3">{item.unNumber}</td><td className="px-3 py-3"><ReviewBadge status={item.status} /></td></tr>)}</tbody></table></div>{blockers.length > 0 && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong className="mb-2 block">Cannot complete yet</strong><ul className="space-y-2">{blockers.map((item) => <li key={item.id} className="flex gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><span><strong>{item.chemicalName.value || "Unnamed item"}</strong>: {blockerReasons(item).join(", ")}</span></li>)}</ul></div>}<ExportMenu drum={drum} /><label className="mt-4 flex items-center gap-3 font-semibold"><input type="checkbox" className="h-6 w-6" checked={checked} onChange={(e) => setChecked(e.target.checked)} />I have reviewed this inventory.</label><button disabled={blockers.length > 0 || !checked} onClick={() => onUpdate({ ...drum, status: "Completed", finalisedAt: new Date().toISOString() })} className="touch-button mt-3 min-h-14 justify-center bg-emerald-700 text-white disabled:bg-slate-300"><ShieldCheck size={22} />FINALISE DRUM</button></Panel>;
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
  const results = useMemo(() => drums.filter((drum) => [drum.drumId, drum.operatorName, drum.date, ...drum.items.flatMap((item) => [item.chemicalName.value, item.casNumber, item.unNumber])].join(" ").toLowerCase().includes(query.toLowerCase())), [drums, query]);
  return <Panel title="Searchable History"><div className="relative mb-4"><Search className="absolute left-3 top-4 text-slate-500" size={20} /><input className="input pl-11" placeholder="Search drum ID, chemical, date, operator, CAS, UN" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="space-y-3">{results.map((drum) => <DrumListButton key={drum.id} drum={drum} onClick={() => onOpen(drum.id)} onDelete={() => onDelete(drum.id)} />)}</div></Panel>;
}
function ProductDatabase({ products, setProducts }: { products: Product[]; setProducts: (products: Product[]) => void }) {
  const [query, setQuery] = useState("");
  const visible = products.filter((product) => [product.canonicalName, product.manufacturer, product.catalogNumber, product.casNumber, product.unNumber].join(" ").toLowerCase().includes(query.toLowerCase()));
  const update = (product: Product) => setProducts(products.map((current) => current.id === product.id ? product : current));
  const remove = (id: string) => setProducts(products.filter((product) => product.id !== id));
  const add = () => setProducts([{ id: crypto.randomUUID(), canonicalName: "New product", physicalState: "Unknown" }, ...products]);
  return <Panel title="Product Database"><div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-4 text-slate-500" size={20} /><input className="input pl-11" placeholder="Search products, CAS, UN, manufacturer" value={query} onChange={(e) => setQuery(e.target.value)} /></div><button onClick={add} className="touch-button justify-center bg-slate-900 text-white"><Plus size={20} />Add product</button></div><div className="space-y-3">{visible.map((product) => <div key={product.id} className="rounded-lg border border-slate-200 p-4"><div className="grid gap-3 md:grid-cols-3"><Label text="Name"><input className="input" value={product.canonicalName} onChange={(e) => update({ ...product, canonicalName: e.target.value })} /></Label><Label text="Manufacturer"><input className="input" value={product.manufacturer ?? ""} onChange={(e) => update({ ...product, manufacturer: e.target.value })} /></Label><Label text="Catalog"><input className="input" value={product.catalogNumber ?? ""} onChange={(e) => update({ ...product, catalogNumber: e.target.value })} /></Label><Label text="Typical size"><input className="input" type="number" value={product.typicalContainerSize ?? ""} onChange={(e) => update({ ...product, typicalContainerSize: Number(e.target.value) || undefined })} /></Label><Label text="Unit"><select className="input" value={product.unit ?? "L"} onChange={(e) => update({ ...product, unit: e.target.value as Unit })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></Label><Label text="Physical State"><select className="input" value={product.physicalState} onChange={(e) => update({ ...product, physicalState: e.target.value as PhysicalState })}>{states.map((state) => <option key={state}>{state}</option>)}</select></Label><Label text="CAS"><input className="input" value={product.casNumber ?? ""} onChange={(e) => update({ ...product, casNumber: e.target.value })} /></Label><Label text="UN Number"><input className="input" value={product.unNumber ?? ""} onChange={(e) => update({ ...product, unNumber: e.target.value })} /></Label><button onClick={() => remove(product.id)} className="touch-button self-end justify-center border border-red-200 bg-white text-red-700"><Trash2 size={20} />Delete</button></div></div>)}</div></Panel>;
}
function SettingsView({ retention, setRetention, role, resetDemo }: { retention: RetentionPolicy; setRetention: (value: RetentionPolicy) => void; role: Role; resetDemo: () => void }) {
  return <Panel title="Settings"><div className="grid gap-4"><Label text="Image retention"><select className="input" value={retention} onChange={(e) => setRetention(e.target.value as RetentionPolicy)}><option>Delete after processing</option><option>Keep until drum completion</option><option>Keep permanently</option></select></Label><p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Current policy: {retention}. Drum, image preview, product, and setting changes are saved in this browser automatically.</p><button onClick={resetDemo} className="touch-button justify-center border border-slate-300 bg-white"><RotateCcw size={20} />Reset demo data</button><div className="rounded-lg border border-slate-200 p-3"><strong>Role permissions</strong><p className="text-sm text-slate-600">{role}: {role === "Chemist" ? "Create, scan, edit active drums, complete drums, view history." : role === "Supervisor" ? "Chemist permissions plus review all drums." : "Full access including users, products, and settings."}</p></div><Panel title="Audit trail sample"><div className="space-y-2 text-sm">{demoAudit.map((event) => <p key={event.id}><strong>{event.action}</strong> · {event.drumId} · {event.user} · {new Date(event.timestamp).toLocaleString()}</p>)}</div></Panel></div></Panel>;
}

