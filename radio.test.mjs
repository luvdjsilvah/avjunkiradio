import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(readFileSync(new URL("./radio.js", import.meta.url), "utf8"), context);

test("a drop plays only in its assigned programmed stations", () => {
  const drops = [
    { src: "new.mp3", pool: "nightlife", genres: '["hip-hop","house"]' },
    { src: "legacy.mp3", pool: "nightlife", genres: "" },
    { src: "gospel.mp3", pool: "gospel", genres: '["gospel"]' }
  ];
  const routed = vm.runInContext("routeStationIds", context)(drops);
  const sources = (station) => routed[station].map((drop) => drop.src);
  assert.deepEqual(sources("lobby"), []);
  assert.deepEqual(sources("hip-hop"), ["new.mp3", "legacy.mp3"]);
  assert.deepEqual(sources("rnb"), ["legacy.mp3"]);
  assert.deepEqual(sources("house"), ["new.mp3", "legacy.mp3"]);
  assert.deepEqual(sources("reggae"), []);
  assert.deepEqual(sources("gospel"), ["gospel.mp3"]);
  assert.deepEqual(Object.keys(routed).sort(),
    ["lobby", "hip-hop", "rnb", "house", "reggae", "gospel"].sort());
});
