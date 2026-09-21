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
    Status: item.status,
  }));
}

function summaryRows(drum: Drum) {
  return [
    ["Drum ID", drum.drumId],
    ["Drum size", drum.size],
    ["Operator", drum.operatorName],
    ["Date", drum.date],
    ["Status", drum.status],
    ["Unique inventory lines", String(drum.items.length)],
    ["Total containers", String(totalContainers(drum))],
    ["Finalised at", drum.finalisedAt ? new Date(drum.finalisedAt).toLocaleString() : ""],
  ];
}

export function downloadCsv(drum: Drum) {
  const rows = inventoryRows(drum);
  const headers = Object.keys(rows[0] ?? { Chemical: "", Quantity: "", "Container Size": "", "Physical State": "", Status: "" });
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => JSON.stringify(String(row[header as keyof typeof row] ?? ""))).join(","))].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${drum.drumId}-inventory.csv`);
}

export function downloadPdf(drum: Drum) {
  const doc = new jsPDF();
  doc.setFillColor(4, 120, 87);
  doc.rect(0, 0, 210, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("LAB SMALLS INVENTORY", 14, 14);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(`Drum ID: ${drum.drumId}`, 14, 32);
  doc.text(`Drum size: ${drum.size}`, 14, 38);
  doc.text(`Operator: ${drum.operatorName}`, 14, 44);
  doc.text(`Date: ${drum.date}`, 14, 50);
  doc.text(`Number of containers: ${totalContainers(drum)}`, 14, 56);
  autoTable(doc, {
    startY: 66,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [4, 120, 87], textColor: 255 },
    head: [["Chemical", "Quantity", "Container Size", "Physical State"]],
    body: drum.items.map((item) => [
      item.chemicalName.value ?? "",
      item.quantity.value ?? "",
      `${item.containerSize.value ?? ""} ${item.unit.value ?? ""}`.trim(),
      item.physicalState.value ?? "",
    ]),
  });
  const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90;
  doc.setFontSize(11);
  doc.text("Operator confirmation", 14, y + 12);
  doc.setFontSize(10);
  doc.text("Checked by:", 14, y + 18);
  doc.text("Signature:", 14, y + 30);
  doc.text("Date:", 14, y + 42);
  doc.save(`${drum.drumId}-inventory.pdf`);
}

export function downloadXlsx(drum: Drum) {
  const wb = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet(summaryRows(drum));
  const ws = XLSX.utils.json_to_sheet(inventoryRows(drum));
  XLSX.utils.book_append_sheet(wb, summary, "Summary");
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
