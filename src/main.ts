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

// Visual multiplier for player movement so you can see it at high zoom
const VISUAL_MULT = 50; // 50x larger than TILE_DEG for marker animation

// Null Island start
let playerI = 0;
let playerJ = 0;

function latLngFor(i: number, j: number) {
  return leaflet.latLng(i * TILE_DEG, j * TILE_DEG);
}

function cellForLatLng(lat: number, lng: number) {
  return {
    i: Math.floor(lat / TILE_DEG),
    j: Math.floor(lng / TILE_DEG),
  };
}

let playerPos = latLngFor(playerI, playerJ);

// ---------------------------------------------
// BASIC PAGE STRUCTURE
// ---------------------------------------------

const controlPanel = document.createElement("div");
controlPanel.id = "controlPanel";
document.body.append(controlPanel);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
mapDiv.tabIndex = 0;
document.body.append(mapDiv);

const statusPanel = document.createElement("div");
statusPanel.id = "statusPanel";
document.body.append(statusPanel);

// ---------------------------------------------
// MAP SETUP
// ---------------------------------------------

const map = leaflet.map(mapDiv, {
  center: playerPos,
  zoom: 19,
  minZoom: 2,
  maxZoom: 19,
  zoomControl: true,
  scrollWheelZoom: true,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  })
  .addTo(map);

const playerMarker = leaflet
  .marker(playerPos)
  .bindTooltip("You")
  .addTo(map);

// Optional red circle to clearly see player
const playerCircle = leaflet.circle(playerPos, {
  radius: VISUAL_MULT,
  color: "red",
}).addTo(map);

// ---------------------------------------------
// GAME STATE
// ---------------------------------------------

const cellOverrides = new Map<string, number | null>();
let held: number | null = null;

// ---------------------------------------------
// INVENTORY UI
// ---------------------------------------------
// Create a div inside the control panel for inventory
const inventoryDiv = document.createElement("div");
inventoryDiv.id = "inventory";
controlPanel.appendChild(inventoryDiv);

// Add movement buttons container
const buttonsDiv = document.createElement("div");
buttonsDiv.id = "buttons";
controlPanel.appendChild(buttonsDiv);
buttonsDiv.innerHTML =
  "<br>Keyboard Controls: <br>Arrow Keys<br> <br>Screen Controls: <br>";

// Movement buttons
const UIButtons: Node[] = [];
["N", "S", "E", "W"].forEach((dir) => {
  const b = document.createElement("button");
  b.textContent = dir;
  b.onclick = () => {
    if (dir === "N") movePlayer(1, 0);
    if (dir === "S") movePlayer(-1, 0);
    if (dir === "E") movePlayer(0, 1);
    if (dir === "W") movePlayer(0, -1);
  };
  UIButtons.push(b);
});

// Container for all buttons
buttonsDiv.style.display = "flex";
buttonsDiv.style.flexDirection = "column";
buttonsDiv.style.alignItems = "center"; // center everything horizontally

// Top row: N
const topRow = document.createElement("div");
topRow.appendChild(UIButtons[0]); // N
buttonsDiv.appendChild(topRow);

// Middle row: W E
const middleRow = document.createElement("div");
middleRow.style.display = "flex";
middleRow.style.justifyContent = "space-between";
middleRow.style.width = "80px"; // controls horizontal spacing
middleRow.appendChild(UIButtons[3]); // W
middleRow.appendChild(UIButtons[2]); // E
buttonsDiv.appendChild(middleRow);

// Bottom row: S
const bottomRow = document.createElement("div");
bottomRow.appendChild(UIButtons[1]); // S
buttonsDiv.appendChild(bottomRow);

// Update only the inventory div
function updateInventoryUI() {
  if (held === null) {
    inventoryDiv.innerHTML = `<h2>Inventory</h2>
      Holding: <b>nothing</b>`;
  } else {
    inventoryDiv.innerHTML = `<h2>Inventory</h2>
      Holding token: <b>${held}</b>`;
  }

  if (held !== null && held >= WIN_VALUE) {
    statusPanel.innerHTML = "🏆 You win! Congratulations!";
  } else {
    statusPanel.innerHTML = "";
  }
}

// Movement buttons
mapDiv.focus();

window.addEventListener("keydown", (e) => {
  console.log("Key pressed:", e.key); // <-- check this
  switch (e.key) {
    case "ArrowUp":
      movePlayer(1, 0);
      break;
    case "ArrowDown":
      movePlayer(-1, 0);
      break;
    case "ArrowRight":
      movePlayer(0, 1);
      break;
    case "ArrowLeft":
      movePlayer(0, -1);
      break;
  }
});

updateInventoryUI();

// ---------------------------------------------
// TOKEN GENERATION
// ---------------------------------------------

function cellKey(i: number, j: number) {
  return `${i},${j}`;
}

function generateToken(i: number, j: number): number | null {
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
  const key = cellKey(i, j);
  if (cellOverrides.has(key)) return cellOverrides.get(key)!;
  return generateToken(i, j);
}

function setCellToken(i: number, j: number, value: number | null) {
  const key = cellKey(i, j);
  cellOverrides.set(key, value);
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

  const rect = leaflet
    .rectangle(bounds, {
      color: "#555",
      weight: 1,
      fillOpacity: 0.15,
    })
    .addTo(map);

  const center = bounds.getCenter();
  const marker = leaflet
    .marker(center, {
      interactive: false,
      icon: leaflet.divIcon({
        className: "cell-label",
        html: "",
        iconSize: [30, 20],
        iconAnchor: [15, 10],
      }),
    })
    .addTo(map);

  rect.on("click", () => handleCellClick(i, j));
  cellLayers.set(cellKey(i, j), { rect, marker });
  redrawCell(i, j);
}

function redrawCell(i: number, j: number) {
  const layer = cellLayers.get(cellKey(i, j));
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
    }
  }

  for (const key of cellLayers.keys()) {
    if (!needed.has(key)) {
      const { rect, marker } = cellLayers.get(key)!;
      map.removeLayer(rect);
      map.removeLayer(marker);
      cellLayers.delete(key);
      cellOverrides.delete(key);
    }
  }
}

map.on("moveend", updateCells);
updateCells();

// ---------------------------------------------
// CELL CLICK HANDLING
// ---------------------------------------------

function inRange(i: number, j: number) {
  return (
    Math.abs(i - playerI) <= INTERACT_RANGE &&
    Math.abs(j - playerJ) <= INTERACT_RANGE
  );
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
    return;
  }

  if (held !== null && cellValue !== null && held === cellValue) {
    const newVal = held * 2;
    held = null;
    setCellToken(i, j, newVal);
    updateInventoryUI();
    return;
  }

  statusPanel.innerHTML = "Can't do that!";
}

// ---------------------------------------------
// PLAYER MOVEMENT
// ---------------------------------------------

function movePlayer(di: number, dj: number) {
  // Simple cell-based movement
  playerI += di;
  playerJ += dj;

  playerPos = latLngFor(playerI, playerJ);

  // Move the marker & circle
  playerMarker.setLatLng(playerPos);
  playerCircle.setLatLng(playerPos);

  // Move the map to follow the player
  map.setView(playerPos);

  // Spawn/despawn visible cells
  updateCells();
}
