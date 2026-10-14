import type { Receipt } from "./report.service";

const safe = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export function receiptCopyHtml(
  receipt: Receipt,
  guard: boolean,
  printedAt = new Date(),
) {
  const row = (label: string, value: unknown) =>
    `<div class="row">${safe(label)} <span>${safe(value)}</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Trip Ticket</title><style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box;margin:0;padding:0}
    html,body{width:80mm;background:white;color:black;font:8.8pt/1.15 "Courier New",monospace}
    main{width:80mm;padding:2mm 4mm 0;break-inside:avoid}header{text-align:center;margin-bottom:3mm}
    .row{margin:1.1mm 0;overflow-wrap:anywhere}.blank{display:flex;gap:2mm;margin-top:3mm}
    .line{flex:1;border-bottom:1px solid black;height:4mm}.feed{height:${guard ? 38 : 46}mm}
    </style></head><body><main><header><b>EMB Capital Lending Corporation<br>Trip Ticket<br>${guard ? "Guards' Copy" : "Requester's Copy"}</b></header>
    ${row("Ticket No.:", receipt.ticketId)}${row("Date & Time Printed:", printedAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" }))}
    ${row("Name of Employee:", receipt.employee)}${row("Trip Destination:", receipt.destination)}
    ${guard ? `${row("Vehicle Plate No.:", receipt.vehicle)}<div class="blank">Mileage Before:<span class="line"></span></div><div class="blank">Mileage After:<span class="line"></span></div>` : ""}
    <div class="feed"></div></main></body></html>`;
}

function printJob(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
    document.body.appendChild(frame);
    const win = frame.contentWindow;
    if (!win) {
      frame.remove();
      reject(new Error("The print window could not be opened."));
      return;
    }
    let finished = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      win.onafterprint = null;
      window.setTimeout(() => frame.remove(), 1500);
    };
    const timeout = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(
        new Error(
          "Printing was not confirmed by the browser. Check the printer before trying again.",
        ),
      );
    }, 120000);
    win.onafterprint = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };
    try {
      win.document.open();
      win.document.write(html);
      win.document.close();
      window.setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          finished = true;
          cleanup();
          reject(new Error("The receipt could not be printed."));
        }
      }, 400);
    } catch {
      finished = true;
      cleanup();
      reject(new Error("The receipt could not be prepared."));
    }
  });
}

let printQueue: Promise<void> = Promise.resolve();
export function printBrowserCredentials(account: {
  email: string;
  password: string;
}) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Account Registry</title><style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box}body{width:80mm;margin:0;padding:2mm 4mm 35mm;color:black;background:white;font:8.8pt/1.15 "Courier New",monospace;overflow-wrap:anywhere}header{text-align:center}p{white-space:pre-wrap}
    </style></head><body><header><b>EMB Capital Lending Corporation<br>Account Registry<br>Temporary Password</b></header>
    <p>Email:<br>${safe(account.email)}</p><p>Password:<br>${safe(account.password)}</p>
    <p>CAUTION: Keep this temporary password private. Give this receipt only to the account holder and destroy it after the credentials are secured.</p></body></html>`;
  const job = printQueue.then(() => printJob(html));
  printQueue = job.catch(() => undefined);
  return job;
}
export function printBrowserReceipt(receipt: Receipt) {
  const printedAt = new Date();
  const job = printQueue.then(async () => {
    await printJob(receiptCopyHtml(receipt, true, printedAt));
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    await printJob(receiptCopyHtml(receipt, false, printedAt));
  });
  printQueue = job.catch(() => undefined);
  return job;
}
