/**
 * SVXEptLoader
 *
 * Extends EptLoader to support signUrl for authenticated URL fetching and
 * passes signUrl through to the geometry object.
 *
 * The ndm change also fixes the url extraction to use `lastIndexOf('ept.json')`
 * (more robust) and passes signUrl to PointCloudEptGeometry.
 */

import { EptLoader } from "../../loader/EptLoader.js";

export class SVXEptLoader extends EptLoader {
	static async load(file, signUrl, callback) {
		const _signUrl = signUrl || (x => x);

		let response = await fetch(await _signUrl(file));
		let json = await response.json();

		let url = file.substr(0, file.lastIndexOf("ept.json"));
		let geometry = new Potree.PointCloudEptGeometry(url, _signUrl, json);
		let root = new Potree.PointCloudEptGeometryNode(geometry);

		geometry.root = root;
		geometry.root.load();

		callback(geometry);
	}
}
