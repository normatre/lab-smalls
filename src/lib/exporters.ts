import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { Drum } from "@/types/lab-smalls";
import { totalContainers } from "@/lib/inventory";

export function inventoryRows(drum: Drum) {
  return drum.items.map((item) => ({
    Chemical: item.chemicalName.value ?? "",
    Quantity: item.quantity.value ?? "",
    "Container Size": `${item.containerSize.value ?? ""} ${item.unit.value ?? ""}`.trim(),
    "Physical State": item.physicalState.value ?? "",
    CAS: item.casNumber ?? "",
    "UN Number": item.unNumber ?? "",
    Status: item.status,
  }));
}

export function downloadCsv(drum: Drum) {
  const rows = inventoryRows(drum);
  const headers = Object.keys(rows[0] ?? { Chemical: "", Quantity: "", "Container Size": "", "Physical State": "", CAS: "", "UN Number": "", Status: "" });
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => JSON.stringify(String(row[header as keyof typeof row] ?? ""))).join(","))].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${drum.drumId}-inventory.csv`);
}

export function downloadPdf(drum: Drum) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("LAB SMALLS INVENTORY", 14, 18);
  doc.setFontSize(10);
  doc.text(`Drum ID: ${drum.drumId}`, 14, 28);
  doc.text(`Drum size: ${drum.size}`, 14, 34);
  doc.text(`Operator: ${drum.operatorName}`, 14, 40);
  doc.text(`Date: ${drum.date}`, 14, 46);
  doc.text(`Number of containers: ${totalContainers(drum)}`, 14, 52);
  autoTable(doc, {
    startY: 60,
    head: [["Chemical", "Quantity", "Container Size", "Physical State", "CAS", "UN Number"]],
    body: drum.items.map((item) => [
      item.chemicalName.value ?? "",
      item.quantity.value ?? "",
      `${item.containerSize.value ?? ""} ${item.unit.value ?? ""}`.trim(),
      item.physicalState.value ?? "",
      item.casNumber ?? "",
      item.unNumber ?? "",
    ]),
  });
  const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90;
  doc.text("Checked by:", 14, y + 18);
  doc.text("Signature:", 14, y + 30);
  doc.text("Date:", 14, y + 42);
  doc.save(`${drum.drumId}-inventory.pdf`);
}

export function downloadXlsx(drum: Drum) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(inventoryRows(drum));
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  XLSX.writeFile(wb, `${drum.drumId}-inventory.xlsx`);
}

export function openPrintView() {
  window.print();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
