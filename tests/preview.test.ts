import assert from "node:assert/strict";
import test from "node:test";
import { renderCard } from "../src/main/card";
import { emptyDay } from "../src/shared/aggregation";
import { pngDataUrlToBlob } from "../src/renderer/card-preview";

test("renderer turns a generated card into a valid local PNG Blob for preview", async () => {
  const png = renderCard(emptyDay(), "story", "day");
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const blob = pngDataUrlToBlob(dataUrl);
  assert.equal(blob.type, "image/png");
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), 1080);
  assert.equal(bytes.readUInt32BE(20), 1920);
  assert.throws(() => pngDataUrlToBlob("data:image/jpeg;base64,AAAA"), /valid PNG data URL/);
});
