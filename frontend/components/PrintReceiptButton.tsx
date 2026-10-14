"use client";
import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { reportService } from "@/services/report.service";
import { printBrowserReceipt } from "@/services/thermal-print";
export function DownloadReportButton() {
  return (
    <button
      className="btn secondary"
      onClick={() =>
        reportService
          .downloadCsv()
          .catch((e) =>
            alert(e instanceof Error ? e.message : "Download failed."),
          )
      }
    >
      <Download /> Download CSV
    </button>
  );
}
export function PrintReceiptButton({ ticketId }: { ticketId: string }) {
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    if (printing) return;
    setPrinting(true);
    setError("");
    try {
      const result = await reportService.print(ticketId);
      if (result.mode === "browser" && result.receipt)
        await printBrowserReceipt(result.receipt);
      if (result.mode === "error")
        throw new Error(result.error || "Receipt printing failed.");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Receipt could not be printed.",
      );
    } finally {
      setPrinting(false);
    }
  };
  return (
    <>
      <button className="btn secondary" onClick={print} disabled={printing}>
        <Printer /> {printing ? "Printing…" : "Print receipt"}
      </button>
      {error && <small role="alert">{error}</small>}
    </>
  );
}
