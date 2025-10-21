// Module name: EasyRaycast
// Created: 10/19/2025
// Last modified: 10/19/2025
// Minecraft API version: 2.2.0

import { Dimension } from "@minecraft/server";

/**
 * @typedef {object} EasyRaycastResult
 * @property {import("@minecraft/server").Block} block - The block that was hit.
 * @property {import("@minecraft/server").Direction} face - The face/direction that was hit.
 * @property {import("@minecraft/server").Vector3} faceLocation - Local coordinates on the block face (0..1).
 * @property {import("@minecraft/server").Vector3} worldHitPosition - Computed world-space hit position.
 * @property {number} distance - Euclidean distance from the origin to the hit position.
 */

/**
 * EasyRaycast
 * A small helper that performs a single block raycast when instantiated and
 * returns a concise result object with the original BlockRaycastHit properties
 * plus the computed world hit position and the traveled distance.
 *
 * This module depends only on `@minecraft/server`.
 */
export class EasyRaycast {
	/**
	 * Create and execute a raycast immediately.
	 * @param {Dimension} dimension - Dimension to cast the ray in.
	 * @param {import("@minecraft/server").Vector3} origin - World-space origin for the raycast.
	 * @param {import("@minecraft/server").Vector3} direction - Direction vector for the raycast.
	 * @param {import("@minecraft/server").BlockRaycastOptions} [options] - Optional raycast options.
	 */
	constructor(dimension, origin, direction, options = {}) {
		this.dimension = dimension;
		this.origin = origin;
		this.direction = direction;
		// Default options are sensible for general use but caller may override.
		this.options = Object.assign({ includePassableBlocks: false, maxDistance: 100 }, options);

		/**
		 * The result of the raycast. Will be `undefined` when no block was hit,
		 * otherwise an object containing the BlockRaycastHit properties plus
		 * `worldHitPosition` and `distance`.
		 */
		this._result = this._cast();
	}

	/**
	 * Returns the raycast result (or undefined).
	 * @returns {EasyRaycastResult}
	 */
	get hit() {
		return this._result;
	}

	/**
	 * Convenience static method that performs a cast and returns the result
	 * without needing to keep the EasyRaycast instance.
	 */
	static cast(dimension, origin, direction, options) {
		return new EasyRaycast(dimension, origin, direction, options).hit;
	}

	/**
	 * Protected: perform the block raycast and build the result object.
	 * @protected
	 */
	_cast() {
		const hit = this.dimension.getBlockFromRay(this.origin, this.direction, this.options);
		if (!hit) return undefined;

		const { block, face, faceLocation } = hit;

		// Copy faceLocation so we don't mutate the engine-provided object.
		const faceLoc = { x: faceLocation.x, y: faceLocation.y, z: faceLocation.z };

		const faceKey = String(face).toLowerCase();
		const faceData = this._getFaceData(faceKey);

		// Apply the zero_fix behavior used in RaycastProbe: when the selected
		// axis is exactly 0 and face requires zero_fix, treat it as 1 so that
		// adding to the block location yields the correct neighbouring world
		// position for that side.
		if (faceData.zeroFix && faceLoc[faceData.axis] === 0) {
			faceLoc[faceData.axis] = 1;
		}

		const worldHitPosition = {
			x: block.location.x + faceLoc.x,
			y: block.location.y + faceLoc.y,
			z: block.location.z + faceLoc.z
		};

		const distance = this._distanceBetween(this.origin, worldHitPosition);

		return {
			block,
			face,
			faceLocation: faceLoc,
			worldHitPosition,
			distance
		};
	}

	/**
	 * Protected: map a face name to the axis and whether zero-fix should be
	 * applied. The names accepted are the Direction strings returned by the
	 * runtime (case-insensitive). This mirrors the behavior in RaycastProbe.
	 * @protected
	 */
	_getFaceData(faceLower) {
		switch (faceLower) {
			case "north":
				return { axis: "z", zeroFix: false };
			case "south":
				return { axis: "z", zeroFix: true };
			case "west":
				return { axis: "x", zeroFix: false };
			case "east":
				return { axis: "x", zeroFix: true };
			case "up":
				return { axis: "y", zeroFix: true };
			case "down":
				return { axis: "y", zeroFix: false };
			default:
				return { axis: "x", zeroFix: false };
		}
	}

	/**
	 * Protected: simple Euclidean distance between two Vector3-like objects.
	 */
	_distanceBetween(a, b) {
		const dx = a.x - b.x;
		const dy = a.y - b.y;
		const dz = a.z - b.z;
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}
}
