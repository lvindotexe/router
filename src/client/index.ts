interface ProxyCallbackOptions {
	path: string[];
	args: unknown[];
}

type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

function createRecursiveProxy(callback: ProxyCallback, path: string[]) {
	return new Proxy(
		() => {
			// dummy no-op function since we don't have any
			// client-side target we want to remap to
		},
		{
			get(_obj, key) {
				if (typeof key !== "string") return undefined;
				// Recursively compose the full path until a function is invoked
				return createRecursiveProxy(callback, [...path, key]);
			},
			apply(_1, _2, args) {
				// Call the callback function with the entire path we
				// recursively created and forward the arguments
				return callback({
					path,
					args,
				});
			},
		},
	);
}
