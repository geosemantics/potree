import * as THREE from "../../../../libs/three.js/build/three.module.js";
import {
  PointAttribute,
  PointAttributes,
  PointAttributeTypes,
} from "../../../loader/PointAttributes.js";
import { OctreeGeometry, OctreeGeometryNode } from "./OctreeGeometry.js";


// let loadedNodes = new Set();
class StaleNodeLoad extends Error {}

// Convert the decoder's attribute buffers into BufferAttributes on `geometry`.
// Shared by the main node load and the lazy scalar load.
function addDecodedAttributes(geometry, buffers) {
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
    } else {
      if (property === "segmentation" && geometry.getAttribute("segmentation")) {
        continue;
      }

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
}


export class NodeLoader {
  constructor(url, signUrl, signal) {
    this.url = url;
    this.signUrl = signUrl;
    this.signal = signal;
    this.auth_headers = Potree.authManager.getHeaders();
    // SVX: set by PointCloudOctree. getWantedScalars() -> Set of scalar names
    // to fetch with every node; onScalarError(names, error) reports failures.
    this.getWantedScalars = null;
    this.onScalarError = null;
    this.numScalarLoads = 0;
    // Scalars whose fetch failed; not wanted again until explicitly re-requested.
    this.failedScalars = new Set();
  }

