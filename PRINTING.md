# Silent thermal printing with Puppeteer

Confirming departure automatically prints the Guards' Copy and Requester's Copy, with a cut between them. Staff reprints use the same path. Creating an account prints one temporary-credentials slip. Arrival does not print.

Puppeteer renders the receipt HTML in headless Chrome, converts it to a monochrome image, and sends ESC/POS raster data to the thermal printer. Nothing calls `window.print()`, creates a print iframe, opens a PDF viewer, or shows a browser print panel. Failed jobs show an error; the app never falls back to a print dialog. Departure and account creation remain saved after a printing error.

## Windows backend with a USB printer

Install the Epson driver and Chrome (Edge is also detected). Run the backend on the Windows computer connected to the printer. Set the exact Windows printer name in `backend/.env`, then restart the backend:

```dotenv
EMB_RECEIPT_PRINTER=EPSON TM-T82 Receipt
EMB_RECEIPT_WIDTH_DOTS=576
```

`EPSON TM-T82 Receipt` is also the default if the printer setting is omitted or empty. The app targets this printer by name, independently of the Windows default printer. The existing Windows raw spooler helper delivers the Puppeteer-rendered receipts and their cut commands.

Chrome/Edge is detected automatically. If needed, set its absolute executable path:

```dotenv
EMB_PRINT_BROWSER_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe
```

No kiosk printing flags are required. The optional `frontend/Start-EMB-Kiosk.bat` opens the kiosk fullscreen; edit its URL for your deployment.

## Ethernet thermal printer, including Docker

Set the reachable IP and raw printing port of an ESC/POS-compatible thermal printer:

```dotenv
EMB_RECEIPT_HOST=192.168.1.50
EMB_RECEIPT_PORT=9100
EMB_RECEIPT_WIDTH_DOTS=576
```

The network destination takes precedence over the Windows printer name. The API Docker image includes Chromium and fonts, runs as its existing non-root user, and sets `EMB_PRINT_NO_SANDBOX=true` for Chromium inside the container. The receipt renderer disables JavaScript and blocks page network requests. Rebuild the API image after this change. Docker printing requires a printer address reachable from the container.

A hosted or Docker backend cannot access a USB printer merely because it is attached to the browser's computer. For USB printing, run the backend on the Windows printer host; a separate kiosk with a remote backend would need a local print service. There is no automatic browser fallback.

## Operation and verification

Jobs are serialized so transactions cannot interleave their receipt copies. Both trip copies finish rendering before any data is sent. Each slip is sent in short image strips and ends with paper feed and a cut. The default 576-dot width targets the printable area of an 80 mm roll at 203 dpi. Configure another multiple of eight (384–832 dots) if required by your printer. Temporary credentials are not persisted as PDFs or images; Windows spool input files are deleted after the job.

Accepted spool/network data does not confirm physical paper output. Check the printer before retrying to avoid duplicate copies. Reprint trip slips from staff ticket details without recording departure again.

`npm test` in the backend checks template escaping, raster bytes, cuts, and an end-to-end Puppeteer job against a loopback test printer. The integration test also verifies recovery after a rendering failure and credential receipt output; it skips when Chrome/Chromium is not installed. No test sends data to the physical printer. Frontend tests cover arrival confirmation and session expiry.

References: [Puppeteer screenshot API](https://pptr.dev/api/puppeteer.page.screenshot), [Puppeteer browser launch](https://pptr.dev/api/puppeteer.puppeteernode.launch), [Epson ESC/POS raster format](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lv_0.html).

## Session expiry

Staff sessions are verified on page entry, every 15 seconds while visible, and when the browser regains focus or visibility. A 401 from a protected API request or CSV download clears the staff session and returns the user to login. Failed login attempts, RFID proof errors, permission denials, and temporary connection failures do not trigger logout.
