/**
 * SVXClassificationScheme
 *
 * SVX override of ClassificationScheme. Replaces the DEFAULT scheme with a
 * minimal "unclassified" entry so that segment-based classification can
 * populate the lookup table dynamically, rather than showing the standard
 * LiDAR class colours by default.
 */

import * as THREE from "../../../libs/three.js/build/three.module.js";

function getDefault() {
	let scheme = {};

	scheme["DEFAULT"] = {
		visible: true,
		name: "unclassified",
		color: [1.0, 1.0, 1.0, 1.0],
	};

	return scheme;
}

export const SVXClassificationScheme = {
	DEFAULT: getDefault(),
};

Object.defineProperty(SVXClassificationScheme, "RANDOM", {
	get: function () {
		let scheme = {};
		for (let i = 0; i <= 255; i++) {
			scheme[i] = {
				visible: true,
				name: "Seg " + i,
				color: [Math.random(), Math.random(), Math.random(), 1.0],
			};
		}
		scheme["DEFAULT"] = new THREE.Vector4(
			Math.random(),
			Math.random(),
			Math.random()
		);
		return scheme;
	},
});
