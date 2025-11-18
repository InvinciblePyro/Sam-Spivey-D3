//  FINISHED D3.d

// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// ---------------------------------------------
// CONSTANTS + PLAYER STATE
// ---------------------------------------------

const TILE_DEG = 1e-4; // degrees per grid cell
const INTERACT_RANGE = 3; // cells player can interact with
const GRID_RADIUS = 12; // cells visible around screen
const WIN_VALUE = 32; // Winning token value
const VISUAL_MULT = 50; // visual radius for player indicator

type CellState = { token: number | null };

// localStorage key
const STORAGE_KEY = "d3c_state_v1";

// ---------------------------------------------
// PERSISTED STATE (will be loaded/saved)
// ---------------------------------------------

// default state (if no saved state)
const defaultState = {
  playerI: 0,
  playerJ: 0,
  held: null as number | null,
  modifiedCells: {} as Record<string, CellState>,
  movementMode: "buttons" as "buttons" | "geolocation",
};

// load or fallback to default
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);
    // ensure fields exist
    return {
      playerI: Number(parsed.playerI ?? defaultState.playerI),
      playerJ: Number(parsed.playerJ ?? defaultState.playerJ),
      held: parsed.held ?? defaultState.held,
      modifiedCells: parsed.modifiedCells ?? {},
      movementMode: parsed.movementMode ?? defaultState.movementMode,
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  const obj = {
    playerI,
    playerJ,
    held,
    modifiedCells: Object.fromEntries(modifiedCells.entries()),
    movementMode: movementFacade.getMode(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function clearSavedState() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------
// HELPER: coordinate conversions
// ---------------------------------------------

function latLngFor(i: number, j: number) {
  return leaflet.latLng(i * TILE_DEG, j * TILE_DEG);
}

function cellForLatLng(lat: number, lng: number) {
  return {
    i: Math.floor(lat / TILE_DEG),
    j: Math.floor(lng / TILE_DEG),
  };
}

function cellKey(i: number, j: number) {
  return `${i},${j}`;
}

// ---------------------------------------------
// RESTORE SAVED STATE INTO RUNTIME VARS
// ---------------------------------------------

const persisted = loadState();
let playerI = persisted.playerI;
let playerJ = persisted.playerJ;
let held: number | null = persisted.held;

// Memory-efficient cell storage (Memento)
const modifiedCells = new Map<string, CellState>();
for (
  const [k, v] of Object.entries(
    persisted.modifiedCells as Record<string, CellState>,
  )
) {
  modifiedCells.set(k, v);
}

// ---------------------------------------------
// BASIC PAGE STRUCTURE
// ---------------------------------------------

const controlPanel = document.createElement("div");
controlPanel.id = "controlPanel";
document.body.append(controlPanel);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
mapDiv.tabIndex = 0; // focusable for keys
document.body.append(mapDiv);

const statusPanel = document.createElement("div");
statusPanel.id = "statusPanel";
document.body.append(statusPanel);

// extra small UI row for movement toggle / new game
const uiRow = document.createElement("div");
uiRow.id = "uiRow";
uiRow.style.marginBottom = "0.5rem";
controlPanel.appendChild(uiRow);

// ---------------------------------------------
// MAP SETUP
// ---------------------------------------------

let playerPos = latLngFor(playerI, playerJ);

const map = leaflet.map(mapDiv, {
  center: playerPos,
  zoom: 19,
  minZoom: 2,
  maxZoom: 19,
  zoomControl: false,
  scrollWheelZoom: true,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  })
  .addTo(map);

const playerMarker = leaflet.marker(playerPos).bindTooltip("You").addTo(map);
const playerCircle = leaflet
  .circle(playerPos, { radius: VISUAL_MULT, color: "red" })
  .addTo(map);

// ---------------------------------------------
// UI: movement mode toggle + new game
// ---------------------------------------------

const modeToggleBtn = document.createElement("button");
modeToggleBtn.textContent = `Mode: ${
  persisted.movementMode === "geolocation" ? "GPS" : "Buttons"
}`;
modeToggleBtn.style.marginRight = "8px";
uiRow.appendChild(modeToggleBtn);

const newGameBtn = document.createElement("button");
newGameBtn.textContent = "New Game";
uiRow.appendChild(newGameBtn);

// container for button controls + inventory (kept below uiRow)
const buttonsDiv = document.createElement("div");
buttonsDiv.id = "buttons";
controlPanel.appendChild(buttonsDiv);
buttonsDiv.style.marginTop = "0.5rem";

// add small help text
const helpP = document.createElement("div");
helpP.innerHTML =
  "<small>Keyboard: Arrow keys — Toggle Mode to use device GPS (if allowed)</small>";
buttonsDiv.appendChild(helpP);

// Movement buttons will be appended below
const directionButtonsContainer = document.createElement("div");
buttonsDiv.appendChild(directionButtonsContainer);

// inventory panel
const inventoryDiv = document.createElement("div");
inventoryDiv.id = "inventory";
inventoryDiv.style.marginTop = "0.5rem";
controlPanel.appendChild(inventoryDiv);

// ---------------------------------------------
// TOKEN GENERATION (Flyweight + Memento)
// ---------------------------------------------

function generateTokenFlyweight(i: number, j: number): number | null {
  const roll = luck(`spawn:${i},${j}`);
  if (roll < 0.2) {
    const r2 = luck(`value:${i},${j}`);
    if (r2 < 0.33) return 1;
    if (r2 < 0.66) return 2;
    return 4;
  }
  return null;
}
function getCellToken(i: number, j: number): number | null {
  const k = cellKey(i, j);
  if (modifiedCells.has(k)) return modifiedCells.get(k)!.token;
  return generateTokenFlyweight(i, j);
}
function setCellToken(i: number, j: number, token: number | null) {
  const k = cellKey(i, j);
  modifiedCells.set(k, { token });
  saveState(); // persist right away
  redrawCell(i, j);
}

// ---------------------------------------------
// CELL GRAPHICS
// ---------------------------------------------

const cellLayers = new Map<
  string,
  { rect: leaflet.Rectangle; marker: leaflet.Marker<leaflet.DivIcon> }
>();

function drawCell(i: number, j: number) {
  const bounds = leaflet.latLngBounds([
    [i * TILE_DEG, j * TILE_DEG],
    [(i + 1) * TILE_DEG, (j + 1) * TILE_DEG],
  ]);
  const rect = leaflet.rectangle(bounds, {
    color: "#555",
    weight: 1,
    fillOpacity: 0.15,
  }).addTo(map);

  const center = bounds.getCenter();
  const marker = leaflet.marker(center, {
    interactive: false,
    icon: leaflet.divIcon({
      className: "cell-label",
      html: "",
      iconSize: [30, 20],
      iconAnchor: [15, 10],
    }),
  }).addTo(map);

  rect.on("click", () => handleCellClick(i, j));
  cellLayers.set(cellKey(i, j), { rect, marker });
  redrawCell(i, j);
}

function redrawCell(i: number, j: number) {
  const key = cellKey(i, j);
  const layer = cellLayers.get(key);
  if (!layer) return;
  const value = getCellToken(i, j);
  layer.marker.setIcon(
    leaflet.divIcon({
      className: "cell-label",
      html: value === null ? "" : String(value),
      iconSize: [30, 20],
      iconAnchor: [15, 10],
    }),
  );
}

// ---------------------------------------------
// SPAWNING / DESPAWNING
// ---------------------------------------------

function updateCells() {
  const center = map.getCenter();
  const { i: ci, j: cj } = cellForLatLng(center.lat, center.lng);
  const needed = new Set<string>();

  for (let di = -GRID_RADIUS; di <= GRID_RADIUS; di++) {
    for (let dj = -GRID_RADIUS; dj <= GRID_RADIUS; dj++) {
      const i = ci + di;
      const j = cj + dj;
      const key = cellKey(i, j);
      needed.add(key);
      if (!cellLayers.has(key)) drawCell(i, j);
      else redrawCell(i, j);
    }
  }

  // remove visual objects for offscreen cells (flyweight)
  for (const key of Array.from(cellLayers.keys())) {
    if (!needed.has(key)) {
      const { rect, marker } = cellLayers.get(key)!;
      map.removeLayer(rect);
      map.removeLayer(marker);
      cellLayers.delete(key);
      // do NOT delete modifiedCells — that preserves Memento
    }
  }
}

map.on("moveend", updateCells);

// ---------------------------------------------
// INVENTORY UI
// ---------------------------------------------

function updateInventoryUI() {
  inventoryDiv.innerHTML = `<h3>Inventory</h3>
    <div>Holding: <b>${held === null ? "nothing" : held}</b></div>
    <div style="font-size:0.9rem;color:gray;margin-top:6px">
      Win: craft token ≥ ${WIN_VALUE}
    </div>`;
}

// ---------------------------------------------
// CELL CLICK HANDLING (pickup/craft)
// ---------------------------------------------

function inRange(i: number, j: number) {
  return Math.abs(i - playerI) <= INTERACT_RANGE &&
    Math.abs(j - playerJ) <= INTERACT_RANGE;
}

function handleCellClick(i: number, j: number) {
  if (!inRange(i, j)) {
    statusPanel.innerHTML = "That cell is too far away!";
    return;
  }
  const cellValue = getCellToken(i, j);

  if (held === null && cellValue !== null) {
    held = cellValue;
    setCellToken(i, j, null);
    updateInventoryUI();
    saveState();
    return;
  }

  if (held !== null && cellValue !== null && held === cellValue) {
    const newVal = held * 2;
    held = null;
    setCellToken(i, j, newVal);
    updateInventoryUI();
    saveState();
    return;
  }

  statusPanel.innerHTML = "Can't do that!";
}

// ---------------------------------------------
// PLAYER RENDERING & MOVE
// ---------------------------------------------

function renderPlayer() {
  playerPos = latLngFor(playerI, playerJ);
  playerMarker.setLatLng(playerPos);
  playerCircle.setLatLng(playerPos);
}

function movePlayer(di: number, dj: number) {
  playerI += di;
  playerJ += dj;
  renderPlayer();
  map.setView(playerPos);
  updateCells();
  saveState();
}

// ---------------------------------------------
// MOVEMENT FACADE + CONTROLLERS
// ---------------------------------------------
//
// We expose a MovementFacade that hides details from game logic.
// Controllers call facade.manualMove or facade.setMode, and the facade
// calls the shared movePlayer function. The facade also handles enabling/disabling
// the geolocation watcher.
//
// ---------------------------------------------

interface MovementController {
  enable(): void;
  disable(): void;
  name: string;
}

class ButtonController implements MovementController {
  name = "buttons";
  keyHandler = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowUp":
        movementFacade.manualMove(1, 0);
        break;
      case "ArrowDown":
        movementFacade.manualMove(-1, 0);
        break;
      case "ArrowRight":
        movementFacade.manualMove(0, 1);
        break;
      case "ArrowLeft":
        movementFacade.manualMove(0, -1);
        break;
    }
  };
  enable() {
    globalThis.addEventListener("keydown", this.keyHandler);
  }
  disable() {
    globalThis.removeEventListener("keydown", this.keyHandler);
  }
}

class GeoController implements MovementController {
  name = "geolocation";
  watchId: number | null = null;
  lastSeenCell: { i: number; j: number } | null = null;

  enable() {
    if (!("geolocation" in navigator)) {
      alert(
        "Geolocation not available in this browser — falling back to buttons.",
      );
      movementFacade.setMode("buttons");
      return;
    }
    // request permission & start watching
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const c = cellForLatLng(lat, lng);
        // move player to the cell containing current GPS coords
        if (
          !this.lastSeenCell || this.lastSeenCell.i !== c.i ||
          this.lastSeenCell.j !== c.j
        ) {
          this.lastSeenCell = { i: c.i, j: c.j };
          // update player indices directly to match real world
          playerI = c.i;
          playerJ = c.j;
          renderPlayer();
          // optionally center map on player
          map.setView(playerPos);
          updateCells();
          saveState();
        }
      },
      (err) => {
        console.warn("Geolocation error:", err);
        alert(
          "Geolocation error or permission denied. Falling back to button mode.",
        );
        movementFacade.setMode("buttons");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 },
    ) as unknown as number;
  }

  disable() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

