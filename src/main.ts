// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// ---------------------------------------------
// CONSTANTS
// ---------------------------------------------

const TILE_DEG = 1e-4; // cell width/height
const INTERACT_RANGE = 3; // max distance to click cells
const GRID_RADIUS = 12; // how far grid draws around player
const LEVEL_UP_VALUES = [8, 16];

const CLASSROOM = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// ---------------------------------------------
// BASIC PAGE STRUCTURE
// ---------------------------------------------

const controlPanel = document.createElement("div");
controlPanel.id = "controlPanel";
controlPanel.innerHTML = "<h2>Inventory</h2>";
document.body.append(controlPanel);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanel = document.createElement("div");
statusPanel.id = "statusPanel";
document.body.append(statusPanel);

// ---------------------------------------------
// MAP SETUP
// ---------------------------------------------

const map = leaflet.map(mapDiv, {
  center: CLASSROOM,
  zoom: 19,
  minZoom: 19,
  maxZoom: 19,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

// Player icon
leaflet
  .marker(CLASSROOM)
  .bindTooltip("You")
  .addTo(map);

// ---------------------------------------------
// GAME STATE
// ---------------------------------------------

// Each cell may temporarily override its generated token
const cellOverrides = new Map<string, number | null>();

// What the player is holding
let held: number | null = null;

// ---------------------------------------------
// INVENTORY UI
// ---------------------------------------------

function updateInventoryUI() {
  if (held === null) {
    controlPanel.innerHTML = "<h2>Inventory</h2>Holding: <b>nothing</b>";
  } else {
    controlPanel.innerHTML = `<h2>Inventory</h2>Holding token: <b>${held}</b>`;
  }

  if (held && LEVEL_UP_VALUES.includes(held)) {
    statusPanel.innerHTML = `🎉 You crafted a level ${held} token!`;
  } else {
    statusPanel.innerHTML = "";
  }
}
updateInventoryUI();

// ---------------------------------------------
// TOKEN GENERATION (DETERMINISTIC)
// ---------------------------------------------

function cellKey(i: number, j: number): string {
  return `${i},${j}`;
}

function generateToken(i: number, j: number): number | null {
  const roll = luck(`spawn:${i},${j}`);
  if (roll < 0.2) {
    // spawn values: 1, 2, 4
    const r2 = luck(`value:${i},${j}`);
    if (r2 < 0.33) return 1;
    if (r2 < 0.66) return 2;
    return 4;
  }
  return null;
}

function getCellToken(i: number, j: number): number | null {
  const k = cellKey(i, j);
  if (cellOverrides.has(k)) return cellOverrides.get(k)!;
  return generateToken(i, j);
}

function setCellToken(i: number, j: number, value: number | null) {
  cellOverrides.set(cellKey(i, j), value);
  redrawCell(i, j);
}

// ---------------------------------------------
// UTILITY FUNCTION: BOUNDS FOR A CELL
// ---------------------------------------------

function latLngBoundsFor(i: number, j: number) {
  return leaflet.latLngBounds([
    [CLASSROOM.lat + i * TILE_DEG, CLASSROOM.lng + j * TILE_DEG],
    [CLASSROOM.lat + (i + 1) * TILE_DEG, CLASSROOM.lng + (j + 1) * TILE_DEG],
  ]);
}

// ---------------------------------------------
// CELL GRAPHICS (Leaflet-safe version)
// ---------------------------------------------

const cellLayers = new Map<
  string,
  { rect: leaflet.Rectangle; marker: leaflet.Marker<leaflet.DivIcon> }
>();

function drawCell(i: number, j: number) {
  const bounds = latLngBoundsFor(i, j);

  // The visual grid box
  const rect = leaflet.rectangle(bounds, {
    color: "#555",
    weight: 1,
    fillOpacity: 0.15,
  }).addTo(map);

  // Middle of the cell for the label
  const center = bounds.getCenter();

  // Create a marker with a DivIcon for showing the token number
  const marker = leaflet.marker(center, {
    interactive: false,
    icon: leaflet.divIcon({
      className: "cell-label", // CSS class you can style
      html: "", // will fill in with token value
      iconSize: [30, 20], // adjust as needed
      iconAnchor: [15, 10], // center it
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
// GRID GENERATION
// ---------------------------------------------

for (let i = -GRID_RADIUS; i <= GRID_RADIUS; i++) {
  for (let j = -GRID_RADIUS; j <= GRID_RADIUS; j++) {
    drawCell(i, j);
  }
}

// ---------------------------------------------
// CELL CLICK HANDLING
// ---------------------------------------------

function inRange(i: number, j: number): boolean {
  return Math.abs(i) <= INTERACT_RANGE && Math.abs(j) <= INTERACT_RANGE;
}

function handleCellClick(i: number, j: number) {
  if (!inRange(i, j)) {
    statusPanel.innerHTML = "That cell is too far away!";
    return;
  }

  const cellValue = getCellToken(i, j);

  // Case 1: holding nothing → pick up token
  if (held === null && cellValue !== null) {
    held = cellValue;
    setCellToken(i, j, null);
    updateInventoryUI();
    return;
  }

  // Case 2: holding something AND cell has same value → craft
  if (held !== null && cellValue !== null && held === cellValue) {
    const newVal = held * 2;
    held = null;
    setCellToken(i, j, newVal);
    updateInventoryUI();
    return;
  }

  // Case 3: holding something but can't place
  statusPanel.innerHTML = "Can't do that!";
}
