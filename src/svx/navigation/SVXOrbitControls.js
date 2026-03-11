/**
 * SVXOrbitControls
 *
 * Extends OrbitControls with one SVX behaviour change:
 *  - Double-click zoom is disabled (doubleClockZoomEnabled = false)
 */

import { OrbitControls } from "../../navigation/OrbitControls.js";

export class SVXOrbitControls extends OrbitControls {
	constructor(viewer) {
		super(viewer);
		// SVX: disable zoom on double-click
		this.doubleClockZoomEnabled = false;
	}
}
