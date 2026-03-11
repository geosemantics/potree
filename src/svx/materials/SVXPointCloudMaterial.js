/**
 * SVXPointCloudMaterial
 *
 * Extends PointCloudMaterial to add:
 *  - SVX shader (svx-pointcloud.vs / svx-pointcloud.fs) with segment-based
 *    classification, classification_raw toggle, and superimpose modes
 *  - 256×256 classification texture (supports up to 65 536 integer IDs)
 *  - Segmentation texture (256-entry 1-D LUT)
 *  - Segmentation-related uniforms and attributes
 *  - Helper methods: selectSegment, setSegmentationLevel, classificationStyle, etc.
 */

import * as THREE from "../../../libs/three.js/build/three.module.js";
import { Shaders } from "../../../build/shaders/shaders.js";
import { PointCloudMaterial } from "../../materials/PointCloudMaterial.js";
import { SegmentationScheme } from "../../materials/SegmentationScheme.js";

function createClassificationTextureMap() {
	const texWidth = 256;
	const texHeight = 256;
	const colorData = new Uint8Array(texWidth * texHeight * 4);
	for (let i = 0; i < texWidth * texHeight; i++) {
		colorData[i * 4 + 0] = 0;
		colorData[i * 4 + 1] = 0;
		colorData[i * 4 + 2] = 0;
		colorData[i * 4 + 3] = 1;
	}
	const tex = new THREE.DataTexture(colorData, texWidth, texHeight, THREE.RGBAFormat);
	tex.minFilter = THREE.NearestFilter;
	tex.magFilter = THREE.NearestFilter;
	tex.needsUpdate = true;
	return tex;
}

export class SVXPointCloudMaterial extends PointCloudMaterial {
	constructor(parameters = {}) {
		super(parameters);

		// SVX classification/segmentation state — set before calling updateShaderSource
		this._classificationStyle = "from_segment"; // "from_segment" | "raw"
		this._selectedSegmentId = -1;
		this._superimposeClassification = false;
		this._segmentationLevel = 2;

		// Replace the parent's 256×1 classificationTexture with a 256×256 map
		// (supports 65 536 integer classification IDs used with uint16 point data)
		this.classificationTexture = createClassificationTextureMap();
		this.uniforms.classificationLUT.value = this.classificationTexture;

		// Segmentation LUT (256 entries, 1-D)
		{
			const width = 256;
			const sgdata = new Uint8Array(width * 4);
			this.segmentationTexture = new THREE.DataTexture(
				sgdata, width, 1, THREE.RGBAFormat
			);
			this.segmentationTexture.magFilter = THREE.NearestFilter;
			this.segmentationTexture.needsUpdate = true;
		}

		// Add SVX uniforms that the SVX shader requires
		this.uniforms.segmentationLUT = { type: "t", value: this.segmentationTexture };
		this.uniforms.wSegmentation = { type: "f", value: 0 };
		// Increase default weight for classification overlay
		this.uniforms.wClassification.value = 0.7;

		// Add segmentation vertex attributes so THREE knows about them
		this.attributes.segmentation1 = { type: "f", value: [] };
		this.attributes.segmentation2 = { type: "f", value: [] };
		this.attributes.segmentation3 = { type: "f", value: [] };

		// Initialise segmentation scheme
		this.segmentation = SegmentationScheme.DEFAULT;

		// Re-compile the shader now that all SVX state is in place
		this.updateShaderSource();
	}

	// -------------------------------------------------------------------------
	// Shader compilation
	// -------------------------------------------------------------------------

