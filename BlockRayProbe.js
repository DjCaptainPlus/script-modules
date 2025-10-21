// Module name: BlockRayProbe
// Date created: 10/20/25
// Last modified: 10/20/25
// Minecraft API version: 2.2.0

import { Dimension } from "@minecraft/server";

/**
 * @typedef {import("@minecraft/server").Vector3} Vector3
 */

const EPS = 1e-10;

/**
 * Casts a ray and returns a list of the block it intersects.
 */
export class BlockRayProbe {
	/**
	 * Creates a new BlockRayProbe.
	 *
	 * Casts a ray (line segment) from `origin` and returns the blocks it intersects (near→far).
	 * Provide either `options.direction` (with optional offsets and `distance`) or an explicit `options.endPoint`.
	 * If neither is provided, a TypeError is thrown.
	 *
	 * @param {Dimension} dimension - The dimension in which to cast the ray.
	 * @param {Vector3} origin - World-space start point.
	 * @param {Object} [options] - Optional configuration.
	 * @param {Vector3} [options.direction] - Direction vector (normalized internally). Ignored if `endPoint` is provided.
	 * @param {Vector3} [options.endPoint] - Absolute end point; when set, `distance` and angle offsets are ignored.
	 * @param {number}  [options.distance=4] - Max length from `origin` when using `direction`.
	 * @param {number}  [options.maxSteps=4096] - Safety cap on visited cells.
	 * @param {number}  [options.yawOffset=0] - Degrees; rotate `direction` around Y (positive = right).
	 * @param {number}  [options.pitchOffset=0] - Degrees; rotate `direction` around X (positive = up).
	 * @param {boolean} [options.castThroughBlocks=false] - True to pass through blocks; false to stop at first blocker.
	 *
	 * @throws {TypeError} If neither `options.direction` nor `options.endPoint` is provided.
	 */
	constructor(dimension, origin, { direction = undefined, distance = 4, endPoint = undefined, maxSteps = 4096, yawOffset = 0, pitchOffset = 0, castThroughBlocks = false } = {}) {
		/**
		 * The dimension in which to cast the ray.
		 * @type {Dimension}
		 */
		this.dimension = dimension;

		/**
		 * World-space origin point for the probe.
		 * @type {Vector3}
		 */
		this.origin = origin;

		/**
		 * Direction vector for the ray (may be undefined when using `endPoint`).
		 * @type {Vector3|undefined}
		 */
		this.direction = direction;

		/**
		 * Maximum distance to probe when using a direction.
		 * @type {number}
		 */
		this.distance = distance;

		/**
		 * Explicit absolute end point; if set, overrides `distance` and angle offsets.
		 * @type {Vector3|undefined}
		 */
		this.endPoint = endPoint;

		/**
		 * Safety cap on the number of visited steps/cells.
		 * @type {number}
		 */
		this.maxSteps = maxSteps;

		/**
		 * Yaw offset in degrees (positive = rotate right).
		 * @type {number}
		 */
		this.yawOffset = yawOffset;

		/**
		 * Pitch offset in degrees (positive = rotate up).
		 * @type {number}
		 */
		this.pitchOffset = pitchOffset;

		/**
		 * Whether to cast through solid blocks or stop at first blocker.
		 * @type {boolean}
		 */
		this.castThroughBlocks = castThroughBlocks;

		this.#validateProbeRequirements();
	}

