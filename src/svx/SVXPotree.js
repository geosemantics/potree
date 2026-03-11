/**
 * SVXPotree.js — main SVX entry point
 *
 * Exports all SVX-specific extensions and provides the loadSVXPointCloud()
 * helper that wires together:
 *   - SVXOctreeLoader  (scalar attribute + signUrl support)
 *   - SVXPointCloudMaterial  (segmentation/classification shader)
 *   - PointCloudOctree  (wraps the geometry)
 *
 * Also exports loadSVXPointCloudCallback() and loadSVXPointCloudAsync()
 * for different calling conventions.
 *
 * === Usage (in an HTML example) ===
 *
 *   <script src="../build/potree/svx.js"></script>
 *   ...
 *   const result = await SVX.loadSVXPointCloud("/cloud/metadata.json");
 *   viewer.scene.addPointCloud(result.pointcloud);
 */

// ---- Core SVX classes ----
export { SVXPointCloudMaterial } from "./materials/SVXPointCloudMaterial.js";
export { SVXClassificationScheme } from "./materials/SVXClassificationScheme.js";
export { SVXOctreeLoader, SVXNodeLoader } from "./modules/loader/2.0/SVXOctreeLoader.js";
export { SVXPointCloudOctreeGeometry, SVXPointCloudOctreeGeometryNode } from "./SVXPointCloudOctreeGeometry.js";
export { SVXEarthControls } from "./navigation/SVXEarthControls.js";
export { SVXOrbitControls } from "./navigation/SVXOrbitControls.js";
export { SVXViewer } from "./viewer/SVXViewer.js";
export { SVXPropertiesPanel } from "./viewer/PropertyPanels/SVXPropertiesPanel.js";

// ---- SVX-aware loader helpers ----
export { SVXBinaryLoader } from "./loader/SVXBinaryLoader.js";
export { SVXLasLazLoader } from "./loader/SVXLasLazLoader.js";
export { SVXEptLoader } from "./loader/SVXEptLoader.js";
export { SVXPOCLoader } from "./loader/SVXPOCLoader.js";
export { SVXEptBinaryLoader } from "./loader/ept/SVXEptBinaryLoader.js";
export { SVXEptLaszipLoader } from "./loader/ept/SVXEptLaszipLoader.js";

// ---- Re-export new standalone modules (no upstream equivalent) ----
export { SegmentationScheme } from "../materials/SegmentationScheme.js";
export { AuthManager } from "../modules/auth/index.js";

// ---- Private imports for loadSVXPointCloud() ----
import { SVXOctreeLoader } from "./modules/loader/2.0/SVXOctreeLoader.js";
import { SVXPOCLoader } from "./loader/SVXPOCLoader.js";
import { SVXEptLoader } from "./loader/SVXEptLoader.js";
import { SVXPointCloudMaterial } from "./materials/SVXPointCloudMaterial.js";
import { PointCloudOctree } from "../PointCloudOctree.js";
import { AuthManager } from "../modules/auth/index.js";

/** Global AuthManager instance (mirrors Potree.authManager). */
export const authManager = new AuthManager();

// ---------------------------------------------------------------------------
// loadSVXPointCloud — async, returns { type, pointcloud }
// ---------------------------------------------------------------------------

/**
 * Load a PotreeConverter 2.0 point cloud using the SVX extended pipeline.
 *
 * Supports:
 *  - External scalar attribute files in /scalars/{name}.bin
 *  - Signed/authenticated URLs via the signUrl callback
 *  - SVXPointCloudMaterial (segment-based classification, classification_raw)
 *
 * @param {string} path        Path to the point cloud directory or metadata.json
 * @param {string} [name]      Display name for the point cloud
 * @param {Function} [signUrl] Optional function (url, headers?) → Promise<string>
 * @returns {Promise<{type: string, pointcloud: PointCloudOctree}>}
 */
export async function loadSVXPointCloud(path, name, signUrl) {
	const _signUrl = signUrl || (x => x);

	// Normalise path to metadata.json
	const metaUrl = path.endsWith("metadata.json")
		? path
		: path.replace(/\/$/, "") + "/metadata.json";

	const result = await SVXOctreeLoader.load(metaUrl, _signUrl);

	if (!result || !result.geometry) {
		throw new Error(`SVX: failed to load point cloud from URL: ${path}`);
	}

	const geometry = result.geometry;
	const material = new SVXPointCloudMaterial();
	const pointcloud = new PointCloudOctree(geometry, material);

	// Set elevation range from position attribute (same as potree's loadPointCloud)
	const aPosition = pointcloud.getAttribute("position");
	if (aPosition) {
		material.elevationRange = [aPosition.range[0][2], aPosition.range[1][2]];
	}

	if (name) {
		pointcloud.name = name;
	}

	return { type: "pointcloud_loaded", pointcloud };
}

// ---------------------------------------------------------------------------
// loadSVXPointCloudCallback — callback-style (compatible with Potree.loadPointCloud)
// ---------------------------------------------------------------------------

/**
 * Callback-compatible wrapper for loadSVXPointCloud.
 * Mirrors the Potree.loadPointCloud(path, name, callback) signature.
 *
 * @param {string}   path
 * @param {string}   name
 * @param {Function} callback  Called with { type, pointcloud }
 * @param {Function} [signUrl]
 */
export function loadSVXPointCloudCallback(path, name, callback, signUrl) {
	loadSVXPointCloud(path, name, signUrl)
		.then(result => callback(result))
		.catch(err => {
			console.error("SVX: loadSVXPointCloudCallback error", err);
			callback({ type: "loading_failed", error: err });
		});
}

// ---------------------------------------------------------------------------
// loadSVXPointCloudAsync — promise-based alias for clarity
// ---------------------------------------------------------------------------

/**
 * Alias of loadSVXPointCloud. Provided for clarity when the caller already
 * has await available.
 */
export const loadSVXPointCloudAsync = loadSVXPointCloud;
