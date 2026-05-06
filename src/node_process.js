import { fork } from "child_process";

const registry = {};
let listening = false;

export function register(...handlers) {

	// 1. Setup listener
	if (process.send && !listening) {
		listening = true;
		process.on("message", async (data) => {
			const { id, type, payload } = data || {};
			if (!id || !type) return;

			try {
				const handler = registry[type];
				if (typeof handler !== "function") throw new Error(`Task "${type}" not found`);

				const result = await handler(payload);
				process.send({ id, result });
			} catch (err) {
				process.send({ id, error: err.message || "Worker task failed" });
			}
		});
	}

	// 2. Register handlers
	for (const handler of handlers) {
		if (typeof handler !== "function") continue;

		if (!handler.name) {
			console.warn("Ignoring anonymous function in register");
			continue;
		}

		registry[handler.name] = handler;
	}
}

export function setup(path) {
	let jobId = 0;
	let destroyed = false;

	// 1. Initialize
	const jobs = new Map();
	const worker = fork(path);

	// 2. Setup job rejection
	function rejectJobs(error) {
		for (const job of jobs.values()) job.reject(error);
		jobs.clear();
	}

	// 3. Handle messages
	worker.on("message", (data) => {
		const { id, result, error } = data || {};
		const job = jobs.get(id);

		if (!job) return;

		jobs.delete(id);
		if (error) job.reject(new Error(error));
		else job.resolve(result);
	});

	// 4. Handle errors
	worker.on("error", rejectJobs);

	worker.on("exit", (code) => {
		if (code !== 0) rejectJobs(new Error(`Worker stopped with exit code ${code}`));
	});

	// 5. Setup termination
	function terminate() {
		destroyed = true;
		rejectJobs(new Error("Worker terminated"));
		worker.kill();
	}

	// 6. Return proxy
	return new Proxy({}, {
		get(_, prop) {
			if (prop === "terminate") return terminate;
			if (prop === "worker") return worker;
			if (prop === "then") return undefined;

			if (prop in worker) {
				const value = worker[prop];
				return typeof value === "function" ? value.bind(worker) : value;
			}

			if (typeof prop !== "string") return undefined;

			return (payload = {}) => new Promise((resolve, reject) => {
				if (destroyed) return reject(new Error("Worker terminated"));

				const id = String(++jobId);
				jobs.set(id, { resolve, reject });
				worker.send({ id, type: prop, payload });
			});
		},
		set(_, prop, value) {
			if (!(prop in worker)) return false;
			worker[prop] = value;
			return true;
		}
	});
}