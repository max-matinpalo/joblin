import { fork } from "node:child_process";

const registry = {};
let listening = false;

export function register(handlers = {}) {
	// 1. Validate
	if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
		throw new Error("register() expects an object");
	}

	// 2. Helper for IPC
	const send = (message) => {
		if (!process.send || !process.connected) return;
		process.send(message);
	};

	// 3. Init listener
	if (process.send && !listening) {
		listening = true;
		process.on("message", async (data) => {
			const { id, type, payload } = data || {};
			if (!id || !type) return;

			try {
				const handler = registry[type];
				if (typeof handler !== "function") throw new Error(`Task "${type}" not found`);

				const result = await handler(payload);
				send({ id, result });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err || "Process task failed");
				send({ id, error: msg });
			}
		});
	}

	// 4. Register handlers
	for (const [name, handler] of Object.entries(handlers)) {
		if (typeof handler === "function") registry[name] = handler;
	}
}

/**
 * @param {string|URL} path - Use new URL("./process.js", import.meta.url)
 */
export function setup(path) {
	let jobId = 0;
	let destroyed = false;
	const jobs = new Map();

	// 1. Fork with advanced serialization
	const child = fork(path, { serialization: "advanced" });

	const rejectJobs = (error) => {
		for (const job of jobs.values()) job.reject(error);
		jobs.clear();
	};

	// 2. Handle messages
	child.on("message", (data) => {
		const { id, result, error } = data || {};
		const job = jobs.get(id);
		if (!job) return;

		jobs.delete(id);
		if (error) job.reject(new Error(error));
		else job.resolve(result);
	});

	// 3. Handle lifecycle
	child.on("error", (err) => {
		destroyed = true;
		rejectJobs(err || new Error("Process error"));
	});

	child.on("disconnect", () => {
		if (destroyed) return;
		destroyed = true;
		rejectJobs(new Error("Process disconnected"));
	});

	child.on("exit", (code, signal) => {
		if (destroyed) return;
		destroyed = true;

		const msg = signal
			? `Process exited with signal ${signal}`
			: code === 0 ? "Process exited" : `Process exited with code ${code}`;

		rejectJobs(new Error(msg));
	});

	// 4. Termination logic
	const terminate = () => {
		destroyed = true;
		rejectJobs(new Error("Process terminated"));
		child.kill();
	};

	// 5. Proxy setup
	return new Proxy({}, {
		get(_, prop) {
			if (prop === "terminate") return terminate;
			if (prop === "child") return child;
			if (prop === "then") return undefined;

			if (prop in child) {
				const value = child[prop];
				return typeof value === "function" ? value.bind(child) : value;
			}

			if (typeof prop !== "string") return undefined;

			return (payload = {}) => new Promise((resolve, reject) => {
				if (destroyed) return reject(new Error("Process terminated"));

				const id = String(++jobId);
				jobs.set(id, { resolve, reject });

				// 6. Robust sending
				try {
					child.send({ id, type: prop, payload }, (err) => {
						if (!err) return;
						jobs.delete(id);
						reject(err);
					});
				} catch (err) {
					jobs.delete(id);
					reject(err);
				}
			});
		},
		set(_, prop, value) {
			if (!(prop in child)) return false;
			child[prop] = value;
			return true;
		}
	});
}