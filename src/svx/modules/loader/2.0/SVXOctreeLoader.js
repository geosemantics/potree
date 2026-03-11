/**
 * SVXOctreeLoader / SVXNodeLoader
 *
 * Extends the base NodeLoader and OctreeLoader to add:
 *  - signUrl support (authenticated / pre-signed URL fetching)
 *  - Auth header injection via Potree.authManager
 *  - External scalar attribute loading from /scalars/{name}.bin files
 *  - SVXDecoderWorker usage (supports scalar buffer interleaving)
 *  - Composed point attributes (octree + scalar attributes from metadata)
 */

import * as THREE from "../../../../libs/three.js/build/three.module.js";
import {
	PointAttribute,
	PointAttributes,
	PointAttributeTypes,
} from "../../../loader/PointAttributes.js";
import { OctreeGeometry, OctreeGeometryNode } from "../../../modules/loader/2.0/OctreeGeometry.js";
import { NodeLoader, OctreeLoader } from "../../../modules/loader/2.0/OctreeLoader.js";

// ---------------------------------------------------------------------------
// SVXNodeLoader
// ---------------------------------------------------------------------------

export class SVXNodeLoader extends NodeLoader {
	constructor(url, signUrl) {
		super(url);
		this.signUrl = signUrl || (x => x);
		this.auth_headers = (typeof Potree !== "undefined" && Potree.authManager)
			? Potree.authManager.getHeaders()
			: {};
		this.registeredExternalScalars = [];
	}

	async load(node) {
		if (node.loaded || node.loading) {
			return;
		}

		node.loading = true;
		Potree.numNodesLoading++;

		try {
			if (node.nodeType === 2) {
				await this.loadHierarchy(node);
			}

			let { byteOffset, byteSize } = node;

			const lastSlash = this.url.lastIndexOf("/");
			const urlOctree = `${this.url.substring(0, lastSlash + 1)}octree.bin`;

			let first = byteOffset;
			let last = byteOffset + byteSize - 1n;

			let buffer;
			let scalarBufferAttributes = [];

			if (byteSize === 0n) {
				buffer = new ArrayBuffer(0);
				console.warn(`loaded node with 0 bytes: ${node.name}`);
			} else {
				const headers = { Range: `bytes=${first}-${last}` };
				const response = await fetch(
					await this.signUrl(urlOctree, headers),
					{ headers }
				);
				buffer = await response.arrayBuffer();

				// SVX: perform additional range requests to load external scalar attributes
				// Scalars live next to the octree.bin, in /scalars/{scalar_name}.bin
				for (const scalar of this.registeredExternalScalars) {
					const scalarAttr = node.octreeGeometry.pointAttributes.attributes.find(
						(a) => a.name === scalar,
					);

					if (!scalarAttr) continue;

					const bpp_octree = BigInt(this.metadata.bpp);
					const bpp_scalar = BigInt(scalarAttr.byteSize);

					const scalarFirst = (byteOffset / bpp_octree) * bpp_scalar;
					const scalarByteSize = (byteSize / bpp_octree) * bpp_scalar;
					const scalarLast = scalarFirst + scalarByteSize - 1n;
					const scalarHeaders = { Range: `bytes=${scalarFirst}-${scalarLast}` };

					const scalarUrl = `${this.url.substring(0, lastSlash + 1)}scalars/${scalar}.bin`;
					const scalarResponse = await fetch(
						await this.signUrl(scalarUrl, scalarHeaders),
						{ headers: scalarHeaders }
					);
					const scalarBuffer = await scalarResponse.arrayBuffer();

					scalarBufferAttributes.push({
						buffer: scalarBuffer,
						byteSize: scalarAttr.byteSize,
						name: scalar,
						attribute: scalarAttr,
					});
				}
			}

			// Use SVX worker (supports scalar buffer interleaving)
			let workerPath;
			if (this.metadata.encoding === "BROTLI") {
				workerPath = Potree.scriptPath + "/workers/2.0/DecoderWorker_brotli.js";
			} else {
				workerPath = Potree.scriptPath + "/workers/2.0/SVXDecoderWorker.js";
			}

			let worker = Potree.workerPool.getWorker(workerPath);

			worker.onmessage = function (e) {
				let data = e.data;
				let buffers = data.attributeBuffers;

				Potree.workerPool.returnWorker(workerPath, worker);

				let geometry = new THREE.BufferGeometry();

				for (let property in buffers) {
					let buffer = buffers[property].buffer;

					if (property === "position") {
						geometry.setAttribute(
							"position",
							new THREE.BufferAttribute(new Float32Array(buffer), 3),
						);
					} else if (property === "rgba") {
						geometry.setAttribute(
							"rgba",
							new THREE.BufferAttribute(new Uint8Array(buffer), 4, true),
						);
					} else if (property === "NORMAL") {
						geometry.setAttribute(
							"normal",
							new THREE.BufferAttribute(new Float32Array(buffer), 3),
						);
					} else if (property === "INDICES") {
						let bufferAttribute = new THREE.BufferAttribute(
							new Uint8Array(buffer),
							4,
						);
						bufferAttribute.normalized = true;
						geometry.setAttribute("indices", bufferAttribute);
					} else if (
						["Level1", "Level2", "Level3",
						 "segmentation1", "segmentation2", "segmentation3"].includes(property)
					) {
						const bufferAttribute = new THREE.BufferAttribute(
							new Float32Array(buffer),
							1,
						);

						let batchAttribute = buffers[property].attribute;
						bufferAttribute.potree = {
							offset: buffers[property].offset,
							scale: buffers[property].scale,
							preciseBuffer: buffers[property].preciseBuffer,
							range: batchAttribute.range,
						};

						// SVX: Map Level{N} names to segmentation{N}
						if (property === "Level1") {
							property = "segmentation1";
						} else if (property === "Level2") {
							property = "segmentation2";
						} else if (property === "Level3") {
							property = "segmentation3";
						}

						geometry.setAttribute(property, bufferAttribute);
					} else {
						const bufferAttribute = new THREE.BufferAttribute(
							new Float32Array(buffer),
							1,
						);

						let batchAttribute = buffers[property].attribute;
						bufferAttribute.potree = {
							offset: buffers[property].offset,
							scale: buffers[property].scale,
							preciseBuffer: buffers[property].preciseBuffer,
							range: batchAttribute.range,
						};

						geometry.setAttribute(property, bufferAttribute);
					}
				}

				node.density = data.density;
				node.geometry = geometry;
				node.loaded = true;
				node.loading = false;
				Potree.numNodesLoading--;
			};

			let pointAttributes = node.octreeGeometry.pointAttributes;
			let scale = node.octreeGeometry.scale;

			let box = node.boundingBox;
			let min = node.octreeGeometry.offset.clone().add(box.min);
			let size = box.max.clone().sub(box.min);
			let max = min.clone().add(size);
			let numPoints = node.numPoints;

			let offset = node.octreeGeometry.loader.offset;

			let message = {
				name: node.name,
				buffer: buffer,
				pointAttributes: pointAttributes,
				scalarBuffer: scalarBufferAttributes.length > 0
					? { attributes: scalarBufferAttributes }
					: null,
				scale: scale,
				min: min,
				max: max,
				size: size,
				offset: offset,
				numPoints: numPoints,
			};

			worker.postMessage(message, [message.buffer]);
		} catch (e) {
			node.loaded = false;
			node.loading = false;
			Potree.numNodesLoading--;

			console.log(`SVXNodeLoader: failed to load ${node.name}`);
			console.log(e);
		}
	}
}

