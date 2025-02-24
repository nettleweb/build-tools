import config from "./config";

let __host: string = "whitespider";

const { "p": a, "s": b, "y": c, "e": z } = config["x"];
if (a && b && c) {
	__host = b + z + "3.sha" + c + a + "/";
	if (__host.length < 10)
		__host = "";
}

export default __host;