/**
 * SVXPOCLoader
 *
 * Extends POCLoader to support signUrl for authenticated URL fetching.
 *
 * Changes vs base POCLoader:
 *  - Accepts signUrl as second argument
 *  - Uses signUrl for the initial metadata request
 *  - Passes signUrl to PointCloudOctreeGeometry constructor
 *  - More robust octreeDir path extraction (uses lastIndexOf instead of /../)
 */

import * as THREE from "../../../libs/three.js/build/three.module.js";
import { XHRFactory } from "../../XHRFactory.js";
import { PointCloudOctreeGeometry } from "../../PointCloudOctreeGeometry.js";
import { Version } from "../../Version.js";
import { POCLoader } from "../../loader/POCLoader.js";

export class SVXPOCLoader extends POCLoader {
	static async load(url, signUrl, callback) {
		const _signUrl = signUrl || (x => x);

		try {
			let pco = new PointCloudOctreeGeometry(url, _signUrl);
			let xhr = XHRFactory.createXMLHttpRequest();
			xhr.open("GET", await _signUrl(url), true);

			xhr.onreadystatechange = function () {
				if (xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 0)) {
					let fMno = JSON.parse(xhr.responseText);

					let version = new Version(fMno.version);

					if (fMno.octreeDir.indexOf("http") === 0) {
						pco.octreeDir = fMno.octreeDir;
					} else {
						// SVX: use lastIndexOf for robust path extraction
						const lastSlash = url.lastIndexOf("/");
						pco.octreeDir = url.substring(0, lastSlash + 1) + fMno.octreeDir;
					}

					pco.spacing = fMno.spacing;
					pco.hierarchyStepSize = fMno.hierarchyStepSize;
					pco.pointAttributes = fMno.pointAttributes;

					let min = new THREE.Vector3(fMno.boundingBox.lx, fMno.boundingBox.ly, fMno.boundingBox.lz);
					let max = new THREE.Vector3(fMno.boundingBox.ux, fMno.boundingBox.uy, fMno.boundingBox.uz);
					let boundingBox = new THREE.Box3(min, max);
					let tightBoundingBox = boundingBox.clone();

					if (fMno.tightBoundingBox) {
						tightBoundingBox.min.copy(new THREE.Vector3(
							fMno.tightBoundingBox.lx, fMno.tightBoundingBox.ly, fMno.tightBoundingBox.lz));
						tightBoundingBox.max.copy(new THREE.Vector3(
							fMno.tightBoundingBox.ux, fMno.tightBoundingBox.uy, fMno.tightBoundingBox.uz));
					}

					let offset = min.clone();
					boundingBox.min.sub(offset);
					boundingBox.max.sub(offset);

					let projection = "";
					if (fMno.projection) {
						projection = fMno.projection;
					}

					pco.projection = projection;
					pco.boundingBox = boundingBox;
					pco.tightBoundingBox = tightBoundingBox;
					pco.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
					pco.tightBoundingSphere = tightBoundingBox.getBoundingSphere(new THREE.Sphere());
					pco.offset = offset;

					if (fMno.pointAttributes === "LAS") {
						pco.loader = new Potree.LasLazLoader(fMno.version);
					} else if (fMno.pointAttributes === "LAZ") {
						pco.loader = new Potree.LasLazLoader(fMno.version);
					} else {
						pco.loader = new Potree.BinaryLoader(fMno.version, boundingBox, fMno.scale);
						pco.pointAttributes = POCLoader.parseAttributes(fMno.pointAttributes);
					}

					let nodes = {};

					{ // root
						let name = "r";

						let root = new Potree.PointCloudOctreeGeometryNode(name, pco, boundingBox);
						root.level = 0;
						root.hasChildren = false;
						root.spacing = pco.spacing;
						root.byteOffset = 0;

						pco.root = root;
						nodes[name] = root;
					}

					POCLoader.loadPointAttributes(pco);
					POCLoader.loadHierarchy(pco, nodes);

					pco.nodes = nodes;

					callback(pco);
				}
			};

			xhr.send(null);
		} catch (e) {
			console.error("SVXPOCLoader: Exception loading " + url, e);
		}
	}
}
