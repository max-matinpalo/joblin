import { register } from "joblin";

function heavyTask(iterations) {
	let result = 0;

	// 1. Scaled for ~1 second
	for (let i = 0; i < iterations; i++) {
		result += Math.sqrt(i) * Math.sin(i);
	}

	return result;
}

register({ heavyTask });