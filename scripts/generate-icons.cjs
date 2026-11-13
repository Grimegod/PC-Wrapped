const fs = require("node:fs");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");

const root = path.join(__dirname, "..");
const iconDirectory = path.join(root, "assets");
const msixDirectory = path.join(root, "build", "appx");
fs.mkdirSync(iconDirectory, { recursive: true });
fs.mkdirSync(msixDirectory, { recursive: true });

function drawIcon(size, height = size) {
  const canvas = createCanvas(size, height);
  const ctx = canvas.getContext("2d");
  // Fill the canvas with the mark's background colour, then draw the mark scaled to fit the
  // smaller dimension so a wide tile is not stretched.
  const scale = Math.min(size, height) / 256;
  ctx.fillStyle = "#3a2a2e";
  ctx.fillRect(0, 0, size, height);
  ctx.translate((size - 256 * scale) / 2, (height - 256 * scale) / 2);
  ctx.scale(scale, scale);

  const background = ctx.createLinearGradient(18, 12, 238, 244);
  background.addColorStop(0, "#765047");
  background.addColorStop(0.52, "#4b3438");
  background.addColorStop(1, "#2f3430");
  ctx.fillStyle = background;
  roundedRect(ctx, 8, 8, 240, 240, 58);
  ctx.fill();

  const orbits = [
    { angle: 0, color: "#fff2e4" },
    { angle: Math.PI / 3, color: "#b7dfc4" },
    { angle: -Math.PI / 3, color: "#efad94" }
  ];
  for (const orbit of orbits) {
    ctx.beginPath();
    ctx.ellipse(128, 128, 88, 39, orbit.angle, 0, Math.PI * 2);
    ctx.strokeStyle = orbit.color;
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = 12;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#f4c58c";
  circle(ctx, 128, 128, 19);
  ctx.fillStyle = "#fff2e4";
  circle(ctx, 122, 122, 6);
  for (const point of [
    [216, 128],
    [84, 52],
    [84, 204]
  ]) {
    ctx.fillStyle = "#fff2e4";
    circle(ctx, point[0], point[1], 13);
    ctx.fillStyle = "#efad94";
    circle(ctx, point[0] - 2, point[1] - 2, 5);
  }
  return canvas.toBuffer("image/png");
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function circle(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function pngToIcon(entries) {
  const headerSize = 6 + entries.length * 16;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  entries.forEach((entry, index) => {
    const position = 6 + index * 16;
    header.writeUInt8(entry.size === 256 ? 0 : entry.size, position);
    header.writeUInt8(entry.size === 256 ? 0 : entry.size, position + 1);
    header.writeUInt8(0, position + 2);
    header.writeUInt8(0, position + 3);
    header.writeUInt16LE(1, position + 4);
    header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(entry.image.length, position + 8);
    header.writeUInt32LE(offset, position + 12);
    offset += entry.image.length;
  });
  return Buffer.concat([header, ...entries.map((entry) => entry.image)]);
}

const sizes = [16, 32, 48, 256].map((size) => ({ size, image: drawIcon(size) }));
fs.writeFileSync(path.join(iconDirectory, "pc-wrapped.png"), drawIcon(256));
fs.writeFileSync(path.join(iconDirectory, "pc-wrapped-tray.png"), drawIcon(64));
fs.writeFileSync(path.join(iconDirectory, "pc-wrapped.ico"), pngToIcon(sizes));
fs.writeFileSync(path.join(msixDirectory, "StoreLogo.png"), drawIcon(50));
fs.writeFileSync(path.join(msixDirectory, "Square44x44Logo.png"), drawIcon(44));
fs.writeFileSync(path.join(msixDirectory, "Square150x150Logo.png"), drawIcon(150));
// Wide tile art. Microsoft requires exact pixel sizes for these; a square image fails WACK.
fs.writeFileSync(path.join(msixDirectory, "Wide310x150Logo.png"), drawIcon(310, 150));
fs.writeFileSync(path.join(msixDirectory, "Square310x310Logo.png"), drawIcon(310));
fs.writeFileSync(path.join(msixDirectory, "Square71x71Logo.png"), drawIcon(71));
fs.writeFileSync(path.join(msixDirectory, "SmallTile.png"), drawIcon(71));
fs.writeFileSync(path.join(msixDirectory, "LargeTile.png"), drawIcon(310));
