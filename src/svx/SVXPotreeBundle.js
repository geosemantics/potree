/**
 * SVXPotreeBundle.js — combined Potree + SVX entry point
 *
 * This file is the build entry for the main potree.js bundle.
 * It re-exports every original Potree symbol PLUS all SVX extensions,
 * making the SVX classes available under the same `Potree.*` namespace
 * without requiring a separate svx.js file.
 *
 * Why this file exists:
 *  - SVXPotreeRenderer.js (used by SVXViewer) references `exports.debug` and
 *    `exports.measureTimings`.  Those are module-level UMD exports, i.e.
 *    `window.Potree.debug` / `window.Potree.measureTimings`.  When
 *    SVXPotreeRenderer was bundled as a separate svx.js, `exports` pointed to
 *    window.SVX (not window.Potree) and the two properties were undefined,
 *    causing "can't access property 'allowedNodes', exports.debug is undefined".
 *  - Building SVXPotreeRenderer inside the main Potree UMD bundle fixes this
 *    automatically: rollup's UMD wrapper assigns `exports = window.Potree`,
 *    which has `debug: {}` (set in Potree.js).
 *
 * Usage in HTML:
 *   <script src="build/potree/potree.js"></script>  ← this file, one script only
 *   ...
 *   window.viewer = new Potree.SVXViewer(...);
 *   const result = await Potree.loadSVXPointCloudAsync("/cloud/metadata.json");
 */

// Re-export every original Potree symbol unchanged
export * from "../Potree.js";

// Re-export all SVX additions (all names are SVX-prefixed or brand-new, so no
// conflict with the Potree.js exports above)
export * from "./SVXPotree.js";
