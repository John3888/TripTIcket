import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import path from "node:path";
import { pngToEscPos } from "./receipt-raster.js";
export function receiptBrowserPath(configuredPath = "") {
  if (configuredPath) return configuredPath;
  const candidates =
    process.platform === "win32"
      ? [
          path.join(
            process.env.ProgramFiles || "C:/Program Files",
            "Google/Chrome/Application/chrome.exe",
          ),
          path.join(
            process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)",
            "Microsoft/Edge/Application/msedge.exe",
          ),
          path.join(
            process.env.LOCALAPPDATA || "",
            "Google/Chrome/Application/chrome.exe",
          ),
        ]
      : [
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/google-chrome",
        ];
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable)
    throw new Error(
      "Chrome or Chromium is required for receipt printing. Set EMB_PRINT_BROWSER_PATH to its executable.",
    );
  return executable;
}
export async function renderReceiptCopies(
  htmlCopies: string[],
  width: number,
  browserPath = "",
  noSandbox = false,
) {
  const browser = await puppeteer.launch({
    executablePath: receiptBrowserPath(browserPath),
    headless: true,
    args: noSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
    timeout: 15000,
    protocolTimeout: 15000,
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setJavaScriptEnabled(false);
    await page.setViewport({ width, height: 600, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void request.abort();
    });
    const copies: Buffer[] = [];
    for (const html of htmlCopies) {
      await page.setContent(html, { waitUntil: "load", timeout: 10000 });
      const receipt = await page.$("main");
      const bounds = await receipt?.boundingBox();
      if (!bounds || bounds.height > 10000)
        throw new Error("Receipt is too long to print.");
      const png = await page.screenshot({ type: "png", fullPage: true });
      copies.push(pngToEscPos(png, width));
    }
    return Buffer.concat(copies);
  } finally {
    await browser.close();
  }
}
