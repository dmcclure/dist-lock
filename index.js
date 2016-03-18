/**
 * dist-lock is a distributed lock that uses Redis v2.6.12 or above
 */

var cuid = require('cuid');
var Scripto = require('redis-scripto');

/**
 * Return a distLock instance that can be used to acquire distributed locks.
 *
 * options.ttl: Time in milliseconds after which the lock will automatically release
 * options.retryDelay: Time in milliseconds to wait between lock acquisition attempts. Default is 50ms
 * options.maxRetries: Maximum number of times the lock acquisition will be attempted. Default is to retry indefinitely
 * options.keyPrefix: String prefix to use for lock strings in Redis. Default is "lock:"
 *
 * @param redis {Object} An instance of redis
 * @param options {Object} Configuration options (optional)
 * @returns {Object}
 */
module.exports = function(redis, options) {
  options = options || {};
  options.ttl = typeof options.ttl !== 'undefined' ? options.ttl : 30000;
  options.retryDelay = typeof options.retryDelay !== 'undefined' ? options.retryDelay : 50;
  options.maxRetries = typeof options.maxRetries !== 'undefined' ? options.maxRetries : -1;
  options.keyPrefix = typeof options.keyPrefix !== 'undefined' ? options.keyPrefix : 'lock:';

  // Initialize Scripto and load our Lua scripts
  var scriptManager = new Scripto(redis);
  scriptManager.loadFromDir(__dirname + '/lua');

  var distLock = {};

  /**
   * Attempt to acquire a lock, returning false straight away if the lock is unavailable.
   *
   * @param resourceName {string} Name of the resource to lock
   * @param owner {string} Name of who or what will own the lock
   * @param callback {Function}
   */
  var tryToAcquireLock = function(resourceName, owner, callback) {
    var lockId = cuid();
    var key = options.keyPrefix + resourceName;

    scriptManager.eval('createLock', [ key ], [ lockId, owner, options.ttl ], function(err, result) {
      if (err) return callback(err);

      if (result === 1) {
        var lock = {
          key: key,
          id: lockId,
          owner: owner,
          release: function(callback) {
            distLock.releaseLock(resourceName, lockId, callback);
          },
          extend: function(milliseconds, callback) {
            distLock.extendLock(resourceName, lockId, milliseconds, callback);
          }
        };

        return callback(null, lock);
      }

      return callback(null, false);
    });
  };

  /**
   * Acquire a lock, retrying if the lock cannot be immediately acquired.
   *
   * @param resourceName {string} Name of the resource to lock
   * @param owner {string} Name of who or what will own the lock
   * @param callback {Function} Called as callback(err, lock). Lock will be false if the lock could not be acquired
   */
  distLock.acquire = function(resourceName, owner, callback) {
    if (!resourceName || typeof resourceName !== 'string') {
      return callback(new Error('resourceName is required and must be a string'));
    }

    if (typeof owner === 'function') {
      callback = owner;
      owner = '';
    }

    if (typeof callback !== 'function') {
      return callback(new Error('callback function is required'));
    }

    if (typeof owner !== 'string') {
      return callback(new Error('owner must be a string'));
    }

    var attempt = 0;

    var attemptAcquire = function() {
      attempt += 1;

      tryToAcquireLock(resourceName, owner, function(err, lock) {
        if (err) return callback(err);

        if (lock) {
          lock.acquiredOnAttempt = attempt;
          lock.acquireDelay = (attempt - 1) * options.retryDelay;
          return callback(null, lock);
        }

        if (options.maxRetries === -1 || attempt <= options.maxRetries) {
          return setTimeout(attemptAcquire, options.retryDelay);
        }

        return callback(null, false);
      });
    };

    return attemptAcquire();
  };

  /**
   * Return the acquired lock for a resource, or null if a lock does not exist.
   *
   * @param resourceName {string} Name of the resource locked
   * @param callback {Function} Called as callback(err, lock). Lock will be null if no lock exists
   */
  distLock.getAcquiredLock = function(resourceName, callback) {
    if (!resourceName || typeof resourceName !== 'string') {
      return callback(new Error('resourceName is required and must be a string'));
    }

    var key = options.keyPrefix + resourceName;

    redis.hmget(key, 'id', 'owner', function(err, result) {
      if (err) return callback(err);

      if (result[0] === null) {  // If there is no lock on the resource
        return callback(null, null);
      }

      var lock = {
        key: key,
        id: result[0],
        owner: result[1],
        release: function(callback) {
          distLock.releaseLock(resourceName, result[0], callback);
        },
        extend: function(milliseconds, callback) {
          distLock.extendLock(resourceName, result[0], milliseconds, callback);
        }
      };

      return callback(null, lock);
    });
  };

  /**
   * Release a lock for a resource given its unique ID.
   *
   * @param resourceName {string} Name of the resource locked
   * @param id {string} ID of a lock
   * @param callback {Function} Called as callback(err, released). released will be true if the lock was found and released
   * @returns {*}
   */
  distLock.releaseLock = function(resourceName, id, callback) {
    if (!resourceName || typeof resourceName !== 'string') {
      return callback(new Error('resourceName is required and must be a string'));
    }

    if (!id || typeof id !== 'string') {
      return callback(new Error('id is required and must be a string'));
    }

    var key = options.keyPrefix + resourceName;
    scriptManager.eval('deleteLock', [ key ], [ id ], function(err, result) {
      if (err) return callback(err);
      callback(null, result === 1);
    });
  }

  /**
   * Extend a lock for a resource given its unique ID.
   *
   * @param resourceName {string} Name of the resource locked
   * @param id {string} ID of a lock
   * @param milliseconds {int} The lock's TTL will be reset to this many milliseconds
   * @param callback {Function} Called as callback(err, extended). extended will be true if the lock was found and its TTL reset
   * @returns {*}
   */
  distLock.extendLock = function(resourceName, id, milliseconds, callback) {
    if (!resourceName || typeof resourceName !== 'string') {
      return callback(new Error('resourceName is required and must be a string'));
    }

    if (!id || typeof id !== 'string') {
      return callback(new Error('id is required and must be a string'));
    }

    if (!milliseconds || typeof milliseconds !== 'number') {
      return callback(new Error('milliseconds is required and must be a number'));
    }

    var key = options.keyPrefix + resourceName;
    scriptManager.eval('extendLock', [ key ], [ id, milliseconds ], function(err, result) {
      if (err) return callback(err);
      callback(null, result === 1);
    });
  }

  return distLock;
};