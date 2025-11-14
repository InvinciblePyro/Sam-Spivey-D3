# D3: {game title goes here}

# Game Design Vision

A map based 2048 & Pokemon Go game where you walk around a grid map of your geolocation filled with numbered tokens. You can only hold one token at a time, and once you've picked up a token you cannot drop it in a empty square. You can only drop your token on a sqaure with a token number equal to that of the token number you currently hold. Once dropped on an equal token number, the tokens combine and are dropped on that square location and the number
on that token is doubled.

# Technologies

- TypeScript for most game code, little to no explicit HTML, and all CSS collected in common `style.css` file
- Deno and Vite for building
- GitHub Actions + GitHub Pages for deployment automation

# Assignments

## D3.a: Core mechanics (token collection and crafting)

Key technical challenge: Can you assemble a map-based user interface using the Leaflet mapping framework?
Key gameplay challenge: Can players collect and craft tokens from nearby locations to finally make one of sufficiently high value?

### Steps

- [x] copy main.ts to reference.ts for future reference
- [x] delete everything in main.ts
- [x] put a basic leaflet map on the screen
- [x] draw the player's location on the map
- [x] draw a rectangle representing one cell on the map
- [x] use loops to draw a whole grid of cells on the map
- [x] make numbered tokens on the grid cells
- [x] make cells interactable
- [x] cells add token to your inventory and become a nothing cell
- [x] Make inventory
- [x] can only interact with cells 3 cells away
- [x] can combine cells together to double their number

## D3.b

...

### 
