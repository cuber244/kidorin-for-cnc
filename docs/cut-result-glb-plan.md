# CNC cut-result GLB export plan

## Goal

Export the post-machining state as one GLB that Resonite can import and manipulate as separate objects.

The initial scene should contain:

- one remaining-stock mesh per board;
- one mesh per manufactured part;
- one mesh per breakable tab;
- stable node names and metadata for Resonite-side lookup.

Avoid duplicating the same solid volume between the stock and part meshes. The complete as-machined board is represented by the `Stock`, `Parts`, and `Tabs` groups together.

## Proposed glTF hierarchy

```text
CNC_Result
└─ Board_01
   ├─ Stock
   │  └─ Stock_01
   ├─ Parts
   │  ├─ Part_001
   │  └─ Part_002
   └─ Tabs
      ├─ Tab_001_01
      └─ Tab_001_02
```

Each node should have a stable `name` and `extras` metadata.

```json
{
  "role": "part",
  "boardIndex": 0,
  "partIndex": 0,
  "partId": "part-0",
  "units": "millimeters"
}
```

Tab metadata should additionally identify the connected part and expose its dimensions and machining depth. This allows Resonite to find the tab objects without relying only on display names.

## Coordinate convention

- Source/CAM coordinates are millimeters.
- The board origin is its lower-left top corner.
- glTF is Y-up: cutting depth maps to negative glTF Y and board Y maps to glTF Z.
- Mirror board X at the common root (`CAM X` maps to glTF `-X`) so the machined face orientation matches the CAM preview when imported into Resonite.
- Put `scale: [-0.001, 0.001, 0.001]` on the root node so imported geometry is in meters, the Resonite orientation correction is applied once, and metadata remains in millimeters.
- Do not bake the 3D viewer's centering transform into exported machining coordinates.

## Existing code to reuse

- `separateGeometries()` already creates one geometry per connected STL part.
- `geometriesCache` contains the current joint/T-bone-processed part geometry.
- SVG `g#part-*` elements contain placement and rotation.
- `getTransformedSegments()` produces board-space outlines.
- `applyToolRadiusOffset()` produces the cutter center path.
- `.tab-marker`, `snapTabsToOffsetOutline()`, and `insertTabsIntoSegments()` contain the tab locations used by G-code generation.
- `exportGLB()` already writes glTF 2.0 binary buffers, accessors, materials, meshes, and nodes without adding a dependency.
- `InternalCSG` is available for solid subtraction when a contour-only construction is insufficient.

## New intermediate model

G-code generation and GLB generation must consume the same normalized machining model instead of independently rereading the SVG DOM.

```js
{
  units: 'mm',
  thickness: 12,
  toolDiameter: 6,
  tabHeight: 8,
  boards: [{
    id: 'board-0',
    length: 900,
    width: 900,
    parts: [{
      id: 'part-0',
      sourceGeometryIndex: 0,
      transform: { x: 138.2, y: 99.71, angle: 0 },
      contours: [],
      cutterPaths: [],
      tabs: [{
        id: 'tab-0-0',
        center: [0, 0],
        tangent: [1, 0],
        length: 16,
        height: 8
      }]
    }]
  }]
}
```

Store the most recently generated value as `window.__lastCncModel` so the viewer/export UI can reuse the exact CAM inputs.

## Geometry construction

### Parts

Use the corresponding `geometriesCache` entry, then apply the SVG placement and rotation in board coordinates. Preserve each part as a separate glTF mesh and node.

### Tabs

Generate each tab as a separate rectangular prism:

- tangent dimension: configured tab length;
- normal dimension: enough to bridge the routed kerf;
- vertical dimension: configured remaining tab height;
- vertical position: from the board bottom to the tab top.

Keep tabs separate from both the stock and part mesh. Resonite can then hide, detach, or animate each tab during the break-off stage.

### Remaining stock

Start from the full board solid and remove part regions plus the routed gap. Do not subtract tab bridge regions.

Implementation phases:

1. Build and validate a contour-extrusion version for simple closed outer contours.
2. Add inner contours/slots and multiple parts.
3. Match the actual tool-radius-offset paths and T-bone geometry.
4. Use `InternalCSG` only for cases that cannot be constructed reliably from the normalized 2D contours.

Avoid subtracting thousands of individual G-code line cylinders as the first implementation; it is likely to be slow and numerically fragile in the browser.

## GLB writer changes

Refactor the current popup-local `exportGLB()` into reusable functions:

```text
buildGlbDocument(exportMeshes, options)
encodeGlb(document, binaryParts)
downloadGlb(arrayBuffer, filename)
```

The export mesh descriptor should include:

```js
{
  geometry,
  material,
  name,
  parentName,
  translation,
  rotation,
  scale,
  extras
}
```

The writer must emit node names, hierarchy, transforms, and `extras`. The current viewer centering transform is display-only and must not leak into machining coordinates.

## UI proposal

Add a separate action rather than changing the meaning of the existing part-model GLB export:

- `GLBエクスポート`: current part-model export;
- `加工後GLBエクスポート`: stock + parts + tabs for Resonite.

Disable the machining export until board placement, material thickness, tool diameter, and tab height are known. Show a validation message instead of silently using stale G-code settings.

## Acceptance criteria

- The GLB passes a glTF 2.0 validator with no errors.
- Resonite imports `Stock_01`, every `Part_*`, and every `Tab_*` as separately identifiable objects.
- Imported dimensions match the board and part dimensions in meters.
- Part placement matches the generated G-code coordinate system.
- Hiding all `Tab_*` objects visually separates every part from the remaining stock.
- A no-tab job exports an empty `Tabs` group without invalid nodes.
- Multi-board jobs create one independent hierarchy per board.
- Existing STL export, existing part GLB export, G-code generation, and joint editing remain unchanged.

## First implementation slice

1. Extract `buildCncModel()` from the current G-code-generation loop.
2. Add stable part IDs and retain tab tangent/path information.
3. Refactor the GLB writer without changing current output.
4. Export placed parts with node names and metadata.
5. Add separate tab prisms.
6. Add the remaining-stock mesh for simple outer contours.
7. Validate in a glTF viewer and Resonite before adding complex contour cases.
