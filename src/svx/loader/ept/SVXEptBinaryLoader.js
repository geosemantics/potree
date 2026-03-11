/**
 * SVXEptBinaryLoader
 *
 * Extends EptBinaryLoader to use signUrl for authenticated URL fetching.
 */

import { EptBinaryLoader } from "../../../loader/ept/BinaryLoader.js";
import { XHRFactory } from "../../../XHRFactory.js";

export class SVXEptBinaryLoader extends EptBinaryLoader {
	async load(node) {
		if (node.loaded) return;

		let url = node.url() + this.extension();

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
					console.error(`SVXEptBinaryLoader: Failed to load ${url}, status: ${xhr.status}`);
				}
			}
		};
		xhr.send(null);
	}
}