class MovementFacade {
  private controllers: Record<string, MovementController>;
  private active: MovementController | null = null;
  constructor() {
    this.controllers = {
      buttons: new ButtonController(),
      geolocation: new GeoController(),
    };
  }
  init(mode: "buttons" | "geolocation") {
    this.setMode(mode);
  }
  setMode(mode: "buttons" | "geolocation") {
    if (this.active) this.active.disable();
    const ctrl = this.controllers[mode];
    this.active = ctrl;
    ctrl.enable();
    modeToggleBtn.textContent = `Mode: ${
      mode === "geolocation" ? "GPS" : "Buttons"
    }`;
    saveState();
  }
  getMode(): "buttons" | "geolocation" {
    return (this.active?.name === "geolocation" ? "geolocation" : "buttons");
  }
  manualMove(di: number, dj: number) {
    movePlayer(di, dj);
  }
  disable() {
    if (this.active) this.active.disable();
    this.active = null;
  }
}

const movementFacade = new MovementFacade();
movementFacade.init(persisted.movementMode);

// wire UI toggle
modeToggleBtn.addEventListener("click", () => {
  const newMode = movementFacade.getMode() === "geolocation"
    ? "buttons"
    : "geolocation";
  movementFacade.setMode(newMode);
});

// new game: clears saved state and resets to defaults
newGameBtn.addEventListener("click", () => {
  if (!confirm("Start a new game? This will erase saved progress.")) return;
  clearSavedState();
  // reset runtime state
  playerI = defaultState.playerI;
  playerJ = defaultState.playerJ;
  held = defaultState.held;
  modifiedCells.clear();
  renderPlayer();
  updateCells();
  updateInventoryUI();
  movementFacade.setMode("buttons");
  saveState();
});

