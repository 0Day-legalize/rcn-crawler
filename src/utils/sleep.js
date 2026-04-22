/**
 * @file sleep.js
 * @description Async timing and concurrency utilities used throughout the crawler.
 */

/**
 * Pauses execution for a given number of milliseconds.
 *
 * @param {number} ms - Duration to wait in milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pauses execution for a randomised duration around `ms`.
 *
 * Jitter breaks the periodic timing fingerprint that a fixed delay between
 * requests produces. The actual wait is drawn uniformly from
 *   [ms * (1 - fraction), ms * (1 + fraction)]
 * and clamped at 0 so callers cannot accidentally pass a negative delay.
 *
 * Use this for every inter-request delay in the crawl loop. Plain `sleep`
 * is fine for internal pacing that isn't observable to a remote server
 * (e.g. the 100ms dispatcher re-check).
 *
 * @param {number} ms       - Mean delay in milliseconds
 * @param {number} fraction - Jitter amplitude as a fraction of ms (e.g. 0.25 = ±25%)
 * @returns {Promise<void>}
 */
function jitteredSleep(ms, fraction) {
    const spread = ms * fraction;
    const delta  = (Math.random() * 2 - 1) * spread; // uniform in [-spread, +spread]
    const actual = Math.max(0, ms + delta);
    return sleep(actual);
}

/**
 * A promise-based semaphore that limits the number of async tasks
 * running at the same time.
 *
 * Tasks that call `acquire()` when all slots are taken are queued
 * and resume automatically as slots become available via `release()`.
 *
 * @example
 * const sem = new Semaphore(3); // allow 3 concurrent tasks
 * await sem.acquire();
 * try {
 *     await doWork();
 * } finally {
 *     sem.release();
 * }
 */
class Semaphore {
    /**
     * @param {number} limit - Maximum number of concurrently active tasks
     */
    constructor(limit) {
        /** @private @type {number} */
        this._limit = limit;
        /** @private @type {number} */
        this._active = 0;
        /** @private @type {Array<() => void>} */
        this._queue = [];
    }

    /**
     * Acquires a concurrency slot.
     * Resolves immediately if a slot is free, otherwise waits until one is released.
     *
     * @returns {Promise<void>}
     */
    acquire() {
        if (this._active < this._limit) {
            this._active++;
            return Promise.resolve();
        }
        return new Promise((resolve) => this._queue.push(resolve));
    }

    /**
     * Releases a concurrency slot and wakes up the next queued waiter if any.
     *
     * @returns {void}
     */
    release() {
        this._active--;
        if (this._queue.length > 0) {
            this._active++;
            this._queue.shift()();
        }
    }
}

module.exports = { sleep, jitteredSleep, Semaphore };