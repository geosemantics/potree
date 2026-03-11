/**
 * SVXEarthControls
 *
 * Extends EarthControls with two SVX-specific behaviour changes:
 *  1. LEFT mouse drag → rotate, RIGHT mouse drag → pan (swapped vs. original)
 *  2. Double-click no longer triggers zoom-to-location
 */

import * as THREE from "../../../libs/three.js/build/three.module.js";
import { MOUSE } from "../../defines.js";
import { Utils } from "../../utils.js";
import { EarthControls } from "../../navigation/EarthControls.js";

export class SVXEarthControls extends EarthControls {
constructor(viewer) {
super(viewer);

// Remove the parent drag listener (uses opposite mouse-button mapping)
this.removeEventListeners("drag");
// Register SVX drag with swapped left/right
this.addEventListener("drag", this._svxDrag.bind(this));

// Remove dblclick zoom-to-location
this.removeEventListeners("dblclick");
}

_svxDrag(e) {
if (e.drag.object !== null) return;
if (!this.pivot) return;

if (e.drag.startHandled === undefined) {
e.drag.startHandled = true;
this.dispatchEvent({ type: "start" });
}

let camStart = this.camStart;
let camera = this.scene.getActiveCamera();
let view = this.viewer.scene.view;
let mouse = e.drag.end;
let domElement = this.viewer.renderer.domElement;

// SVX: RIGHT mouse → pan (was LEFT in original EarthControls)
if (e.drag.mouse === MOUSE.RIGHT) {
let ray = Utils.mouseToRay(mouse, camera, domElement.clientWidth, domElement.clientHeight);
let plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
new THREE.Vector3(0, 0, 1),
this.pivot
);

let distanceToPlane = ray.distanceToPlane(plane);

if (distanceToPlane > 0) {
let I = new THREE.Vector3().addVectors(
camStart.position,
ray.direction.clone().multiplyScalar(distanceToPlane)
);

let movedBy = new THREE.Vector3().subVectors(I, this.pivot);
let newCamPos = camStart.position.clone().sub(movedBy);

view.position.copy(newCamPos);

{
let distance = newCamPos.distanceTo(this.pivot);
view.radius = distance;
let speed = view.radius / 2.5;
this.viewer.setMoveSpeed(speed);
}
}
}
// SVX: LEFT mouse → rotate (was RIGHT in original EarthControls)
else if (e.drag.mouse === MOUSE.LEFT) {
let ndrag = {
x: e.drag.lastDrag.x / this.renderer.domElement.clientWidth,
y: e.drag.lastDrag.y / this.renderer.domElement.clientHeight,
};

let yawDelta = -ndrag.x * this.rotationSpeed * 0.5;
let pitchDelta = -ndrag.y * this.rotationSpeed * 0.2;

let originalPitch = view.pitch;
let tmpView = view.clone();
tmpView.pitch = tmpView.pitch + pitchDelta;
pitchDelta = tmpView.pitch - originalPitch;

let pivotToCam = new THREE.Vector3().subVectors(view.position, this.pivot);
let pivotToCamTarget = new THREE.Vector3().subVectors(view.getPivot(), this.pivot);
let side = view.getSide();

pivotToCam.applyAxisAngle(side, pitchDelta);
pivotToCamTarget.applyAxisAngle(side, pitchDelta);

pivotToCam.applyAxisAngle(new THREE.Vector3(0, 0, 1), yawDelta);
pivotToCamTarget.applyAxisAngle(new THREE.Vector3(0, 0, 1), yawDelta);

let newCam = new THREE.Vector3().addVectors(this.pivot, pivotToCam);

view.position.copy(newCam);
view.yaw += yawDelta;
view.pitch += pitchDelta;
}
}
}
