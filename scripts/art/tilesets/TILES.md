# Outdoor tileset index

Generated from `scripts/art/tilesets/outdoor.mjs` (id `tls_outdoor`, file `tileset.png`, 32 px tiles, 8 columns, 48 tiles, groundTag `grass`).
Tile index = row × 8 + column; the tile's gid in a project is `firstGid + index` (firstGid is 1 for the starter tileset).

Ground tiles are opaque and seamless with themselves. Object and decoration tiles are transparent and go on the Decoration layer over any ground.
A path crossing uses `path` in the middle, `path_edge_*` along the sides and `path_corner_*` in the four inside corners; a pond uses `water_corner_*` at its corners, `water_edge_*` on its sides and `water` inside.
Trees are two tiles tall: paint `tree` (solid) on the Decoration layer and `tree_top` in the tile directly above it.

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
| 24 | 3,0 | `tree_top` | no | Upper canopy half. Non-solid; paint on the Decoration layer directly above `tree`. |
| 25 | 3,1 | `tree` | yes | Lower canopy + trunk. Solid. Paint `tree_top` in the tile above it. |
| 26 | 3,2 | `tree2_top` | no | Second tree variant, upper half (non-solid). |
| 27 | 3,3 | `tree2` | yes | Second tree variant, lower half + trunk (solid). |
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
