const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const seedCanvas = document.querySelector("#seedCanvas");
const seedCtx = seedCanvas.getContext("2d", { alpha: false });

const ruleInput = document.querySelector("#rule");
const ruleNumberInput = document.querySelector("#ruleNumber");
const ruleValue = document.querySelector("#ruleValue");
const ruleBits = document.querySelector("#ruleBits");
const widthInput = document.querySelector("#width");
const rowsInput = document.querySelector("#rows");
const centerButton = document.querySelector("#center");
const randomButton = document.querySelector("#random");
const boundaryButton = document.querySelector("#boundary");
const clearButton = document.querySelector("#clear");

let wasm;
let memory;
let maxWidth = 1024;
let drawing = false;
let drawValue = 1;
let wrapEdges = false;

const neighborhoods = [7, 6, 5, 4, 3, 2, 1, 0];

function makeCell(alive) {
  const cell = document.createElement("span");
  cell.className = `mini-cell ${alive ? "alive" : "dead"}`;
  return cell;
}

function buildRuleEditor() {
  for (const pattern of neighborhoods) {
    const button = document.createElement("button");
    const parent = document.createElement("span");
    const arrow = document.createElement("span");
    const result = document.createElement("span");

    button.type = "button";
    button.className = "rule-bit";
    button.dataset.pattern = String(pattern);
    button.setAttribute("aria-label", `Toggle ${pattern.toString(2).padStart(3, "0")} result`);
    button.setAttribute("aria-pressed", "false");

    parent.className = "parent-state";
    parent.append(
      makeCell((pattern & 4) !== 0),
      makeCell((pattern & 2) !== 0),
      makeCell((pattern & 1) !== 0),
    );

    arrow.className = "state-arrow";
    arrow.textContent = "to";

    result.className = "result-state";
    result.append(makeCell(false));

    button.append(parent, arrow, result);
    button.addEventListener("click", () => {
      const nextRule = Number(ruleInput.value) ^ (1 << pattern);
      setRuleNumber(nextRule);
      runCurrent();
    });
    ruleBits.append(button);
  }
}

function setRuleNumber(rule) {
  const clamped = Math.trunc(Math.max(0, Math.min(255, Number.isFinite(rule) ? rule : 0)));

  ruleInput.value = String(clamped);
  ruleNumberInput.value = String(clamped);
  ruleValue.value = String(clamped);
  syncRuleEditor(clamped);

  return clamped;
}

function syncRuleEditor(rule) {
  for (const button of ruleBits.querySelectorAll(".rule-bit")) {
    const pattern = Number(button.dataset.pattern);
    const alive = ((rule >> pattern) & 1) === 1;
    const result = button.querySelector(".result-state .mini-cell");

    button.classList.toggle("enabled", alive);
    button.setAttribute("aria-pressed", String(alive));
    result.classList.toggle("alive", alive);
    result.classList.toggle("dead", !alive);
  }
}

async function loadWasm() {
  const response = await fetch("automata.wasm");
  const bytes = await response.arrayBuffer();
  const result = await WebAssembly.instantiate(bytes, {});

  wasm = result.instance.exports;
  memory = wasm.memory;
  maxWidth = wasm.max_width();

  widthInput.max = String(maxWidth);
  rowsInput.max = String(wasm.max_rows());
  setBoundaryMode(Boolean(wasm.get_wrap_edges()));
  centerAndRun();
}

function setBoundaryMode(enabled) {
  wrapEdges = enabled;
  boundaryButton.textContent = `Edges: ${wrapEdges ? "wrap" : "walls"}`;
  boundaryButton.setAttribute("aria-pressed", String(wrapEdges));

  if (wasm) {
    wasm.set_wrap_edges(wrapEdges ? 1 : 0);
  }
}

function syncConfig() {
  const rule = setRuleNumber(Number(ruleInput.value));
  const width = Number(widthInput.value);
  const rows = Number(rowsInput.value);

  wasm.set_rule(rule);
  wasm.set_wrap_edges(wrapEdges ? 1 : 0);
  wasm.set_size(width, rows);
  widthInput.value = String(wasm.get_width());
  rowsInput.value = String(wasm.get_rows());
}

