"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const clientDirectory = path.resolve(__dirname, "../../client");

test("a versão móvel não oculta o diálogo modal que abre no começo da partida", () => {
  const css = fs.readFileSync(path.join(clientDirectory, "styles.css"), "utf8");
  const javascript = fs.readFileSync(path.join(clientDirectory, "app.js"), "utf8");
  assert.equal(/#game-view\s*\+\s*\*\s*\{[^}]*display\s*:\s*none/i.test(css), false);
  assert.equal(/getComputedStyle\(dialog\)\.display\s*===\s*["']none["']/.test(javascript), false);
});

test("a página mantém viewport móvel e controles essenciais identificáveis", () => {
  const html = fs.readFileSync(path.join(clientDirectory, "index.html"), "utf8");
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0"/);
  for (const id of ["pool-dialog", "pool-button", "collect-button", "own-hand", "quick-actions", "table-instruction"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
