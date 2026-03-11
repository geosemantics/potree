/**
 * SVXPointCloudOctreeGeometry / SVXPointCloudOctreeGeometryNode
 *
 * Extends PointCloudOctreeGeometry and its node class to add signUrl support
 * for authenticated / pre-signed URL fetching throughout the loading pipeline.
 *
 * SVX Changes:
 *  - PointCloudOctreeGeometry constructor accepts (url, signUrl)
 *  - PointCloudOctreeGeometryNode.signUrl(url) delegates to pcoGeometry
 */

import {
PointCloudOctreeGeometry,
PointCloudOctreeGeometryNode,
} from "../../PointCloudOctreeGeometry.js";

export class SVXPointCloudOctreeGeometry extends PointCloudOctreeGeometry {
constructor(url, signUrl) {
super();
this.url = url;
// signUrl: (url: string, headers?: object) => Promise<string>
this._signUrl = signUrl || (x => x);
}

/** Resolve url to a (possibly pre-signed) URL. */
async signUrl(url) {
return this._signUrl(url);
}
}

export class SVXPointCloudOctreeGeometryNode extends PointCloudOctreeGeometryNode {
/**
 * Delegate signUrl to the parent geometry object.
 * Loaders call node.signUrl(url) before every XHR/fetch request.
 */
async signUrl(url) {
return this.pcoGeometry.signUrl(url);
}
}