// ---------------------------------------------------------------------------
// SVXOctreeLoader
// ---------------------------------------------------------------------------

export class SVXOctreeLoader extends OctreeLoader {
	static async load(url, signUrl) {
		const _signUrl = signUrl || (x => x);

		const response = await fetch(await _signUrl(url));
		if (!response.ok) {
			if ([403, 404].includes(response.status)) {
				return {};
			}
			throw new Error(
				`Fetch error type: ${response.type}, status: ${response.status} ${response.statusText}`,
			);
		}
		let metadata = await response.json();

		// Parse standard attributes plus SVX scalar attributes
		let attributes = OctreeLoader.parseAttributes(metadata.attributes);
		let scalarAttributes = OctreeLoader.parseAttributes(
			metadata.scalarAttributes || [],
		);

		let loader = new SVXNodeLoader(url, _signUrl);
		loader.metadata = metadata;
		loader.attributes = attributes;
		loader.scalarAttributes = scalarAttributes;
		loader.scale = metadata.scale;
		loader.offset = metadata.offset;

		// Register external scalar attribute names for range-request loading
		const registeredExternalScalars = metadata.scalarAttributes
			? metadata.scalarAttributes.map((attr) => attr.name)
			: [];
		loader.registeredExternalScalars = registeredExternalScalars;

		let octree = new OctreeGeometry();
		octree.url = url;
		octree.spacing = metadata.spacing;
		octree.scale = metadata.scale;

		let min = new THREE.Vector3(...metadata.boundingBox.min);
		let max = new THREE.Vector3(...metadata.boundingBox.max);
		let boundingBox = new THREE.Box3(min, max);

		let offset = min.clone();
		boundingBox.min.sub(offset);
		boundingBox.max.sub(offset);

		octree.projection = metadata.projection;
		octree.boundingBox = boundingBox;
		octree.tightBoundingBox = boundingBox.clone();
		octree.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
		octree.tightBoundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
		octree.offset = offset;

		// SVX: Compose point attributes from octree + scalar attributes
		const composedAttributes = [
			...metadata.attributes,
			...(metadata.scalarAttributes || []),
		];
		octree.pointAttributes = OctreeLoader.parseAttributes(composedAttributes);

		octree.loader = loader;

		let root = new OctreeGeometryNode("r", octree, boundingBox);
		root.level = 0;
		root.nodeType = 2;
		root.hierarchyByteOffset = 0n;
		root.hierarchyByteSize = BigInt(metadata.hierarchy.firstChunkSize);
		root.hasChildren = false;
		root.spacing = octree.spacing;
		root.byteOffset = 0;

		octree.root = root;

		loader.load(root);

		return { geometry: octree };
	}
}
