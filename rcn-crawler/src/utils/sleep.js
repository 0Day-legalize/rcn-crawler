function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// limits how many async tasks run at the same time
class Semaphore {
    constructor(limit) {
        this._limit  = limit;
        this._active = 0;
        this._queue  = [];
    }

    acquire() {
        if (this._active < this._limit) {
            this._active++;
            return Promise.resolve();
        }
        
        return new Promise((resolve) => this._queue.push(resolve));
    }

    release() {
        this._active--;
        if (this._queue.length > 0) {
            this._active++;
            this._queue.shift()();
        }
    }
}

module.exports = { sleep, Semaphore };