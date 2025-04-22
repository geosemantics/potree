
import * as THREE from "../../libs/three.js/build/three.module.js";
import { Gradients } from "./Gradients.js";


function getColorFromGradient(t, gradient) {
	// get nearest color from gradient
	let color = new THREE.Color(0, 0, 0);
	let minDiff = Number.MAX_VALUE;
	let minIndex = 0;
	for (let i = 0; i < gradient.length; i++) {
		let diff = Math.abs(gradient[i][0] - t);
		if (diff < minDiff) {
			minDiff = diff;
			minIndex = i;
		}
	}
	color.copy(gradient[minIndex][1]);
	return color.toArray().slice(0, 3).concat(1.0); // add alpha channel
}


export const SegmentationScheme = {
};

// Default color: random color from VIRIDIS gradient
Object.defineProperty(SegmentationScheme, "DEFAULT", {
  get: function () {
	let scheme = {};

	for (let i = 0; i <= 255; i++) {
	  let t = i / 255;
	  scheme[i] = {
		visible: true,
		name: "Seg " + i,
		color: getColorFromGradient(Math.random(), Gradients.VIRIDIS),
	  }; // viridisColorRamp(t) };
	}

	scheme["DEFAULT"] = {
	  visible: true,
	  name: "default",
	  color: getColorFromGradient(0.5, Gradients.VIRIDIS),
	};

	return scheme;
  },
});

Object.defineProperty(SegmentationScheme, 'RANDOM', {
	get: function() { 

		let scheme = {};

		for(let i = 0; i <= 255; i++){
			// scheme[i] = new THREE.Vector4(Math.random(), Math.random(), Math.random());
			scheme[i] = { visible: true, name: 'Seg '+i , color: [Math.random(), Math.random(), Math.random(), 1.0] };
		}

		scheme["DEFAULT"] = new THREE.Vector4(Math.random(), Math.random(), Math.random());

		return scheme;
	}
});