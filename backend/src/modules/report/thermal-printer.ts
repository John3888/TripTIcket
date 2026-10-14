import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ENV } from "../../config/env.js";
import { AppError } from "../../middlewares/error.middleware.js";
import {
  thermalReceiptBytes,
  accountCredentialsBytes,
  type ThermalReceipt,
} from "./thermal-receipt.js";

export const usesRawPrinter = () => Boolean(ENV.EMB_RECEIPT_PRINTER);
let queue: Promise<void> = Promise.resolve();

export async function printThermalReceipt(receipt: ThermalReceipt) {
  return printRawBytes(thermalReceiptBytes(receipt));
}

export async function printAccountCredentials(account: {
  email: string;
  password: string;
}) {
  return printRawBytes(accountCredentialsBytes(account));
}

async function printRawBytes(bytes: Buffer) {
  if (!usesRawPrinter()) return { mode: "browser" as const };
  if (process.platform !== "win32")
    throw new AppError(
      503,
      "Direct receipt printing requires a Windows backend. Use browser printing on the kiosk instead.",
    );
  const job = queue.then(async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "emb-receipt-"));
    try {
      const dataPath = path.join(directory, "receipt.bin");
      await writeFile(dataPath, bytes, { mode: 0o600 });
      await new Promise<void>((resolve, reject) => {
        execFile(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path.resolve("scripts/print-raw-receipt.ps1"),
            "-PrinterName",
            ENV.EMB_RECEIPT_PRINTER,
            "-DataPath",
            dataPath,
          ],
          { windowsHide: true, timeout: 30000 },
          (error) => (error ? reject(error) : resolve()),
        );
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  queue = job.catch(() => undefined);
  try {
    await job;
  } catch {
    throw new AppError(
      502,
      "The receipt could not be sent to the printer. Check the printer before retrying to avoid duplicate copies.",
    );
  }
  return { mode: "raw" as const };
}
