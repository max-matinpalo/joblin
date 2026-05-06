import { setup } from "joblin";

const url = new URL("./worker.js", import.meta.url);
const iterations = 15000000; // Adjusted for speed

async function runDemo() {
	// 1. Setup 4 separate workers
	const workers = [setup(url), setup(url), setup(url), setup(url)];
	const [w1] = workers;

	// 2. Test 4 tasks in sequence
	console.log("Running 4 tasks in sequence...");
	const startSeq = performance.now();
	for (let i = 0; i < 4; i++) {
		await w1.heavyTask(iterations);
	}
	const timeSeq = Math.round(performance.now() - startSeq);
	console.log(`Sequential: ${timeSeq}ms\n`);

	// 3. Test 4 tasks in parallel
	console.log("Running 4 tasks in parallel...");
	const startPar = performance.now();
	await Promise.all(workers.map(w => w.heavyTask(iterations)));
	const timePar = Math.round(performance.now() - startPar);
	console.log(`Parallel: ${timePar}ms`);

	// 4. Cleanup
	workers.forEach(w => w.terminate());
}

runDemo();