
import * as THREE from "../../../../libs/three.js/build/three.module.js";

export class OctreeGeometry{

	constructor(){
		this.url = null;
		this.spacing = 0; // float
		this.boundingBox = null;
		this.root = null;
		this.pointAttributes = null;
		this.loader = null;
	}

};

export class OctreeGeometryNode{

	constructor(name, octreeGeometry, boundingBox){
		this.id = OctreeGeometryNode.IDCount++;
		this.name = name;
		this.index = parseInt(name.charAt(name.length - 1));
		this.octreeGeometry = octreeGeometry;
		this.boundingBox = boundingBox;
		this.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
		this.children = {};
		this.numPoints = 0;
		this.level = null;
		this.oneTimeDisposeHandlers = [];
		// SVX: bumped by PointCloudOctree.invalidateNodes() so in-flight loads
		// that started before an invalidation can detect they are stale.
		this.generation = 0;
		// SVX: loaded and on screen, but its bytes changed on storage; the visibility
		// pass re-fetches it and swaps the geometry in place (no blank frame).
		this.needsReload = false;
		// SVX: scalar names whose next fetch must bypass the HTTP cache.
		this.scalarCacheBust = null;
	}

	isGeometryNode(){
		return true;
	}

	getLevel(){
		return this.level;
	}

	isTreeNode(){
		return false;
	}

	isLoaded(){
		return this.loaded;
	}

	getBoundingSphere(){
		return this.boundingSphere;
	}

	getBoundingBox(){
		return this.boundingBox;
	}

	getChildren(){
		let children = [];

		for (let i = 0; i < 8; i++) {
			if (this.children[i]) {
				children.push(this.children[i]);
			}
		}

		return children;
	}

	getBoundingBox(){
		return this.boundingBox;
	}

	load(){

		if (Potree.numNodesLoading >= Potree.maxNodesLoading) {
			return;
		}

		this.octreeGeometry.loader.load(this);
	}

	getNumPoints(){
		return this.numPoints;
	}

	// `force` lets SVX invalidation dispose the root (and its direct children),
	// which the LRU never evicts.
	dispose(force = false){
		if (this.geometry && (force || this.parent != null)) {
			this.geometry.dispose();
			this.geometry = null;
			this.loaded = false;

			// this.dispatchEvent( { type: 'dispose' } );
			for (let i = 0; i < this.oneTimeDisposeHandlers.length; i++) {
				let handler = this.oneTimeDisposeHandlers[i];
				handler();
			}
			this.oneTimeDisposeHandlers = [];
		}
	}

};

OctreeGeometryNode.IDCount = 0;