	cast() {
		const startPoint = this.origin;
		const endPoint = this.endPoint ?? this.#getEndPoint();
		const directionX = endPoint.x - startPoint.x;
		const directionY = endPoint.y - startPoint.y;
		const directionZ = endPoint.z - startPoint.z;
		const stepX = directionX > 0 ? 1 : directionX < 0 ? -1 : 0;
		const stepY = directionY > 0 ? 1 : directionY < 0 ? -1 : 0;
		const stepZ = directionZ > 0 ? 1 : directionZ < 0 ? -1 : 0;
		const endBlockX = Math.floor(endPoint.x);
		const endBlockY = Math.floor(endPoint.y);
		const endBlockZ = Math.floor(endPoint.z);

		const blocksIntersected = [];

		let currentBlockX = Math.floor(startPoint.x);
		let currentBlockY = Math.floor(startPoint.y);
		let currentBlockZ = Math.floor(startPoint.z);

		let iteration = 0;

		while (iteration < this.maxSteps) {
			const currentBlock = this.dimension.getBlock({ x: currentBlockX, y: currentBlockY, z: currentBlockZ });
			if (currentBlock) blocksIntersected.push(currentBlock);

			if (currentBlockX == endBlockX && currentBlockY == endBlockY && currentBlockZ == endBlockZ) break;

			const nextFaceX = stepX === 1 ? currentBlockX + 1 : stepX === -1 ? currentBlockX : Infinity;
			const nextFaceY = stepY === 1 ? currentBlockY + 1 : stepY === -1 ? currentBlockY : Infinity;
			const nextFaceZ = stepZ === 1 ? currentBlockZ + 1 : stepZ === -1 ? currentBlockZ : Infinity;

			const tToXFace = directionX !== 0 ? (nextFaceX - startPoint.x) / directionX : Infinity;
			const tToYFace = directionY !== 0 ? (nextFaceY - startPoint.y) / directionY : Infinity;
			const tToZFace = directionZ !== 0 ? (nextFaceZ - startPoint.z) / directionZ : Infinity;

			const minT = Math.min(tToXFace, tToYFace, tToZFace);
			if (!isFinite(minT)) break;

			if (tToXFace - minT <= EPS && stepX !== 0) currentBlockX += stepX;
			if (tToYFace - minT <= EPS && stepY !== 0) currentBlockY += stepY;
			if (tToZFace - minT <= EPS && stepZ !== 0) currentBlockZ += stepZ;

			iteration++;
		}

		return blocksIntersected;
	}

	#validateProbeRequirements() {
		if (!this.endPoint && !this.direction) throw new TypeError(`BlockRayProbe requires either a direction or an endPoint to be specified.`);
	}

	#getEndPoint() {
		const rotatedDirection = this.#getRotatedDirection();

		return VectorUtils.add(this.origin, VectorUtils.multiply(rotatedDirection, this.distance));
	}

	#getRotatedDirection() {
		const yawRadians = -(this.yawOffset * Math.PI) / 180;
		const pitchRadians = -(this.pitchOffset * Math.PI) / 180;
		const unitDirection = VectorUtils.normalize(this.direction);

		// --- yaw around global Y (unchanged) ---
		const yawX = unitDirection.x * Math.cos(yawRadians) + unitDirection.z * Math.sin(yawRadians);
		const yawY = unitDirection.y;
		const yawZ = -unitDirection.x * Math.sin(yawRadians) + unitDirection.z * Math.cos(yawRadians);

		// --- pitch around the *local right* axis using Rodrigues' formula ---
		// right = up × yawedDir, with up = (0,1,0) → (yawZ, 0, -yawX)
		let rightX = yawZ,
			rightY = 0,
			rightZ = -yawX;
		const rLen = Math.hypot(rightX, rightY, rightZ);
		if (rLen > 0) {
			rightX /= rLen;
			rightY /= rLen;
			rightZ /= rLen;
		}

		const cosP = Math.cos(pitchRadians),
			sinP = Math.sin(pitchRadians);

		// k × v  (k = right, v = yawedDir)
		const crossX = rightY * yawZ - rightZ * yawY;
		const crossY = rightZ * yawX - rightX * yawZ;
		const crossZ = rightX * yawY - rightY * yawX;

		// k · v
		const dotKV = rightX * yawX + rightY * yawY + rightZ * yawZ;

		// rotated = v*cosθ + (k×v)*sinθ + k*(k·v)*(1-cosθ)
		const pitchX = yawX * cosP + crossX * sinP + rightX * dotKV * (1 - cosP);
		const pitchY = yawY * cosP + crossY * sinP + rightY * dotKV * (1 - cosP);
		const pitchZ = yawZ * cosP + crossZ * sinP + rightZ * dotKV * (1 - cosP);

		const rotatedDirection = VectorUtils.normalize({ x: pitchX, y: pitchY, z: pitchZ });
		return rotatedDirection;
	}
}

class VectorUtils {
	static normalize(v) {
		// assume v is an object {x,y,z} with numeric components
		const x = v.x;
		const y = v.y;
		const z = v.z;
		const len = Math.hypot(x, y, z);
		if (!len || !isFinite(len)) return { x: 0, y: 0, z: 0 };
		return { x: x / len, y: y / len, z: z / len };
	}

	static add(a, b) {
		// assume a and b are objects {x,y,z} with numeric components
		return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
	}

	static multiply(v, factor) {
		// If factor is a number, scale the vector; otherwise assume factor is a vector {x,y,z}
		if (typeof factor === "number") {
			return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
		}
		return { x: v.x * factor.x, y: v.y * factor.y, z: v.z * factor.z };
	}
}
