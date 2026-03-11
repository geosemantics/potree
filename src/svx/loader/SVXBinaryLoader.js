/**
 * SVXBinaryLoader
 *
 * Extends BinaryLoader to use signUrl for authenticated URL fetching.
 */

import { BinaryLoader } from "../../loader/BinaryLoader.js";
import { XHRFactory } from "../../XHRFactory.js";

export class SVXBinaryLoader extends BinaryLoader {
	async load(node) {
		if (node.loaded) {
			return;
		}

		let url = node.getURL();

		if (this.version.equalOrHigher("1.4")) {
			url += ".bin";
		}

		let xhr = XHRFactory.createXMLHttpRequest();
		xhr.open("GET", await node.signUrl(url), true);
		xhr.responseType = "arraybuffer";
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.onreadystatechange = () => {
			if (xhr.readyState === 4) {
				if ((xhr.status === 200 || xhr.status === 0) && xhr.response !== null) {
					let buffer = xhr.response;
					this.parse(node, buffer);
				} else {
					throw new Error(`SVXBinaryLoader: Failed to load ${url}, status: ${xhr.status}`);
				}
			}
		};

		try {
			xhr.send(null);
		} catch (e) {
			console.error("SVXBinaryLoader: Exception loading node", node.name, e);
		}
	}
}
