// Module name: SneakInput
// Created: 10/17/2025
// Last modified: 10/17/2025
// Minecraft API version: 2.2.0

/**
 * @typedef {Object} SneakRecord
 * @property {number | undefined} timeout_id - The ID of the timeout for clearing the sneak log.
 * @property {number[]} sneak_log - An array of ticks when the sneak button was pressed.
 * @property {boolean} on_cooldown - Indicates if the player is currently on cooldown for sneak detection.
 */

import { ButtonState, InputButton, Player, system, world } from "@minecraft/server";

/**
 * Class for detecting specific sneak input patterns from players in Minecraft.
 */
export class SneakInput {
	#inputWindowTicksFunction;
	#sneakTriggerCountFunction;
	#cooldownTicksFunction;
	#loggingTimeoutTicksFunction;

	/**
	 * Creates a new SneakInput instance.
	 * @param {Object} options - Configuration options.
	 * @param {string} [options.eventId="djc:sneak_input_triggered"] - The event ID to send when input is triggered.
	 * @param {number|function} [options.inputWindowTicks=5] - The maximum tick difference for triggering.
	 * @param {number|function} [options.sneakTriggerCount=2] - The number of sneaks required.
	 * @param {number|function} [options.cooldownTicks=20] - Cooldown ticks after triggering.
	 * @param {number|function} [options.loggingTimeoutTicks=5] - Timeout for logging sneaks.
	 * @param {boolean} [options.debugLogging=false] - Enable debug logging.
	 */
	constructor({ eventId = "djc:sneak_input_triggered", inputWindowTicks = 5, sneakTriggerCount = 2, cooldownTicks = 20, loggingTimeoutTicks = 5, debugLogging = false } = {}) {
		/**
		 * @type {Map<string,SneakRecord>}
		 */
		this.sneakRegistry = new Map();

		this.#inputWindowTicksFunction = typeof inputWindowTicks === "function" ? inputWindowTicks : () => inputWindowTicks;
		this.#sneakTriggerCountFunction = typeof sneakTriggerCount === "function" ? sneakTriggerCount : () => sneakTriggerCount;
		this.#cooldownTicksFunction = typeof cooldownTicks === "function" ? cooldownTicks : () => cooldownTicks;
		this.#loggingTimeoutTicksFunction = typeof loggingTimeoutTicks === "function" ? loggingTimeoutTicks : () => loggingTimeoutTicks;

		this.debugLogging = debugLogging;

		this.eventId = eventId;

		// Setup method to initialize the event response.
		this.#setup();
	}

	/**
	 * Gets the current input window ticks.
	 * @returns {number} The input window ticks.
	 */
	get inputWindowTicks() {
		return this.#inputWindowTicksFunction();
	}

	/**
	 * Gets the current sneak trigger count.
	 * @returns {number} The sneak trigger count.
	 */
	get sneakTriggerCount() {
		return this.#sneakTriggerCountFunction();
	}

	/**
	 * Gets the current cooldown ticks.
	 * @returns {number} The cooldown ticks.
	 */
	get cooldownTicks() {
		return this.#cooldownTicksFunction();
	}

	/**
	 * Gets the current logging timeout ticks.
	 * @returns {number} The logging timeout ticks.
	 */
	get loggingTimeoutTicks() {
		return this.#loggingTimeoutTicksFunction();
	}

	// --- Main Functions ---

	/**
	 * Sets up the event listener for player button input to detect when the sneak button is pressed.
	 */
	#setup() {
		world.afterEvents.playerButtonInput.subscribe((buttonEvent) => {
			const { button, newButtonState, player } = buttonEvent;

			// We only care about the Sneak button being pressed. Ignore all other inputs.
			if (button !== InputButton.Sneak || newButtonState !== ButtonState.Pressed) return;

			this.#processSneak(player);
		});

		if (this.debugLogging) console.log(`SneakInput: Module setup.`);
	}

	/**
	 * Processes a sneak input from a player.
	 * @param {Player} player
	 */
	#processSneak(player) {
		const { sneak_log, timeout_id, on_cooldown } = this.#getRecord(player);

		// If the player is on cooldown, we don't do anything.
		if (on_cooldown) return;

		// We need to log this sneak event at this current tick.
		this.#logSneak(player);
		if (this.debugLogging) console.log(`SneakInput: Logged sneak for player ${player.name} at tick ${system.currentTick}.`);

		// Renew sneak logging timeout.
		this.#renewLogTimeout(player);
	}

	/**
	 * Timeout function that runs when the logging timeout expires.
	 * @param {Player} player
	 */
	#onTimeout(player) {
		const { sneak_log, timeout_id, on_cooldown } = this.#getRecord(player);
		const sneakCount = sneak_log.length;

		// Check if requirements are met to trigger the input event.
		if (sneakCount === this.sneakTriggerCount) {
			const tickDifference = this.#calculateTickDifference(player);

			if (tickDifference <= this.inputWindowTicks) {
				system.sendScriptEvent(this.eventId, `${player.id}`);

				if (this.debugLogging) console.log(`SneakInput: Triggered input event for player ${player.name}.`);
			}
		}

		// No matter what, upon timeout we set the cooldown.
		this.#setCooldown(player);

		if (this.debugLogging) console.log(`SneakInput: Timeout expired for player ${player.name}.`);
	}

	// --- Helper Functions ---

	/**
	 * Retrieves the player's sneak record from the registry, creating a default record if none exists.
	 * @param {Player} player The player whose sneak record is to be retrieved.
	 * @returns {SneakRecord} The sneak record for the player.
	 */
	#getRecord(player) {
		const record = this.sneakRegistry.get(player.id) ?? {
			timeout_id: undefined,
			sneak_log: [],
			on_cooldown: false
		};
		return record;
	}

	/**
	 * Logs a sneak event for the specified player at the current tick.
	 * @param {Player} player The player for whom to log the sneak event.
	 */
	#logSneak(player) {
		const currentTick = system.currentTick;
		const record = this.#getRecord(player);

		record.sneak_log.push(currentTick);

		this.sneakRegistry.set(player.id, record);
	}

	/**
	 * Renews the logging timeout for the specified player.
	 * @param {Player} player
	 */
	#renewLogTimeout(player) {
		const record = this.#getRecord(player);

		// If the player had an existing timeout, cancel it.
		if (typeof record.timeout_id === "number") system.clearRun(record.timeout_id);

		// Create a fresh timeout.
		record.timeout_id = system.runTimeout(() => this.#onTimeout(player), this.loggingTimeoutTicks);

		this.sneakRegistry.set(player.id, record);
	}

	/**
	 * Calculates the tick difference between the first and last sneak events for the specified player.
	 * @param {Player} player
	 */
	#calculateTickDifference(player) {
		const { sneak_log } = this.#getRecord(player);

		return sneak_log[sneak_log.length - 1] - sneak_log[0];
	}

	/**
	 * Sets the cooldown status for the specified player.
	 * @param {Player} player
	 */
	#setCooldown(player) {
		const record = this.#getRecord(player);

		record.on_cooldown = true;

		this.sneakRegistry.set(player.id, record);

		// Setup the timeout for the cooldown.
		system.runTimeout(() => this.#onCooldownExpire(player), this.cooldownTicks);
	}

	/**
	 * Handles the expiration of the cooldown for the specified player.
	 * @param {Player} player
	 */
	#onCooldownExpire(player) {
		this.sneakRegistry.delete(player.id);

		if (this.debugLogging) console.log(`SneakInput: Cooldown expired for player ${player.name}.`);
	}
}
