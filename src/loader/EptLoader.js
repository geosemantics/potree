/**
 * @author Connor Manning
 */

export class EptLoader {
        static async load(file, signUrl, callback) {

                let response = await fetch(await signUrl(file));
		let json = await response.json();

		let url = file.substr(0, file.lastIndexOf('ept.json'));
                let geometry = new Potree.PointCloudEptGeometry(url, signUrl, json);
		let root = new Potree.PointCloudEptGeometryNode(geometry);

		geometry.root = root;
		geometry.root.load();

		callback(geometry);
	}
};

export class CopcLoader {
	static async load(file, callback) {
		const { Copc, Getter } = window.Copc

		const url = file;
		const getter = Getter.http(url);
		const copc = await Copc.create(getter);

		let geometry = new Potree.PointCloudCopcGeometry(getter, copc);
		let root = new Potree.PointCloudCopcGeometryNode(geometry);

		geometry.root = root;
		geometry.root.load();

		callback(geometry);
	}
}
