import type { ThermalReceipt } from "./thermal-receipt.js";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
function documentHtml(content: string, width: number) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}html,body{width:${width}px;background:#fff;color:#000}
    main{width:${width}px;padding:16px 20px;font:24px/1.2 "Courier New",monospace;overflow-wrap:anywhere}
    header{text-align:center;font-weight:bold;margin-bottom:24px}.row{margin:10px 0}
    .blank{display:flex;gap:16px;margin-top:28px}.line{flex:1;border-bottom:2px solid #000;height:28px}
    .notice{margin-top:24px}p{white-space:pre-wrap;margin:20px 0}
    </style></head><body><main>${content}</main></body></html>`;
}
export function tripReceiptHtml(
  receipt: ThermalReceipt,
  guard: boolean,
  width = 576,
  printedAt = new Date(),
) {
  const row = (label: string, value: string) =>
    `<div class="row">${label} ${escape(value)}</div>`;
  return documentHtml(
    `<header>EMB Capital Lending Corporation<br>Trip Ticket<br>${guard ? "Guards' Copy" : "Requester's Copy"}</header>
    ${row("Ticket No.:", receipt.ticketId)}${row("Date & Time Printed:", printedAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" }))}
    ${row("Name of Employee:", receipt.employee)}${row("Trip Destination:", receipt.destination)}
    ${guard ? `${row("Vehicle Plate No.:", receipt.vehicle)}<div class="blank">Mileage Before:<span class="line"></span></div><div class="blank">Mileage After:<span class="line"></span></div>` : ""}`,
    width,
  );
}
export function credentialsReceiptHtml(
  account: { email: string; password: string },
  width = 576,
) {
  return documentHtml(
    `<header>EMB Capital Lending Corporation<br>Account Registry<br>Temporary Password</header>
    <p>Email:<br>${escape(account.email)}</p><p>Password:<br>${escape(account.password)}</p>
    <div class="notice">CAUTION: Keep this temporary password private. Give this receipt only to the account holder and destroy it after the credentials are secured.</div>`,
    width,
  );
}
