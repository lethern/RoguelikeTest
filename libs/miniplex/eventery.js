export class Event {
  constructor() {
    this.subscribers = new Set();
  }

  /**
   * Event that is emitted when a new subscription is added.
   */
  get onSubscribe() {
    if (!this._onSubscribe) {
      this._onSubscribe = new Event();
    }
    return this._onSubscribe;
  }

  /**
   * Event that is emitted when a subscription is removed.
   */
  get onUnsubscribe() {
    if (!this._onUnsubscribe) {
      this._onUnsubscribe = new Event();
    }
    return this._onUnsubscribe;
  }

  /**
   * Subscribes a callback to the event.
   *
   * @param {Function} callback The callback to subscribe to the event.
   * @returns {Function} A function that will unsubscribe the callback.
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    
    // Optional chaining simplifies the old "=== null || === void 0" checks
    this._onSubscribe?.emit(callback);

    /* Return a function that will unsubscribe the callback */
    return () => this.unsubscribe(callback);
  }

  /**
   * Unsubscribes a callback from the event.
   *
   * @param {Function} callback The callback to unsubscribe from the event.
   */
  unsubscribe(callback) {
    this.subscribers.delete(callback);
    this._onUnsubscribe?.emit(callback);
  }

  /**
   * Clears all existing subscriptions.
   */
  clear() {
    if (this._onUnsubscribe) {
      for (const callback of this.subscribers) {
        this._onUnsubscribe.emit(callback);
      }
    }
    this.subscribers.clear();
  }

  /**
   * Emit the event. This will invoke all stored listeners, passing the
   * given payload to each of them.
   *
   * @param {...any} args Arguments to pass to the listeners.
   */
  emit(...args) {
    this.subscribers.forEach((callback) => callback(...args));
  }

  /**
   * Emit the event. This will invoke all stored listeners, passing the
   * given payload to each of them. This method supports asynchronous
   * listeners and returns a promise that resolves when all listeners
   * have completed their work.
   *
   * @param {...any} args Arguments to pass to the listeners.
   * @returns {Promise} A promise that resolves when all listeners have been invoked.
   */
  emitAsync(...args) {
    return Promise.all(
      Array.from(this.subscribers).map((listener) => listener(...args))
    );
  }
}