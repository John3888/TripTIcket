"use client";
import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { reportService } from "@/services/report.service";
export function DownloadReportButton() {
  return (
    <button
      className="btn secondary"
      onClick={() =>
        reportService
          .downloadCsv()
          .catch((e) => alert(e instanceof Error ? e.message : "Download failed."))
      }
    >
      <Download /> Download CSV
    </button>
  );
}
export function PrintReceiptButton({ ticketId }: { ticketId: string }) {
  const [error, setError] = useState("");
  const print = async () => {
    setError("");
    const win = window.open("", "_blank", "width=760,height=900");
    if (!win) return setError("Allow pop-ups to print this receipt.");
    try {
      const r = await reportService.receipt(ticketId),
        row = (l: string, v: unknown) => `<tr><th>${safe(l)}</th><td>${safe(v ?? "—")}</td></tr>`;
      win.document.write(
        `<!doctype html><html><head><title>${safe(r.ticketId)} Receipt</title><style>body{font:14px Segoe UI,sans-serif;color:#17201a;padding:36px}header{border-bottom:4px solid #063f0d;padding-bottom:18px;margin-bottom:24px}h1{color:#063f0d}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:11px;border-bottom:1px solid #dbe5dd}th{width:32%;color:#063f0d}@media print{body{padding:0}}</style></head><body><header><h1>EMB Trip Ticket Receipt</h1><small>Official browser-generated copy</small></header><table>${row("Ticket", r.ticketId)}${row("Status", r.status)}${row("Employee", r.employee)}${row("Vehicle", r.vehicle)}${row("Destination", r.destination)}${row("Purpose", r.purpose)}${row("Requested", r.requestedAt)}${row("Department head", r.supervisor)}${row("HR head", r.humanResources)}${row("Approved by", r.approvedBy)}${row("Departure", r.departure)}${row("Arrival", r.arrival)}</table><p><small>Physical raw-printer configuration is managed externally on the kiosk host.</small></p></body></html>`,
      );
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 250);
    } catch (e) {
      win.close();
      setError(e instanceof Error ? e.message : "Receipt could not be loaded.");
    }
  };
  return (
    <>
      <button className="btn secondary" onClick={print}>
        <Printer /> Print receipt
      </button>
      {error && <small role="alert">{error}</small>}
    </>
  );
}
function safe(v: unknown) {
  return String(v).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
