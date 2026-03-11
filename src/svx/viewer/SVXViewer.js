/**
 * SVXViewer
 *
 * Extends Viewer with SVX-specific additions:
 *  - Uses SVXPotreeRenderer (adds segmentation attribute + texture support)
 *  - Segmentation scheme management (setSegmentations, setSegmentationVisibility)
 *  - Per-frame segmentation material updates via updateMaterialDefaults()
 *  - loadSettingsFromURL() is disabled by default (SVX setups configure
 *    viewer programmatically, not from URL query-string parameters)
 */

import { Viewer } from "../../viewer/viewer.js";
import { SegmentationScheme } from "../../materials/SegmentationScheme.js";
import { Renderer as SVXRenderer } from "../SVXPotreeRenderer.js";

export class SVXViewer extends Viewer {
	constructor(domElement, args) {
		super(domElement, args);

		// SVX: initialise segmentations
		this.segmentations = SegmentationScheme.DEFAULT;

		// SVX: replace the base Renderer with the SVX version that
		// supports segmentation attributes and the segmentation texture.
		this.pRenderer = new SVXRenderer(this.renderer);
	}

	// -------------------------------------------------------------------------
	// Disable automatic loadSettingsFromURL — SVX setups configure the viewer
	// programmatically via their own application logic.
	// -------------------------------------------------------------------------
	loadSettingsFromURL() {
		// SVX: intentionally a no-op; call super.loadSettingsFromURL() explicitly
		// if you want URL-based configuration in your application.
	}

	// -------------------------------------------------------------------------
	// Per-frame material update (called by base update() for every visible pco)
	// -------------------------------------------------------------------------
	updateMaterialDefaults(pointcloud) {
		super.updateMaterialDefaults(pointcloud);

		const material = pointcloud.material;

		// Only update segmentation for materials that support it (SVXPointCloudMaterial)
		if (typeof material.recomputeSegmentation === "function") {
			material.segmentation = this.segmentations;
			material.recomputeSegmentation();
		}
	}

	// -------------------------------------------------------------------------
	// Segmentation management
	// -------------------------------------------------------------------------

	setSegmentations(segmentations) {
		this.segmentations = segmentations;
		this.dispatchEvent({ type: "segmentations_changed", viewer: this });
	}

	setSegmentationVisibility(key, value) {
		if (!this.segmentations[key]) {
			this.segmentations[key] = { visible: value, name: "no name" };
			this.dispatchEvent({ type: "segmentations_visibility_changed", viewer: this });
		} else if (this.segmentations[key].visible !== value) {
			this.segmentations[key].visible = value;
			this.dispatchEvent({ type: "segmentations_visibility_changed", viewer: this });
		}
	}

	/**
	 * Placeholder hook: inject derived point attribute logic.
	 * Subclasses or callers can provide transform functions that modify
	 * one attribute based on another before it is passed to the GPU.
	 */
	setDerivedPointAttributes(property, baseProperty, fn) {
		// Implemented by the application, not by SVXViewer directly
	}
}
