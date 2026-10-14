# Thermal receipt printing

The app prints two 80 mm trip slips on departure: a Guards' Copy (vehicle plate and mileage blanks) and a Requester's Copy. Staff can print the pair again from ticket details. New account creation also prints the legacy temporary-credentials slip.

## Browser printing (default, including Docker deployments)

Leave `EMB_RECEIPT_PRINTER` unset on the backend. The browser prints on the computer running the kiosk. Install the thermal printer's Windows driver, choose 80 mm roll paper, and enable cutting after each job. The two trip copies run as separate jobs, waiting for each browser print operation to finish.

For silent kiosk printing, close any browser already using the dedicated kiosk profile, then run `frontend/Start-EMB-Kiosk.bat`. Edit its URL for your deployed frontend and its printer name if necessary (default: `EPSON TM-T100 Receipt`). The launcher configures that printer as the Windows default and opens Chrome or Edge with a dedicated profile and silent printing enabled. In a regular browser, print dialogs appear for each copy; disable headers and footers and select the thermal printer.

## Direct Windows printing (legacy ESC/POS mode)

Run the backend on the Windows computer with the printer installed, from the `backend` directory. Set this in `backend/.env`, then restart the backend:

```dotenv
EMB_RECEIPT_PRINTER=EPSON TM-T100 Receipt
```

The backend sends ESC/POS data through the Windows print spooler using `backend/scripts/print-raw-receipt.ps1`. Both trip slips include a cut command. This mode prints at the backend host; it is unavailable inside the Linux Docker image. Keep the variable unset when using Docker or a remote backend without the kiosk printer.

Departure and account creation stay saved if printing fails. Check the printer before retrying; an accepted spool job does not confirm physical paper output. Staff can reprint trip slips without recording departure again. Browser cancellation cannot be distinguished from a completed print dialog.

## Session expiry

Staff sessions are verified on page entry, every 15 seconds while visible, and when the browser regains focus or visibility. A 401 from a protected API request or CSV download immediately clears the staff session; existing route guards return the user to the login page (`/`). Failed login attempts, RFID errors, 403 permission denials and temporary network failures do not trigger logout. The public RFID kiosk continues to use its separate card proof.
