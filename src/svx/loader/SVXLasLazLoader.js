/**
 * SVXLasLazLoader
 *
 * Extends LasLazLoader to use signUrl for authenticated URL fetching.
 */

import { LasLazLoader } from "../../loader/LasLazLoader.js";
import { XHRFactory } from "../../XHRFactory.js";

export class SVXLasLazLoader extends LasLazLoader {
	async load(node) {
		if (node.loaded) {
			return;
		}

		let url = node.getURL() + this.extension();

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
					console.error(`SVXLasLazLoader: Failed to load ${url}, status: ${xhr.status}`);
				}
			}
		};
		xhr.send(null);
	}
}
