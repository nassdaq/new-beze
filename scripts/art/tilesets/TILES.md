# Starter tileset index

Two tilesets share the starter pack and are meant to be used together on one map: **Outdoor** (`tls_outdoor`, first in the manifest, firstGid 1) and **City** (`tls_city`, second, firstGid 49). Each has its own section below.

# Outdoor tileset index

Generated from `scripts/art/tilesets/outdoor.mjs` (id `tls_outdoor`, file `tileset.png`, 32 px tiles, 8 columns, 48 tiles, groundTag `grass`).
Tile index = row × 8 + column; the tile's gid in a project is `firstGid + index` (firstGid is 1 for the starter tileset).

Ground tiles are opaque and seamless with themselves. Object and decoration tiles are transparent and go on the Decoration layer over any ground.
A path crossing uses `path` in the middle, `path_edge_*` along the sides and `path_corner_*` in the four inside corners; a pond uses `water_corner_*` at its corners, `water_edge_*` on its sides and `water` inside.
Trees are two tiles tall and drawn as one 32×64 image split over two tiles, so they only look right as a pair: paint `tree` (solid) on the Decoration layer and `tree_top` in the tile directly above it on the Canopy layer (`aboveEntities`), so characters walk behind the crown. The editor's **Objects** row does this in one click with the `Tree` and `Pine` stamps (see the table at the end).

| Index | Row,Col | Tag | Solid | Notes |
|------:|:-------:|-----|:-----:|-------|
| 0 | 0,0 | `grass` | no | Default ground (groundTag). Seamless. |
| 1 | 0,1 | `grass2` | no | Grass with clover and tiny white flowers. Seamless with grass. |
| 2 | 0,2 | `flowers` | no | Grass with a mixed flower patch (opaque ground variant). |
| 3 | 0,3 | `tall_grass` | no | Transparent decoration: tall blades. |
| 4 | 0,4 | `flower_red` | no | Transparent decoration. |
| 5 | 0,5 | `flower_blue` | no | Transparent decoration. |
| 6 | 0,6 | `bush` | yes | Round layered bush. |
| 7 | 0,7 | `rock` | yes | Large boulder. |
| 8 | 1,0 | `path` | no | Packed earth with pebbles, lighter centre. Seamless. |
| 9 | 1,1 | `path_edge_n` | no | Path with grass along the top edge. |
| 10 | 1,2 | `path_edge_s` | no | Path with grass along the bottom edge. |
| 11 | 1,3 | `path_edge_w` | no | Path with grass along the left edge. |
| 12 | 1,4 | `path_edge_e` | no | Path with grass along the right edge. |
| 13 | 1,5 | `path2` | no | Path variant with more pebbles. Seamless with path. |
| 14 | 1,6 | `dirt` | no | Dark tilled dirt. Seamless. |
| 15 | 1,7 | `sand` | no | Pale sand with wind ripples. Seamless. |
| 16 | 2,0 | `water` | yes | Water with ripple bands and highlights. Seamless. Solid: the whole water family blocks walking. |
| 17 | 2,1 | `water_edge_n` | yes | Water meeting grass at the top. |
| 18 | 2,2 | `water_edge_s` | yes | Water meeting grass at the bottom. |
| 19 | 2,3 | `water_edge_w` | yes | Water meeting grass on the left. |
| 20 | 2,4 | `water_edge_e` | yes | Water meeting grass on the right. |
| 21 | 2,5 | `water_lily` | yes | Water with lily pads and a blossom. |
| 22 | 2,6 | `water_rock` | yes | Boulder in water (solid). |
| 23 | 2,7 | `water2` | yes | Water variant with a different ripple layout; breaks repetition. |
| 24 | 3,0 | `tree_top` | no | Round oak, upper half of the crown. Non-solid; goes on the Canopy layer directly above `tree`. |
| 25 | 3,1 | `tree` | yes | Round oak, lower crown + trunk with bark, and its shadow on the grass. Solid. |
| 26 | 3,2 | `tree2_top` | no | Tall pine, upper tiers. Non-solid; goes on the Canopy layer directly above `tree2`. |
| 27 | 3,3 | `tree2` | yes | Tall pine, lower tiers + trunk and shadow. Solid. |
| 28 | 3,4 | `stump` | yes | Cut stump with rings. |
| 29 | 3,5 | `fence_h` | yes | Horizontal fence; tiles left-right. |
| 30 | 3,6 | `fence_v` | yes | Vertical fence; tiles up-down. |
| 31 | 3,7 | `fence_post` | yes | Single post (fence end / corner). |
| 32 | 4,0 | `signpost` | yes | Arrow signpost. |
| 33 | 4,1 | `well` | yes | Stone well with roof and bucket. |
| 34 | 4,2 | `mushroom` | no | Transparent decoration: red-cap mushrooms. |
| 35 | 4,3 | `log` | yes | Fallen log. |
| 36 | 4,4 | `flower_yellow` | no | Transparent decoration. |
| 37 | 4,5 | `pebbles` | no | Transparent decoration: scattered stones. |
| 38 | 4,6 | `bush_berry` | yes | Bush with red berries. |
| 39 | 4,7 | `rock_small` | yes | Small rock. |
| 40 | 5,0 | `path_corner_nw` | no | Path with grass only in the top-left quadrant: the inside corner of a bend or crossing. |
| 41 | 5,1 | `path_corner_ne` | no | Path with grass only in the top-right quadrant. |
| 42 | 5,2 | `path_corner_sw` | no | Path with grass only in the bottom-left quadrant. |
| 43 | 5,3 | `path_corner_se` | no | Path with grass only in the bottom-right quadrant. |
| 44 | 5,4 | `water_corner_nw` | yes | Top-left corner of a pond: grass along the top and left. |
| 45 | 5,5 | `water_corner_ne` | yes | Top-right corner of a pond. |
| 46 | 5,6 | `water_corner_sw` | yes | Bottom-left corner of a pond. |
| 47 | 5,7 | `water_corner_se` | yes | Bottom-right corner of a pond. |

