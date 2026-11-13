const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = path.join(root, "assets", "conversions.json");
const destination = path.join(root, "src", "shared", "conversion-templates.generated.ts");
const templates = JSON.parse(fs.readFileSync(source, "utf8"));

if (
  !Array.isArray(templates) ||
  templates.some(
    (item) =>
      !item ||
      typeof item.id !== "string" ||
      typeof item.label !== "string" ||
      !Number.isFinite(item.minutes) ||
      typeof item.emoji !== "string" ||
      typeof item.plural !== "string"
  )
) {
  throw new Error("Conversion templates have an invalid shape.");
}

const output = `// Generated from assets/conversions.json by scripts/generate-conversions.cjs.\nexport const CONVERSION_TEMPLATES = ${JSON.stringify(templates, null, 2)} as const;\n`;
if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== output) {
  fs.writeFileSync(destination, output, "utf8");
}
