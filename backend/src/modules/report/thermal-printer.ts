import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { ENV } from "../../config/env.js";
import { AppError } from "../../middlewares/error.middleware.js";
import type { ThermalReceipt } from "./thermal-receipt.js";
import { tripReceiptHtml, credentialsReceiptHtml } from "./receipt-template.js";
import { renderReceiptCopies } from "./receipt-renderer.js";
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
export function printThermalReceipt(receipt: ThermalReceipt) {
  const printedAt = new Date();
  return printCopies(
    [true, false].map((guard) =>
      tripReceiptHtml(receipt, guard, ENV.EMB_RECEIPT_WIDTH_DOTS, printedAt),
    ),
  );
}
export function printAccountCredentials(account: {
  email: string;
  password: string;
}) {
  return printCopies([
    credentialsReceiptHtml(account, ENV.EMB_RECEIPT_WIDTH_DOTS),
  ]);
}
function printCopies(copies: string[]) {
  if (!ENV.EMB_RECEIPT_HOST && process.platform !== "win32")
    return Promise.reject(
      new AppError(
        503,
        "Configure a network receipt printer, or run the print service on the Windows computer connected to the printer.",
      ),
    );
  if (pending >= 20)
    return Promise.reject(
      new AppError(
        503,
        "The receipt print queue is full. Please try again shortly.",
      ),
    );
  pending += 1;
  const job = queue.then(async () => {
    try {
      const bytes = await renderReceiptCopies(
        copies,
        ENV.EMB_RECEIPT_WIDTH_DOTS,
        ENV.EMB_PRINT_BROWSER_PATH,
        ENV.EMB_PRINT_NO_SANDBOX,
      );
      if (ENV.EMB_RECEIPT_HOST)
        await sendToNetworkPrinter(
          bytes,
          ENV.EMB_RECEIPT_HOST,
          ENV.EMB_RECEIPT_PORT,
        );
      else await sendToWindowsPrinter(bytes);
      return { mode: "direct" as const };
    } catch (error) {
      throw new AppError(
        502,
        `Receipt printing failed. Check the printer before retrying to avoid duplicate copies. ${error instanceof Error ? error.message : ""}`,
      );
    } finally {
      pending -= 1;
    }
  });
  queue = job.catch(() => undefined);
  return job;
}
export function sendToNetworkPrinter(
  bytes: Buffer,
  host: string,
  port: number,
) {
  return new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(15000);
    socket.once("timeout", () =>
      socket.destroy(new Error("The receipt printer connection timed out.")),
    );
    socket.once("error", reject);
    socket.once("connect", () => socket.end(bytes));
    socket.once("close", (hadError) => {
      if (!hadError) resolve();
    });
  });
}
async function sendToWindowsPrinter(bytes: Buffer) {
  const directory = await mkdtemp(path.join(tmpdir(), "emb-receipt-"));
  try {
    const dataPath = path.join(directory, "receipt.bin");
    await writeFile(dataPath, bytes, { mode: 0o600 });
    const candidates = [
      "../../../scripts/print-raw-receipt.ps1",
      "../../../../scripts/print-raw-receipt.ps1",
    ].map((relative) => fileURLToPath(new URL(relative, import.meta.url)));
    const script = candidates.find((candidate) => existsSync(candidate));
    if (!script)
      throw new Error("The Windows receipt printer helper is missing.");
    await new Promise<void>((resolve, reject) => {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          script,
          "-PrinterName",
          ENV.EMB_RECEIPT_PRINTER || "EPSON TM-T82 Receipt",
          "-DataPath",
          dataPath,
        ],
        { windowsHide: true, timeout: 30000 },
        (error) => {
          if (!error) return resolve();
          const printer = ENV.EMB_RECEIPT_PRINTER || "EPSON TM-T82 Receipt";
          if (error.code === 2)
            return reject(
              new Error(
                `Windows cannot find "${printer}". Install the thermal printer's driver and set EMB_RECEIPT_PRINTER to its exact Windows printer name.`,
              ),
            );
          if (error.code === 4)
            return reject(
              new Error(
                "Windows could not read the installed printers. Run the backend with an account that has printer access.",
              ),
            );
          reject(
            new Error(
              `Windows could not send the receipt to "${printer}". Check its connection, power, and print queue.`,
            ),
          );
        },
      );
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