Required tags present: `grass`, `path`, `tree`, `water`, `grass2`, `flowers`, `path_edge_n`, `path_edge_s`, `path_edge_w`, `path_edge_e`, `dirt`, `sand`, `water_edge_n`, `bush`, `rock`, `fence_h`, `fence_v`, `stump`, `tree_top`, `tall_grass`, `flower_red`, `flower_blue`, `signpost`, `well`.

## Stamps

Multi-tile objects the editor paints in one click (`stamps` in the manifest's tileset entry, see `scripts/art/README.md`). `tiles` are local indices row-major; cells marked *above* go on the topmost `aboveEntities` layer.

| Name | Size | Tiles (row-major) | Above |
|------|:----:|-------------------|-------|
| `Tree` | 1×2 | 24 (`tree_top`), 25 (`tree`) | top cell |
| `Pine` | 1×2 | 26 (`tree2_top`), 27 (`tree2`) | top cell |

# City tileset index

Generated from `scripts/art/tilesets/city.mjs` (id `tls_city`, file `city.png`, 32 px tiles, 8 columns, 95 tiles, groundTag `sidewalk`).
Tile index = row × 8 + column; the gid in a project is `firstGid + index` (the City tileset is the second tileset in the starter manifest, so its firstGid is 1 + the Outdoor tile count = 49).

East African small-town look: ochre and white plaster walls, corrugated roofs, hand-painted Swahili sign boards (DUKA = shop, BENKI = bank, HOTELI = restaurant, SOKO = market, INAUZWA = for sale, BUSTANI = park, BASI = bus).
Ground tiles are opaque and seamless with themselves; edge and corner tiles join their centre tile. Building parts are opaque and solid except the door tiles (`wall_door`, `wall_white_door`, `wall_awning_door`, `kiosk_door`), which are walkable doorways. Signs, street objects and the stamp parts that stand on the ground are transparent and go on the Decoration layer over any ground.

**Curbs**: `sidewalk_edge_<side>` has its curb on that side, i.e. the road lies to the north/south/west/east of it. `sidewalk_corner_<nw|ne|sw|se>` is the OUTER corner of a sidewalk block, with curbs on both named sides.
**Crosswalks**: `crosswalk_h` is a crossing that runs left-right (it crosses a vertical road; its white bars are vertical); `crosswalk_v` runs up-down across a horizontal road. Repeat a crosswalk tile along the crossing's direction to span a wide road.
**Roofs**: `roof` + `roof_edge_*` + `roof_corner_*` build a large grey roof of any size; `roof_grey`, `roof_red` and `roof_blue` are one-row roof strips (ridge and eave in one tile) for the 3-row building stamps.

| Index | Row,Col | Tag | Solid | Notes |
|------:|:-------:|-----|:-----:|-------|
| 0 | 0,0 | `road` | no | Dark grey asphalt, fine speckle, one hairline crack. Seamless. |
| 1 | 0,1 | `road_line_h` | no | Road with a dashed yellow centre line running left-right. Seamless left-right with itself. |
| 2 | 0,2 | `road_line_v` | no | Road with a dashed yellow centre line running up-down. |
| 3 | 0,3 | `road_cross` | no | Both dashed lines: the middle of a 4-way crossing of lined roads. |
| 4 | 0,4 | `crosswalk_h` | no | Zebra crossing that RUNS left-right (across a vertical road): white bars are vertical; tiles seamlessly left-right. |
| 5 | 0,5 | `crosswalk_v` | no | Zebra crossing that RUNS up-down (across a horizontal road): white bars are horizontal; tiles seamlessly up-down. |
| 6 | 0,6 | `sidewalk` | no | Default ground (groundTag): pale 16 px paving slabs. Seamless. |
| 7 | 0,7 | `sidewalk_edge_n` | no | Sidewalk with the curb along its TOP edge (the road is north of it). |
| 8 | 1,0 | `sidewalk_edge_s` | no | Curb along the bottom edge (road south); the curb face is visible. |
| 9 | 1,1 | `sidewalk_edge_w` | no | Curb along the left edge (road west). |
| 10 | 1,2 | `sidewalk_edge_e` | no | Curb along the right edge (road east). |
| 11 | 1,3 | `sidewalk_corner_nw` | no | Outer corner of a sidewalk block: curb on the top and left (road north and west). |
| 12 | 1,4 | `sidewalk_corner_ne` | no | Curb on the top and right. |
| 13 | 1,5 | `sidewalk_corner_sw` | no | Curb on the bottom and left. |
| 14 | 1,6 | `sidewalk_corner_se` | no | Curb on the bottom and right. |
| 15 | 1,7 | `paving` | no | Basketweave "cabro" pavers in grey and terracotta. Seamless. |
| 16 | 2,0 | `dirt_lot` | no | Dusty red murram lot with pebbles and dry tufts. Seamless. |
| 17 | 2,1 | `wall` | yes | Ochre plaster, seamless both ways. Opaque. |
| 18 | 2,2 | `wall_window` | yes | Ochre wall with a blue-framed window and sill. |
| 19 | 2,3 | `wall_door` | no | Ochre wall with a wooden door: the doorway, NOT solid. |
| 20 | 2,4 | `wall_shopfront` | yes | Ochre wall with a glass shop window showing shelves of goods. |
| 21 | 2,5 | `roof` | yes | Grey corrugated sheet, centre of a large roof. Seamless. |
| 22 | 2,6 | `roof_edge_n` | yes | Grey roof with the ridge cap along the top. |
| 23 | 2,7 | `roof_edge_s` | yes | Grey roof with the eave (shadow + fascia) along the bottom. |
| 24 | 3,0 | `roof_edge_w` | yes | Grey roof with the gable board on the left. |
| 25 | 3,1 | `roof_edge_e` | yes | Gable board on the right. |
| 26 | 3,2 | `roof_corner_nw` | yes | Ridge + left gable. |
| 27 | 3,3 | `roof_corner_ne` | yes | Ridge + right gable. |
| 28 | 3,4 | `roof_corner_sw` | yes | Eave + left gable. |
| 29 | 3,5 | `roof_corner_se` | yes | Eave + right gable. |
| 30 | 3,6 | `roof_red` | yes | One-row red corrugated roof strip (ridge on top, eave below, lit slope). Seamless left-right; used by the House stamp. |
| 31 | 3,7 | `roof_blue` | yes | One-row blue roof strip; used by the Restaurant stamp. |
| 32 | 4,0 | `sign_shop` | yes | Free-standing yellow "DUKA" board on a post. |
| 33 | 4,1 | `sign_bank` | yes | Blue "BENKI" board with a coin. |
| 34 | 4,2 | `sign_food` | yes | Red "HOTELI" board with a fork. |
| 35 | 4,3 | `sign_bus` | yes | Round blue-and-white bus sign on a post. |
| 36 | 4,4 | `sign_market` | yes | Green "SOKO" board with fruit. |
| 37 | 4,5 | `sign_forsale` | yes | White "INAUZWA" (for sale) board with red lettering. |
| 38 | 4,6 | `sign_park` | yes | Green "BUSTANI" board. |
| 39 | 4,7 | `bench` | yes | Wooden slat bench on steel legs. |
| 40 | 5,0 | `lamp` | yes | Street lamp post with a lit lantern. |
| 41 | 5,1 | `trash` | yes | Green municipal bin. |
| 42 | 5,2 | `hydrant` | yes | Red fire hydrant. |
| 43 | 5,3 | `hedge` | yes | Trimmed box hedge; tiles left-right. |
| 44 | 5,4 | `flowerbed` | no | Stone-edged bed with flowers. Transparent decoration, walkable. |
| 45 | 5,5 | `fence_city_h` | yes | Black iron railing with gold-tipped pickets; tiles left-right. |
| 46 | 5,6 | `fence_city_v` | yes | Vertical iron railing; tiles up-down. |
| 47 | 5,7 | `gate` | yes | Chained and padlocked iron gate between brick pillars: the locked-district barrier. |
| 48 | 6,0 | `barrier` | yes | Red-and-white road barrier on legs. |
| 49 | 6,1 | `atm` | yes | Blue ATM cabinet. |
| 50 | 6,2 | `cone` | yes | Orange traffic cone. |
| 51 | 6,3 | `floor_wood` | no | Interior plank floor. Seamless. |
| 52 | 6,4 | `floor_tile` | no | Interior cream/terracotta chequered tiles. Seamless. |
| 53 | 6,5 | `wall_interior` | yes | Interior back wall: cream plaster with a teal dado band and a dark wall top. |
| 54 | 6,6 | `counter` | yes | Wooden shop counter with a top surface and drawers; tiles left-right. |
| 55 | 6,7 | `table` | yes | Table with a red chequered cloth and a plate. |
| 56 | 7,0 | `chair` | no | Wooden chair. Transparent decoration, walkable. |
| 57 | 7,1 | `shelf` | yes | Shop shelves stocked with goods. |
| 58 | 7,2 | `vault` | yes | Steel vault door with a spoked wheel. |
| 59 | 7,3 | `roof_grey` | yes | One-row grey roof strip (ridge + eave); used by the Shop and Bank stamps. |
| 60 | 7,4 | `wall_white` | yes | White plaster, seamless. Opaque. |
| 61 | 7,5 | `wall_white_window` | yes | White wall with a window. |
| 62 | 7,6 | `wall_white_door` | no | White wall with a blue door: doorway, NOT solid. |
| 63 | 7,7 | `wall_column` | yes | White wall with a pilaster (bank facade); stacks vertically. |
| 64 | 8,0 | `wall_sign_shop` | yes | Ochre wall with a painted "DUKA" board (over the Shop door). |
| 65 | 8,1 | `wall_sign_bank_l` | yes | Left half of the 2-tile "BENKI" facade sign on white wall. |
| 66 | 8,2 | `wall_sign_bank_r` | yes | Right half of the bank sign. |
| 67 | 8,3 | `wall_sign_food_l` | yes | Left half of the 2-tile "HOTELI" facade sign on ochre wall. |
| 68 | 8,4 | `wall_sign_food_r` | yes | Right half of the restaurant sign. |
| 69 | 8,5 | `wall_awning` | yes | Ochre wall with a red-and-cream awning over a window. |
| 70 | 8,6 | `kiosk_nw` | yes | Kiosk (2x2), top-left: roof and "KIOSK" board. |
| 71 | 8,7 | `kiosk_ne` | yes | Kiosk top-right. |
| 72 | 9,0 | `kiosk_sw` | yes | Kiosk bottom-left: serving hatch with goods. |
| 73 | 9,1 | `kiosk_door` | no | Kiosk bottom-right: its door, NOT solid. |
| 74 | 9,2 | `stall_a_nw` | yes | Market stall A (red-and-white canopy), top-left. |
| 75 | 9,3 | `stall_a_ne` | yes | Stall A top-right. |
| 76 | 9,4 | `stall_a_sw` | yes | Stall A bottom-left: table with tomatoes. |
| 77 | 9,5 | `stall_a_se` | yes | Stall A bottom-right: mangoes and bananas. |
| 78 | 9,6 | `stall_b_nw` | yes | Market stall B (green-and-cream canopy), top-left. |
| 79 | 9,7 | `stall_b_ne` | yes | Stall B top-right. |
| 80 | 10,0 | `stall_b_sw` | yes | Stall B bottom-left: limes. |
| 81 | 10,1 | `stall_b_se` | yes | Stall B bottom-right: oranges and cassava. |
| 82 | 10,2 | `fountain_nw` | yes | Stone fountain (2x2), top-left: spout and jets. |
| 83 | 10,3 | `fountain_ne` | yes | Fountain top-right. |
| 84 | 10,4 | `fountain_sw` | yes | Fountain bottom-left: basin. |
| 85 | 10,5 | `fountain_se` | yes | Fountain bottom-right. |
| 86 | 10,6 | `shelter_nw` | yes | Bus shelter (3x2), roof left. |
| 87 | 10,7 | `shelter_n` | yes | Bus shelter roof middle with the blue "BASI" sign. |
| 88 | 11,0 | `shelter_ne` | yes | Bus shelter roof right. |
| 89 | 11,1 | `shelter_sw` | yes | Bus shelter interior left: post and bench. |
| 90 | 11,2 | `shelter_s` | yes | Bus shelter interior middle: back wall, bench, "BASI" board. |
| 91 | 11,3 | `shelter_se` | yes | Bus shelter interior right: timetable poster and post. |
| 92 | 11,4 | `wall_awning_door` | no | Ochre wall with a door under the awning: doorway, NOT solid (Restaurant entrance). |
| 93 | 11,5 | `sidewalk2` | no | Sidewalk variant with more cracks; breaks repetition. Seamless with sidewalk. |
| 94 | 11,6 | `road2` | no | Asphalt variant with a different speckle; seamless with road. |

## Stamps

Multi-tile objects the editor paints in one click (`stamps` in the manifest's `tls_city` entry). Every cell is solid except the door cells; no cell is drawn above characters, so the whole building goes on the active layer. Cell layouts are rows of tags, top row first; local indices are in the table above.

| Name | Size | Cells (rows, top to bottom) | Door cell (col,row) |
|------|:----:|-----------------------------|---------------------|
| `Shop` | 3×3 | `roof_grey`, `roof_grey`, `roof_grey`<br>`wall`, `wall_sign_shop`, `wall`<br>`wall_shopfront`, `wall_door`, `wall_shopfront` | (1,2) |
| `House` | 3×3 | `roof_red`, `roof_red`, `roof_red`<br>`wall_window`, `wall`, `wall_window`<br>`wall_window`, `wall_door`, `wall_window` | (1,2) |
| `Bank` | 4×3 | `roof_grey`, `roof_grey`, `roof_grey`, `roof_grey`<br>`wall_column`, `wall_sign_bank_l`, `wall_sign_bank_r`, `wall_column`<br>`wall_column`, `wall_white_door`, `wall_white_window`, `wall_column` | (1,2) |
| `Restaurant` | 4×3 | `roof_blue`, `roof_blue`, `roof_blue`, `roof_blue`<br>`wall_window`, `wall_sign_food_l`, `wall_sign_food_r`, `wall_window`<br>`wall_awning`, `wall_awning_door`, `wall_awning`, `wall_awning` | (1,2) |
| `BusShelter` | 3×2 | `shelter_nw`, `shelter_n`, `shelter_ne`<br>`shelter_sw`, `shelter_s`, `shelter_se` | none (interact from the front) |
| `StallA` | 2×2 | `stall_a_nw`, `stall_a_ne`<br>`stall_a_sw`, `stall_a_se` | none (interact from the front) |
| `StallB` | 2×2 | `stall_b_nw`, `stall_b_ne`<br>`stall_b_sw`, `stall_b_se` | none (interact from the front) |
| `Fountain` | 2×2 | `fountain_nw`, `fountain_ne`<br>`fountain_sw`, `fountain_se` | none (interact from the front) |
| `Kiosk` | 2×2 | `kiosk_nw`, `kiosk_ne`<br>`kiosk_sw`, `kiosk_door` | (1,1) |

The stamps' facades are: Shop = grey roof, "DUKA" board over the door, glass shop windows either side; House = red roof, two storeys of windows; Bank = grey roof, white walls with pilasters, 2-tile "BENKI" sign, blue door; Restaurant = blue roof, 2-tile "HOTELI" sign, striped awnings, door under the awning; BusShelter = open-fronted shelter with a "BASI" sign on its roof; StallA / StallB = striped-canopy market stalls with produce; Fountain = round stone fountain; Kiosk = box shop with a serving hatch and a door.
