import { PNG } from "pngjs";
// Short GS v 0 strips avoid overflowing the legacy Epson's image buffer.
export function pngToEscPos(png: Uint8Array, expectedWidth: number) {
  const image = PNG.sync.read(Buffer.from(png));
  if (image.width !== expectedWidth || image.height < 1 || image.height > 10000)
    throw new Error("Receipt dimensions exceed the thermal printer's limits.");
  const rowBytes = Math.ceil(image.width / 8);
  const commands: Buffer[] = [Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0])];
  for (let top = 0; top < image.height; top += 128) {
    const height = Math.min(128, image.height - top);
    const raster = Buffer.alloc(rowBytes * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < image.width; x++) {
        const offset = ((top + y) * image.width + x) * 4;
        const alpha = image.data[offset + 3]! / 255;
        const luminance =
          (0.299 * image.data[offset]! +
            0.587 * image.data[offset + 1]! +
            0.114 * image.data[offset + 2]!) *
            alpha +
          255 * (1 - alpha);
        if (luminance < 160)
          raster[y * rowBytes + (x >> 3)]! |= 0x80 >> (x % 8);
      }
    }
    commands.push(
      Buffer.from([
        0x1d,
        0x76,
        0x30,
        0,
        rowBytes & 255,
        rowBytes >> 8,
        height & 255,
        height >> 8,
      ]),
      raster,
    );
  }
  // Feed only to the cutter position, with zero additional margin (GS V 65 0).
  commands.push(Buffer.from([0x1d, 0x56, 65, 0]));
  return Buffer.concat(commands);
}
