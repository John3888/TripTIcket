export type ThermalReceipt = {
  ticketId: string;
  employee: string;
  vehicle: string;
  destination: string;
};

// Strip control bytes so ticket text cannot inject ESC/POS commands.
const clean = (value: string) =>
  value.normalize("NFKD").replace(/[^\x20-\x7e]/g, " ");

export function wrapReceiptText(value: string, width = 42): string[] {
  const words = clean(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let word of words) {
    if (line && line.length + word.length + 1 <= width) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    while (word.length > width) {
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

export function thermalReceiptBytes(
  receipt: ThermalReceipt,
  printedAt = new Date(),
) {
  const copies = ["Guards' Copy", "Requester's Copy"];
  return Buffer.concat(
    copies.map((label, index) => {
      const text = [
        `Ticket No.: ${receipt.ticketId}`,
        `Date & Time Printed: ${printedAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`,
        `Name of Employee: ${receipt.employee}`,
        `Trip Destination: ${receipt.destination}`,
      ].flatMap((line) => wrapReceiptText(line));
      if (index === 0)
        text.push(
          "",
          ...wrapReceiptText(`Vehicle Plate No.: ${receipt.vehicle}`),
          "",
          "Mileage Before: ____________________",
          "",
          "Mileage After:  ____________________",
        );
      return Buffer.concat([
        Buffer.from([0x1b, 0x40, 0x1b, 0x61, 1, 0x1b, 0x45, 1]),
        Buffer.from(
          `EMB Capital Lending Corporation\nTrip Ticket\n${label}\n`,
          "ascii",
        ),
        Buffer.from([0x1b, 0x45, 0, 0x1b, 0x61, 0]),
        Buffer.from(`\n${text.join("\n")}\n\n\n\n\n`, "ascii"),
        Buffer.from([0x1d, 0x56, 0, 0x0a]),
      ]);
    }),
  );
}

export function accountCredentialsBytes(account: {
  email: string;
  password: string;
}) {
  const lines = [
    "Email:",
    ...wrapReceiptText(account.email),
    "",
    "Password:",
    ...wrapReceiptText(account.password),
    "",
    ...wrapReceiptText(
      "CAUTION: Keep this temporary password private. Give this receipt only to the account holder and destroy it after the credentials are secured.",
    ),
  ];
  return Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x61, 1, 0x1b, 0x45, 1]),
    Buffer.from(
      "EMB Capital Lending Corporation\nAccount Registry\nTemporary Password\n",
      "ascii",
    ),
    Buffer.from([0x1b, 0x45, 0, 0x1b, 0x61, 0]),
    Buffer.from(`\n${lines.join("\n")}\n\n\n\n\n`, "ascii"),
    Buffer.from([0x1d, 0x56, 0, 0x0a]),
  ]);
}