function render() {
  const width = wasm.get_width();
  const rows = wasm.get_rows();
  const ptr = wasm.get_grid();
  const grid = new Uint8Array(memory.buffer, ptr, maxWidth * rows);
  const image = ctx.createImageData(width, rows);

  canvas.width = width;
  canvas.height = rows;
  seedCanvas.width = width;
  seedCanvas.height = 1;

  const seedImage = seedCtx.createImageData(width, 1);

  for (let x = 0; x < width; x += 1) {
    const alive = grid[x] === 1;
    const offset = x * 4;

    seedImage.data[offset] = alive ? 23 : 236;
    seedImage.data[offset + 1] = alive ? 23 : 236;
    seedImage.data[offset + 2] = alive ? 23 : 234;
    seedImage.data[offset + 3] = 255;
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alive = grid[y * maxWidth + x] === 1;
      const offset = (y * width + x) * 4;
      const seedRow = y === 0;

      image.data[offset] = seedRow ? (alive ? 23 : 236) : (alive ? 23 : 255);
      image.data[offset + 1] = seedRow ? (alive ? 23 : 236) : (alive ? 23 : 255);
      image.data[offset + 2] = seedRow ? (alive ? 23 : 234) : (alive ? 23 : 255);
      image.data[offset + 3] = 255;
    }
  }

  seedCtx.putImageData(seedImage, 0, 0);
  ctx.putImageData(image, 0, 0);
}

function runCurrent() {
  const rule = setRuleNumber(Number(ruleInput.value));

  wasm.set_rule(rule);
  wasm.set_wrap_edges(wrapEdges ? 1 : 0);
  wasm.run();
  render();
}

function centerAndRun() {
  syncConfig();
  wasm.center_seed();
  runCurrent();
}

function randomAndRun() {
  syncConfig();
  wasm.random_seed((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  runCurrent();
}

function clearAndRender() {
  syncConfig();
  wasm.clear();
  render();
}

function canvasCellFromEvent(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * wasm.get_width());

  return Math.max(0, Math.min(wasm.get_width() - 1, x));
}

function paintSeed(event) {
  if (!drawing) return;

  const x = canvasCellFromEvent(event);
  wasm.set_cell(x, drawValue);
  runCurrent();
}

ruleInput.addEventListener("input", runCurrent);
ruleNumberInput.addEventListener("change", () => {
  setRuleNumber(Number(ruleNumberInput.value));
  runCurrent();
});
centerButton.addEventListener("click", centerAndRun);
randomButton.addEventListener("click", randomAndRun);
boundaryButton.addEventListener("click", () => {
  setBoundaryMode(!wrapEdges);
  runCurrent();
});
clearButton.addEventListener("click", clearAndRender);

widthInput.addEventListener("change", centerAndRun);
rowsInput.addEventListener("change", centerAndRun);

function startPainting(event) {
  event.preventDefault();
  const x = canvasCellFromEvent(event);

  drawing = true;
  drawValue = wasm.get_cell(x, 0) ? 0 : 1;
  event.currentTarget.setPointerCapture(event.pointerId);
  paintSeed(event);
}

canvas.addEventListener("pointerdown", startPainting);
seedCanvas.addEventListener("pointerdown", startPainting);

canvas.addEventListener("pointermove", paintSeed);
seedCanvas.addEventListener("pointermove", paintSeed);
canvas.addEventListener("pointerup", () => {
  drawing = false;
});
seedCanvas.addEventListener("pointerup", () => {
  drawing = false;
});
canvas.addEventListener("pointercancel", () => {
  drawing = false;
});
seedCanvas.addEventListener("pointercancel", () => {
  drawing = false;
});

buildRuleEditor();
setRuleNumber(Number(ruleInput.value));

loadWasm().catch((error) => {
  document.body.innerHTML = `<main class="shell"><h1>WASM failed to load</h1><p>${error}</p></main>`;
  throw error;
});