	updateShaderSource() {
		// Delegate all the blending/depth-state logic to the parent
		super.updateShaderSource();

		// Now replace vertex + fragment shaders with the SVX versions
		const svxVs = Shaders["svx-pointcloud.vs"];
		const svxFs = Shaders["svx-pointcloud.fs"];

		if (svxVs) {
			let vs = svxVs;
			const definesString = this.getDefines();
			vs = vs.indexOf("#version ") >= 0
				? vs.replace(/(#version .*)/, `$1\n${definesString}`)
				: `${definesString}\n${vs}`;
			this.vertexShader = vs;
		}

		if (svxFs) {
			let fs = svxFs;
			const definesString = this.getDefines();
			fs = fs.indexOf("#version ") >= 0
				? fs.replace(/(#version .*)/, `$1\n${definesString}`)
				: `${definesString}\n${fs}`;
			this.fragmentShader = fs;
		}

		this.needsUpdate = true;
	}

	getDefines() {
		// Get the base class defines first (point size, shape, EDL, tree type, …)
		const baseDefines = super.getDefines();
		const svxDefines = [];

		// Classification source
		if (this._classificationStyle === "raw") {
			svxDefines.push("#define classification_raw");
		} else if (this._classificationStyle === "from_segment") {
			svxDefines.push("#define classification_from_segment");
		}

		// Selected segment highlight
		if (this._selectedSegmentId !== undefined && this._selectedSegmentId !== -1) {
			svxDefines.push("#define selected_segment_id " + this._selectedSegmentId);
		}

		// Superimpose classification overlay on top of RGB/segment colour
		if (this._superimposeClassification) {
			svxDefines.push("#define superimpose_classification");
		}

		// Which segmentation buffer attribute to read from
		if (this._segmentationLevel !== undefined) {
			const name = this._activeAttributeName;
			if (name === "segmentation1") {
				svxDefines.push("#define segmentation_level_1");
			} else if (name === "segmentation2") {
				svxDefines.push("#define segmentation_level_2");
			} else if (name === "segmentation3") {
				svxDefines.push("#define segmentation_level_3");
			}
			if (name === "classification") {
				svxDefines.push(`#define segmentation_level_${this._segmentationLevel}`);
			}
		}

		return svxDefines.length > 0
			? baseDefines + "\n" + svxDefines.join("\n")
			: baseDefines;
	}

	// -------------------------------------------------------------------------
	// Segment selection
	// -------------------------------------------------------------------------

	get selectedSegment() {
		return this._selectedSegmentId;
	}

	selectSegment(segmentId) {
		if (this._selectedSegmentId !== segmentId) {
			this._selectedSegmentId = segmentId;
			this.updateShaderSource();
		}
	}

	unselectSegment() {
		if (this._selectedSegmentId !== -1) {
			this._selectedSegmentId = -1;
			this.updateShaderSource();
		}
	}

	// -------------------------------------------------------------------------
	// Classification style
	// -------------------------------------------------------------------------

	get classificationStyle() {
		return this._classificationStyle;
	}

	set classificationStyle(value) {
		if (this._classificationStyle !== value) {
			this._classificationStyle = value;
			this.updateShaderSource();
		}
	}

	// -------------------------------------------------------------------------
	// Segmentation overlay
	// -------------------------------------------------------------------------

	setSuperimposeClassification(value) {
		if (this._superimposeClassification !== value) {
			if (typeof value !== "boolean") {
				console.warn("SVXPointCloudMaterial: superimposeClassification must be boolean.");
				return;
			}
			this._superimposeClassification = value;
			this.updateShaderSource();
		}
	}

	setSegmentationLevel(level) {
		if (this._segmentationLevel !== level) {
			this._segmentationLevel = level;
			this.updateShaderSource();
		}
	}

	// -------------------------------------------------------------------------
	// Classification LUT recomputation (256×256 texture)
	// -------------------------------------------------------------------------

	recomputeClassification() {
		const classification = this.classification;
		const data = this.classificationTexture.image.data;
		const width = 65536;
		const black = [1, 1, 1, 1];
		let valuesChanged = false;

		for (let i = 0; i < width; i++) {
			let color;
			let visible = true;

			if (classification[i]) {
				color = classification[i].color;
				visible = classification[i].visible;
			} else if (classification[i % 32]) {
				color = classification[i % 32].color;
				visible = classification[i % 32].visible;
			} else if (classification.DEFAULT) {
				color = classification.DEFAULT.color;
				visible = classification.DEFAULT.visible;
			} else {
				color = black;
			}

			const r = parseInt(255 * color[0]);
			const g = parseInt(255 * color[1]);
			const b = parseInt(255 * color[2]);
			const a = visible ? parseInt(255 * color[3]) : 0;

			if (data[4 * i + 0] !== r) { data[4 * i + 0] = r; valuesChanged = true; }
			if (data[4 * i + 1] !== g) { data[4 * i + 1] = g; valuesChanged = true; }
			if (data[4 * i + 2] !== b) { data[4 * i + 2] = b; valuesChanged = true; }
			if (data[4 * i + 3] !== a) { data[4 * i + 3] = a; valuesChanged = true; }
		}

		if (valuesChanged) {
			this.classificationTexture.needsUpdate = true;
			this.dispatchEvent({ type: "material_property_changed", target: this });
		}
	}

	// -------------------------------------------------------------------------
	// Segmentation LUT recomputation (256-entry texture)
	// -------------------------------------------------------------------------

	recomputeSegmentation() {
		const segmentation = this.segmentation;
		const data = this.segmentationTexture.image.data;
		const width = 256;
		const black = [1, 1, 1, 1];
		let valuesChanged = false;

		for (let i = 0; i < width; i++) {
			let color;
			let visible = true;

			if (segmentation[i]) {
				color = segmentation[i].color;
				visible = segmentation[i].visible;
			} else if (segmentation[i % 32]) {
				color = segmentation[i % 32].color;
				visible = segmentation[i % 32].visible;
			} else if (segmentation.DEFAULT) {
				color = segmentation.DEFAULT.color;
				visible = segmentation.DEFAULT.visible;
			} else {
				color = black;
			}

			const r = parseInt(255 * color[0]);
			const g = parseInt(255 * color[1]);
			const b = parseInt(255 * color[2]);
			const a = visible ? parseInt(255 * color[3]) : 0;

			if (data[4 * i + 0] !== r) { data[4 * i + 0] = r; valuesChanged = true; }
			if (data[4 * i + 1] !== g) { data[4 * i + 1] = g; valuesChanged = true; }
			if (data[4 * i + 2] !== b) { data[4 * i + 2] = b; valuesChanged = true; }
			if (data[4 * i + 3] !== a) { data[4 * i + 3] = a; valuesChanged = true; }
		}

		if (valuesChanged) {
			this.segmentationTexture.needsUpdate = true;
			this.dispatchEvent({ type: "material_property_changed", target: this });
		}
	}

	// -------------------------------------------------------------------------
	// Convenience helpers (mirrors new-data-model API surface)
	// -------------------------------------------------------------------------

	setClassificationFromScheme(scheme) {
		this.classification = scheme;
		this.recomputeClassification();
	}

	setSegmentColor(index, color, visible = true) {
		this.classification[index] = { color, visible };
		this.recomputeClassification();
	}

	setSegmentClass(segmentId, classificationId) {
		// Map a segment ID to a classification bucket in the LUT
		if (this.classification[classificationId]) {
			const entry = this.classification[classificationId];
			this.setSegmentColor(segmentId, entry.color, entry.visible);
		}
	}
}
