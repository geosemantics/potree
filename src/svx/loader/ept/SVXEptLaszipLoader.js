/**
 * SVXEptLaszipLoader
 *
 * Extends EptLaszipLoader to use signUrl + XHR (instead of fetch) for
 * authenticated URL fetching.
 */

import { EptLaszipLoader } from "../../loader/ept/LaszipLoader.js";
import { XHRFactory } from "../../XHRFactory.js";

export class SVXEptLaszipLoader extends EptLaszipLoader {
	async load(node) {
		if (node.loaded) return;

		const { Key } = window.Copc;
		const url = `${node.owner.base}/ept-data/${Key.toString(node.key)}.laz`;

		let xhr = XHRFactory.createXMLHttpRequest();
		xhr.open("GET", await node.signUrl(url), true);
		xhr.responseType = "arraybuffer";
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.onreadystatechange = () => {
			if (xhr.readyState === 4) {
				if (xhr.status === 200) {
					let buffer = xhr.response;
					this.parse(node, buffer);
				} else {
					console.error(`SVXEptLaszipLoader: Failed to load ${url}, status: ${xhr.status}`);
				}
			}
		};
		xhr.send(null);
	}
}