  async load(node) {
    // console.log(`loading node`,node);

    if (
      (node.loaded && !node.needsReload) ||
      node.loading ||
      (this.signal && this.signal.aborted)
    ) {
      return;
    }

    // SVX: refresh of an already loaded node; keep showing the old geometry
    // until the new one is ready. Anything invalidated from here on sets
    // needsReload again and is picked up by the next visibility pass.
    const replacing = node.loaded && node.needsReload;
    node.needsReload = false;

    node.loading = true;
    Potree.numNodesLoading++;

    // SVX: a load that straddles PointCloudOctree.invalidateNodes() is stale
    // and must not populate the node with pre-invalidation data.
    const generation = node.generation;
    const bustScalars = node.scalarCacheBust;
    const assertFresh = () => {
      if (node.generation !== generation) throw new StaleNodeLoad();
    };

    // console.log(node.name, node.numPoints);

    // if(loadedNodes.has(node.name)){
    // 	// debugger;
    // }
    // loadedNodes.add(node.name);

    try {
      // Proxy Node: points to another chunk
      if (node.nodeType === 2) {
        await this.loadHierarchy(node);
      }

      let { byteOffset, byteSize } = node;

      const lastSlash = this.url.lastIndexOf("/");
      const urlOctree = `${this.url.substring(0, lastSlash + 1)}octree.bin`;

      let first = byteOffset;
      let last = byteOffset + byteSize - 1n; // 1n: verbosely use BigInt precision (num > regular Number)

      let buffer;
      let scalarBufferAttributes = [];

      // SVX: scalars are lazy. Only the ones currently wanted (active
      // attribute, overlays, selection...) ride along with the main bin.
      let scalarsToLoad = this.getScalarAttributesToLoad(node);

      if (byteSize === 0n) {
        buffer = new ArrayBuffer(0);
        console.warn(`loaded node with 0 bytes: ${node.name}`);
      } else {
        const headers = { Range: `bytes=${first}-${last}` };
        const mainRequest = (async () => {
          const response = await fetch(await this.signUrl(urlOctree, headers, this.signal), {
            headers,
            signal: this.signal,
          });
          return response.arrayBuffer();
        })();

        const [mainBuffer, scalarBuffers] = await Promise.all([
          mainRequest,
          Promise.all(
            scalarsToLoad.map((attr) =>
              // A broken scalar must not stop the node itself from loading.
              this.fetchScalar(node, attr, bustScalars).catch((e) => {
                if (this.signal && this.signal.aborted) throw e;
                if (this.onScalarError) this.onScalarError([attr.name], e);
                return null;
              }),
            ),
          ),
        ]);
        buffer = mainBuffer;
        assertFresh();

        const fetched = scalarsToLoad.filter((_, i) => scalarBuffers[i] !== null);
        scalarBufferAttributes = fetched.map((attr) => ({
          buffer: scalarBuffers[scalarsToLoad.indexOf(attr)],
          byteSize: attr.byteSize,
          name: attr.name,
          attribute: attr,
        }));
        scalarsToLoad = fetched;
      }

      if (this.signal) this.signal.throwIfAborted();

      let workerPath;
      if (this.metadata.encoding === "BROTLI") {
        // console.debug("Using brotli decoder worker");
        workerPath = Potree.scriptPath + "/workers/2.0/DecoderWorker_brotli.js";
      } else {
        // console.debug("Using standard decoder worker");
        workerPath = Potree.scriptPath + "/workers/2.0/DecoderWorker.js";
      }

      let worker = Potree.workerPool.getWorker(workerPath);

      worker.onmessage = (e) => {
        let data = e.data;
        let buffers = data.attributeBuffers;

        Potree.workerPool.returnWorker(workerPath, worker);

        if (this.signal && this.signal.aborted) {
          node.loading = false;
          Potree.numNodesLoading--;
          return;
        }

        if (node.generation !== generation) {
          // Invalidated while decoding: drop the result, the node reloads
          // on the next visibility pass.
          node.loading = false;
          Potree.numNodesLoading--;
          return;
        }

        let geometry = new THREE.BufferGeometry();
        addDecodedAttributes(geometry, buffers);

        const previousGeometry = replacing && node.loaded ? node.geometry : null;
        node.density = data.density;
        node.geometry = geometry;
        node.scalarCacheBust = null;
        if (previousGeometry) {
          if (node.sceneNode) node.sceneNode.geometry = geometry;
          previousGeometry.dispose(); // free the old GPU buffers now
        }
        node.loadedScalars = new Set(scalarsToLoad.map((a) => a.name));
        node.loaded = true;
        node.loading = false;
        Potree.numNodesLoading--;
      };

      // Hand the decoder only the attributes present in the buffers.
      const fullAttributes = node.octreeGeometry.pointAttributes;
      const lazyNames = new Set(this.registeredExternalScalars);
      const loadedNames = new Set(scalarsToLoad.map((a) => a.name));
      let pointAttributes = {
        attributes: fullAttributes.attributes.filter(
          (a) => !lazyNames.has(a.name) || loadedNames.has(a.name),
        ),
        vectors: fullAttributes.vectors,
      };
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
        scalarBuffer:
          scalarBufferAttributes.length > 0
            ? {
                attributes: scalarBufferAttributes,
              }
            : null,
        scale: scale,
        min: min,
        max: max,
        size: size,
        offset: offset,
        numPoints: numPoints,
      };
      // console.log("Posting message to worker:", message);

      worker.postMessage(message, [message.buffer]);
    } catch (e) {
      // A failed refresh keeps the old geometry and is retried.
      if (replacing) node.needsReload = true;
      else node.loaded = false;
      node.loading = false;
      Potree.numNodesLoading--;

      if (this.signal && this.signal.aborted) return;
      if (e instanceof StaleNodeLoad) return;

      console.log(`failed to load ${node.name}`);
      console.log(e);
      console.log(`trying again!`);
    }
  }

  // SVX: the external scalars (in pointAttributes order) that should be
  // fetched together with a node's main bin right now.
  getScalarAttributesToLoad(node) {
    if (this.metadata.encoding === "BROTLI") return [];
    const wanted = this.getWantedScalars ? this.getWantedScalars() : null;
    if (!wanted || wanted.size === 0) return [];
    const lazyNames = new Set(this.registeredExternalScalars);
    return node.octreeGeometry.pointAttributes.attributes.filter(
      (a) => lazyNames.has(a.name) && wanted.has(a.name),
    );
  }

  // SVX: range-request one scalar's slice for `node` from scalars/{name}.bin.
  async fetchScalar(node, scalarAttr, bustScalars) {
    const { byteOffset, byteSize } = node;
    const lastSlash = this.url.lastIndexOf("/");

    // Scalar byte offsets follow from the point index in the main bin.
    const bpp_octree = BigInt(this.metadata.bpp);
    const bpp_scalar = BigInt(scalarAttr.byteSize);
    const scalarFirst = (byteOffset / bpp_octree) * bpp_scalar;
    const scalarLast = scalarFirst + (byteSize / bpp_octree) * bpp_scalar - 1n;

    const headers = { Range: `bytes=${scalarFirst}-${scalarLast}` };
    const scalarUrl = `${this.url.substring(0, lastSlash + 1)}scalars/${scalarAttr.name}.bin`;
    const response = await fetch(
      await this.signUrl(scalarUrl, headers, this.signal),
      {
        headers,
        signal: this.signal,
        // Invalidated scalars must not be served from the HTTP cache.
        ...(bustScalars && bustScalars.has(scalarAttr.name)
          ? { cache: "reload" }
          : {}),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Scalar ${scalarAttr.name} fetch failed: ${response.status} ${response.statusText}`,
      );
    }
    return response.arrayBuffer();
  }

  /**
   * SVX: lazy-load external scalars onto an already loaded node. Resolves
   * once the attributes are on `node.geometry` (or the attempt was dropped).
   * Failures are reported through `this.onScalarError(names, error)` and
   * never retried by this call.
   */
  async loadScalars(node, names) {
    if (
      !node.loaded || !node.geometry || node.loading || node.needsReload ||
      (this.signal && this.signal.aborted)
    ) {
      return;
    }
    names = names.filter(
      (n) => !node.loadedScalars.has(n) && !node.loadingScalars.has(n),
    );
    if (names.length === 0) return;

    const fail = (error) => {
      if (this.onScalarError) this.onScalarError(names, error);
    };

    if (this.metadata.encoding === "BROTLI") {
      return fail(new Error("External scalars are not supported with BROTLI encoding"));
    }

    const attrs = node.octreeGeometry.pointAttributes.attributes.filter((a) =>
      names.includes(a.name),
    );

    // Empty node: nothing to fetch.
    if (node.byteSize === 0n || node.numPoints === 0) {
      attrs.forEach((a) => node.loadedScalars.add(a.name));
      return;
    }

    names.forEach((n) => node.loadingScalars.add(n));
    this.numScalarLoads++;

    const generation = node.generation;
    const geometry = node.geometry;
    const bustScalars = node.scalarCacheBust;
    const isStale = () =>
      node.generation !== generation || node.geometry !== geometry;

    try {
      const buffers = await Promise.all(
        attrs.map((attr) => this.fetchScalar(node, attr, bustScalars)),
      );
      if (isStale()) return;
      if (this.signal) this.signal.throwIfAborted();

      const workerPath = Potree.scriptPath + "/workers/2.0/DecoderWorker.js";
      const worker = Potree.workerPool.getWorker(workerPath);

      const decoded = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          Potree.workerPool.returnWorker(workerPath, worker);
          resolve(e.data.attributeBuffers);
        };
        worker.onerror = (e) => {
          Potree.workerPool.returnWorker(workerPath, worker);
          reject(new Error(e.message || "scalar decoder worker failed"));
        };
        const scalarBuffer = {
          attributes: attrs.map((attr, i) => ({
            buffer: buffers[i],
            byteSize: attr.byteSize,
            name: attr.name,
            attribute: attr,
          })),
        };
        // Scalar-only decode: no main buffer, no position/rgba/vectors.
        worker.postMessage(
          {
            name: node.name,
            buffer: new ArrayBuffer(0),
            pointAttributes: { attributes: attrs, vectors: [] },
            scalarBuffer,
            scale: node.octreeGeometry.scale,
            min: new THREE.Vector3(),
            max: new THREE.Vector3(),
            size: new THREE.Vector3(1, 1, 1),
            offset: node.octreeGeometry.loader.offset,
            numPoints: node.numPoints,
          },
          buffers,
        );
      });
      if (isStale()) return;

      const scalarsOnly = {};
      for (const attr of attrs) scalarsOnly[attr.name] = decoded[attr.name];
      addDecodedAttributes(geometry, scalarsOnly);
      attrs.forEach((a) => node.loadedScalars.add(a.name));
    } catch (e) {
      if (this.signal && this.signal.aborted) return;
      if (e instanceof StaleNodeLoad) return;
      fail(e);
    } finally {
      names.forEach((n) => node.loadingScalars.delete(n));
      this.numScalarLoads--;
    }
  }

  parseHierarchy(node, buffer) {
    let view = new DataView(buffer);
    let tStart = performance.now();

    let bytesPerNode = 22;
    let numNodes = buffer.byteLength / bytesPerNode;

    let octree = node.octreeGeometry;
    // let nodes = [node];
    let nodes = new Array(numNodes);
    nodes[0] = node;
    let nodePos = 1;

    // console.log(`Will parse ${numNodes} nodes (bbg/bpn = ${buffer.byteLength}/${bytesPerNode})`);

    for (let i = 0; i < numNodes; i++) {
      let current = nodes[i];

      let type = view.getUint8(i * bytesPerNode + 0);
      let childMask = view.getUint8(i * bytesPerNode + 1);
      let numPoints = view.getUint32(i * bytesPerNode + 2, true);
      let byteOffset = view.getBigInt64(i * bytesPerNode + 6, true);
      let byteSize = view.getBigInt64(i * bytesPerNode + 14, true);

      // if(byteSize === 0n){
      // 	// debugger;
      // }

      if (current.nodeType === 2) {
        // replace proxy with real node
        current.byteOffset = byteOffset;
        current.byteSize = byteSize;
        current.numPoints = numPoints;
      } else if (type === 2) {
        // load proxy
        current.hierarchyByteOffset = byteOffset;
        current.hierarchyByteSize = byteSize;
        current.numPoints = numPoints;
      } else {
        // load real node
        current.byteOffset = byteOffset;
        current.byteSize = byteSize;
        current.numPoints = numPoints;
      }

      current.nodeType = type;

      if (current.nodeType === 2) {
        continue;
      }

      for (let childIndex = 0; childIndex < 8; childIndex++) {
        let childExists = ((1 << childIndex) & childMask) !== 0;

        if (!childExists) {
          continue;
        }

        let childName = current.name + childIndex;

        let childAABB = createChildAABB(current.boundingBox, childIndex);
        let child = new OctreeGeometryNode(childName, octree, childAABB);
        child.name = childName;
        child.spacing = current.spacing / 2;
        child.level = current.level + 1;

        current.children[childIndex] = child;
        child.parent = current;

        // nodes.push(child);
        nodes[nodePos] = child;
        // console.log("Nodes", nodes.length, nodes)
        nodePos++;
      }

      // if((i % 500) === 0){
      // 	yield;
      // }
    }

    let duration = performance.now() - tStart;

    // if(duration > 20){
    // 	let msg = `duration: ${duration}ms, numNodes: ${numNodes}`;
    // 	console.log(msg);
    // }
  }

  /**
   * SVX: re-read the tile's metadata.json after its external scalars changed
   * on storage, and update attribute ranges / the registered scalar list in
   * place. Attribute objects keep their identity so materials and UI that
   * already hold them see the new ranges. The node layout (hierarchy,
   * byte offsets, bpp) is deliberately left untouched: scalar rewrites must
   * not change the shape of the bins.
   *
   * @returns {{changed: Object, added: string[], removed: string[], descriptorChanged: string[]}}
   */
  async refreshMetadata(octree, signal) {
    const headers = {};
    const response = await fetch(
      await this.signUrl(this.url, headers, signal),
      { headers, signal, cache: "reload" },
    );
    if (!response.ok) {
      throw new Error(
        `Metadata refresh failed: ${response.status} ${response.statusText}`,
      );
    }
    const metadata = await response.json();

    const pointAttributes = octree.pointAttributes;
    const fresh = OctreeLoader.parseAttributes([
      ...metadata.attributes,
      ...(metadata.scalarAttributes || []),
    ]);
    const scalarNames = new Set(
      (metadata.scalarAttributes || []).map((a) => a.name),
    );

    const changed = {};
    const added = [];
    const descriptorChanged = [];
    for (const attr of fresh.attributes) {
      const existing = pointAttributes.attributes.find(
        (a) => a.name === attr.name,
      );
      if (existing) {
        if (
          existing.type !== attr.type ||
          existing.numElements !== attr.numElements
        ) {
          // Loaded nodes decode with the old layout; the caller must reload
          // every node, and scalar offsets use byteSize from here on.
          existing.type = attr.type;
          existing.numElements = attr.numElements;
          existing.byteSize = attr.byteSize;
          descriptorChanged.push(attr.name);
        }
        const before = existing.range;
        if (JSON.stringify(before) !== JSON.stringify(attr.range)) {
          existing.range = attr.range;
          existing.initialRange = attr.initialRange;
          changed[attr.name] = { before, after: attr.range };
        }
      } else if (scalarNames.has(attr.name)) {
        // New scalars are appended: the decoder interleaves in this order.
        pointAttributes.add(attr);
        added.push(attr.name);
      }
    }

    const removed = this.registeredExternalScalars.filter(
      (name) => !scalarNames.has(name),
    );
    if (removed.length > 0) {
      pointAttributes.attributes = pointAttributes.attributes.filter(
        (a) => !removed.includes(a.name),
      );
      pointAttributes.size = pointAttributes.attributes.length;
      pointAttributes.byteSize = pointAttributes.attributes.reduce(
        (sum, a) => sum + a.byteSize,
        0,
      );
    }

    this.registeredExternalScalars = (metadata.scalarAttributes || []).map(
      (a) => a.name,
    );
    this.metadata.scalarAttributes = metadata.scalarAttributes;
    this.scalarAttributes = OctreeLoader.parseAttributes(
      metadata.scalarAttributes || [],
    );

    if (descriptorChanged.length > 0) {
      pointAttributes.byteSize = pointAttributes.attributes.reduce(
        (sum, a) => sum + a.byteSize,
        0,
      );
    }

    return { changed, added, removed, descriptorChanged };
  }

  async loadHierarchy(node) {
    let { hierarchyByteOffset, hierarchyByteSize } = node;
    const lastSlash = this.url.lastIndexOf("/");
    const hierarchyPath = `${this.url.substring(
      0,
      lastSlash + 1,
    )}hierarchy.bin`;
    let first = hierarchyByteOffset;
    let last = first + hierarchyByteSize - 1n;

    const headers = { Range: `bytes=${first}-${last}` };
    const response = await fetch(await this.signUrl(hierarchyPath, headers, this.signal), {
      headers,
      signal: this.signal,
    });
    let buffer = await response.arrayBuffer();

    this.parseHierarchy(node, buffer);

    // let promise = new Promise((resolve) => {
    // 	let generator = this.parseHierarchy(node, buffer);

    // 	let repeatUntilDone = () => {
    // 		let result = generator.next();

    // 		if(result.done){
    // 			resolve();
    // 		}else{
    // 			requestAnimationFrame(repeatUntilDone);
    // 		}
    // 	};

    // 	repeatUntilDone();
    // });

    // await promise;
  }
}

let tmpVec3 = new THREE.Vector3();
function createChildAABB(aabb, index) {
  let min = aabb.min.clone();
  let max = aabb.max.clone();
  let size = tmpVec3.subVectors(max, min);

  if ((index & 0b0001) > 0) {
    min.z += size.z / 2;
  } else {
    max.z -= size.z / 2;
  }

  if ((index & 0b0010) > 0) {
    min.y += size.y / 2;
  } else {
    max.y -= size.y / 2;
  }

  if ((index & 0b0100) > 0) {
    min.x += size.x / 2;
  } else {
    max.x -= size.x / 2;
  }

  return new THREE.Box3(min, max);
}

let typenameTypeattributeMap = {
  double: PointAttributeTypes.DATA_TYPE_DOUBLE,
  float: PointAttributeTypes.DATA_TYPE_FLOAT,
  int8: PointAttributeTypes.DATA_TYPE_INT8,
  uint8: PointAttributeTypes.DATA_TYPE_UINT8,
  int16: PointAttributeTypes.DATA_TYPE_INT16,
  uint16: PointAttributeTypes.DATA_TYPE_UINT16,
  int32: PointAttributeTypes.DATA_TYPE_INT32,
  uint32: PointAttributeTypes.DATA_TYPE_UINT32,
  int64: PointAttributeTypes.DATA_TYPE_INT64,
  uint64: PointAttributeTypes.DATA_TYPE_UINT64,
};

export class OctreeLoader {
  static parseAttributes(jsonAttributes) {
    let attributes = new PointAttributes();

    let replacements = {
      rgb: "rgba",
    };

    for (const jsonAttribute of jsonAttributes) {
      let { name, description, size, numElements, elementSize, min, max } =
        jsonAttribute;

      let type = typenameTypeattributeMap[jsonAttribute.type];

      let potreeAttributeName = replacements[name] ? replacements[name] : name;

      let attribute = new PointAttribute(
        potreeAttributeName,
        type,
        numElements,
      );

      if (numElements === 1) {
        attribute.range = [min[0], max[0]];
      } else {
        attribute.range = [min, max];
      }

      if (name === "gps-time") {
        // HACK: Guard against bad gpsTime range in metadata, see potree/potree#909
        if (attribute.range[0] === attribute.range[1]) {
          attribute.range[1] += 1;
        }
      }

      attribute.initialRange = attribute.range;

      attributes.add(attribute);
    }

    {
      // check if it has normals
      let hasNormals =
        attributes.attributes.find((a) => a.name === "NormalX") !== undefined &&
        attributes.attributes.find((a) => a.name === "NormalY") !== undefined &&
        attributes.attributes.find((a) => a.name === "NormalZ") !== undefined;

      if (hasNormals) {
        let vector = {
          name: "NORMAL",
          attributes: ["NormalX", "NormalY", "NormalZ"],
        };
        attributes.addVector(vector);
      }
    }

    return attributes;
  }

  static async load(url, signUrl, signal) {
    // Let the signer attach gateway auth for server-backed metadata, just as
    // it already does for hierarchy and octree range requests.
    const headers = {};
    const response = await fetch(await signUrl(url, headers, signal), { headers, signal });
    if (!response.ok) {
      // AWS "file not found" with signed URL returns 403
      if ([403, 404].includes(response.status)) {
        return {};
      }
      throw new Error(
        `Fetch error type: ${response.type}, status: ${response.status} ${response.statusText}`,
      );
    }
    let metadata = await response.json();
    if (signal) signal.throwIfAborted();

    let attributes = OctreeLoader.parseAttributes(metadata.attributes);
    // SVX: Parse scalar attributes as well, if they exist. These will be loaded via separate range requests in NodeLoader.load()
    let scalarAttributes = OctreeLoader.parseAttributes(
      metadata.scalarAttributes || [],
    );

    // console.debug("[OctreeLoader] Parsed metadata:", metadata);
    // console.debug("[OctreeLoader] Parsed attributes:", attributes);
    // console.debug("[OctreeLoader] Parsed scalar attributes:", scalarAttributes);

    let loader = new NodeLoader(url, signUrl, signal);
    loader.metadata = metadata;
    loader.attributes = attributes;
    // SVX: Store scalar attributes in loader for access in NodeLoader.load()
    loader.scalarAttributes = scalarAttributes;
    loader.scale = metadata.scale;
    loader.offset = metadata.offset;

    // SVX: Pass registered scalar attributes to loader as well, for access in NodeLoader.load()
    const registeredExternalScalars = metadata.scalarAttributes
      ? metadata.scalarAttributes.map((attr) => attr.name)
      : [];
    console.debug("[OctreeLoader] Registered external scalar attributes:", registeredExternalScalars);
    loader.registeredExternalScalars = registeredExternalScalars;

    let octree = new OctreeGeometry();
    octree.url = url;
    octree.spacing = metadata.spacing;
    octree.scale = metadata.scale;

    // let aPosition = metadata.attributes.find(a => a.name === "position");
    // octree

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
    octree.tightBoundingSphere = boundingBox.getBoundingSphere(
      new THREE.Sphere(),
    );
    octree.offset = offset;

    // SVX: Compose point attributes from octree attributes and scalar attributes
    const composedAttributes = [
      ...metadata.attributes,
      ...(metadata.scalarAttributes || []),
    ];
    octree.pointAttributes = OctreeLoader.parseAttributes(composedAttributes);
    // ORIGINAL: octree.pointAttributes = OctreeLoader.parseAttributes(metadata.attributes);


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

    // console.log("octree", octree);
    let result = {
      geometry: octree,
    };

    return result;
  }
}
