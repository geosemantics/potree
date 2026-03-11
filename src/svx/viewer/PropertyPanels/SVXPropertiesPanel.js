/**
 * SVXPropertiesPanel
 *
 * Extends PropertiesPanel to add a Classification Source section when a
 * point cloud attribute named "classification" is active.
 *
 * The extra UI element lets the user toggle between:
 *  - "From Segmentation" — classification derived from segment IDs (default)
 *  - "From Point Data"   — raw per-point classification attribute
 *
 * This requires the point cloud to be using SVXPointCloudMaterial (which
 * exposes the `classificationStyle` setter).
 */

import { PropertiesPanel } from "../../viewer/PropertyPanels/PropertiesPanel.js";

export class SVXPropertiesPanel extends PropertiesPanel {
	constructor(container, viewer) {
		super(container, viewer);
	}

	setPointCloud(pointcloud) {
		// Let the parent build the full panel first
		super.setPointCloud(pointcloud);

		const material = pointcloud.material;

		// Only add SVX controls if the material supports classificationStyle
		if (typeof material.classificationStyle === "undefined") {
			return;
		}

		// ---------------------------------------------------------------
		// 1. Insert the Classification Source container into the DOM
		// ---------------------------------------------------------------
		const intensityContainer = this.container.find("#materials\\.intensity_container");

		const classificationHtml = `
			<div id="materials.classification_container">
				<div class="divider">
					<span>Classification</span>
				</div>
				<li>
					<span>Classification Source:</span>
					<selectgroup id="classification_style_option">
						<option id="classification_style_from_segment" value="from_segment">From Segmentation</option>
						<option id="classification_style_raw" value="raw">From Point Data</option>
					</selectgroup>
				</li>
			</div>`;

		intensityContainer.after(classificationHtml);

		const blockClassification = this.container.find("#materials\\.classification_container");
		blockClassification.css("display", "none");

		// ---------------------------------------------------------------
		// 2. Show / hide the classification container when the attribute
		//    selection changes.
		// ---------------------------------------------------------------
		const attributeSelection = this.container.find("#optMaterial");

		const updateClassificationVisibility = () => {
			const selectedValue = attributeSelection.selectmenu
				? attributeSelection.selectmenu().val()
				: attributeSelection.val();
			if (selectedValue === "classification") {
				blockClassification.css("display", "block");
			} else {
				blockClassification.css("display", "none");
			}
		};

		attributeSelection.on("selectmenuchange", updateClassificationVisibility);

		// Apply to the current selection immediately
		updateClassificationVisibility();

		// Also keep it in sync when programmatic changes trigger the event
		this.addVolatileListener(material, "point_color_type_changed", updateClassificationVisibility);
		this.addVolatileListener(material, "active_attribute_changed", updateClassificationVisibility);

		// ---------------------------------------------------------------
		// 3. Set up the Classification Source selectgroup
		// ---------------------------------------------------------------
		const elClassificationStyle = this.container.find("#classification_style_option");

		elClassificationStyle.selectgroup({ title: "Classification Source" });

		elClassificationStyle.find("input").click((e) => {
			material.classificationStyle = e.target.value;
		});

		// Reflect the current style on the UI
		const current = material.classificationStyle;
		elClassificationStyle.find(`input[value=${current}]`).trigger("click");
	}
}
