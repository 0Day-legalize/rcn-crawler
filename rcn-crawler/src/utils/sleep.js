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

module.exports = { sleep, Semaphore };