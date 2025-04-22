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

// Default color: random color from VIRIDIS gradient
function getDefault() {
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
}

const DEFAULT = getDefault();

export const ClassificationScheme = {
  //   DEFAULT: {
  //     0: { visible: true, name: "never classified", color: [0.5, 0.5, 0.5, 1.0] },
  //     1: { visible: true, name: "unclassified", color: [0.5, 0.5, 0.5, 1.0] },
  //     2: { visible: true, name: "ground", color: [0.63, 0.32, 0.18, 1.0] },
  //     3: { visible: true, name: "low vegetation", color: [0.0, 1.0, 0.0, 1.0] },
  //     4: {
  //       visible: true,
  //       name: "medium vegetation",
  //       color: [0.0, 0.8, 0.0, 1.0],
  //     },
  //     5: { visible: true, name: "high vegetation", color: [0.0, 0.6, 0.0, 1.0] },
  //     6: { visible: true, name: "building", color: [1.0, 0.66, 0.0, 1.0] },
  //     7: { visible: true, name: "low point(noise)", color: [1.0, 0.0, 1.0, 1.0] },
  //     8: { visible: true, name: "key-point", color: [1.0, 0.0, 0.0, 1.0] },
  //     9: { visible: true, name: "water", color: [0.0, 0.0, 1.0, 1.0] },
  //     12: { visible: true, name: "overlap", color: [1.0, 1.0, 0.0, 1.0] },
  //     DEFAULT: { visible: true, name: "default", color: [0.3, 0.6, 0.6, 0.5] },
  //   },
  DEFAULT: DEFAULT,
};

Object.defineProperty(ClassificationScheme, "RANDOM", {
  get: function () {
    let scheme = {};

    for (let i = 0; i <= 255; i++) {
      // scheme[i] = new THREE.Vector4(Math.random(), Math.random(), Math.random());
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
