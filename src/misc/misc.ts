let __j: (...args: any[]) => boolean;

const Logger: globalThis.Logger = Object.freeze(Object.setPrototypeOf({
	"_": ({ console: s }: Window) => {
		if (s == null || typeof s !== "object")
			throw new Error("Invalid interface");

		const f = Reflect.get(s, "log", void 0);
		if (typeof f !== "function")
			throw new Error("Invalid instance impl");

		__j = (...args: any[]) => {
			Reflect.apply(f, null, args);
			return true;
		};
	},
	get "$"() { return __j; }
}, null));

export default Logger;