// ---------------------------------------------
// DIRECTION BUTTON UI (compass layout, bigger)
// ---------------------------------------------

const UIButtons: HTMLButtonElement[] = [];
["N", "S", "E", "W"].forEach((dir) => {
  const b = document.createElement("button");
  b.textContent = dir;
  b.style.fontSize = "18px";
  b.style.padding = "10px 14px";
  b.style.minWidth = "50px";
  b.style.minHeight = "40px";
  b.onclick = () => {
    // route through facade so game code doesn't depend on buttons
    movementFacade.manualMove(
      dir === "N" ? 1 : dir === "S" ? -1 : 0,
      dir === "E" ? 1 : dir === "W" ? -1 : 0,
    );
  };
  UIButtons.push(b);
});

// layout: N on top, W/E in middle row, S bottom
directionButtonsContainer.style.display = "flex";
directionButtonsContainer.style.flexDirection = "column";
directionButtonsContainer.style.alignItems = "center";

const topRow = document.createElement("div");
topRow.appendChild(UIButtons[0]); // N
directionButtonsContainer.appendChild(topRow);

const middleRow = document.createElement("div");
middleRow.style.display = "flex";
middleRow.style.justifyContent = "space-between";
middleRow.style.width = "120px";
middleRow.appendChild(UIButtons[3]); // W
middleRow.appendChild(UIButtons[2]); // E
directionButtonsContainer.appendChild(middleRow);

const bottomRow = document.createElement("div");
bottomRow.appendChild(UIButtons[1]); // S
directionButtonsContainer.appendChild(bottomRow);

// ---------------------------------------------
// STARTUP: render & update
// ---------------------------------------------
renderPlayer();
updateCells();
updateInventoryUI();
saveState();
mapDiv.focus();
