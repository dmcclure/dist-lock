/**
 * dist-lock is a distributed lock that uses Redis v2.6.12 or above
 */

var cuid = require('cuid');
var fs = require('fs');

// Load the Lua scripts we need
var delKeyValuePairScript = fs.readFileSync(__dirname + '/delKeyValuePair.lua').toString();
var extendKeyValuePairScript = fs.readFileSync(__dirname + '/extendKeyValuePair.lua').toString();

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

  var distLock = {};

  /**
   * Attempt to acquire a lock, returning false straight away if the lock is unavailable.
   *
   * @param resourceName {string} Name of the resource to lock
   * @param callback {Function}
   */
  var tryToAcquireLock = function(resourceName, callback) {
    var lockId = cuid();
    var key = options.keyPrefix + resourceName;

    redis.set(key, lockId, 'PX', options.ttl, 'NX', function(err, acquired) {
      if (err) return callback(err);

      if (acquired) {
        var lock = {
          key: key,
          id: lockId,
          release: function(callback) {
            redis.eval(delKeyValuePairScript, 1, key, lockId, callback);
          },
          extend: function(seconds, callback) {
            redis.eval(extendKeyValuePairScript, 1, key, lockId, seconds, callback);
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
   * @param callback {Function} Called as callback(err, lock). Lock will be false if the lock could not be acquired
   */
  distLock.acquire = function(resourceName, callback) {
    if (!resourceName || typeof resourceName != 'string') {
      throw new Error('resourceName is required and must be a string');
    }

    if (typeof callback !== 'function') {
      throw new Error('callback function is required');
    }

    var attempt = 0;

    var attemptAcquire = function() {
      attempt += 1;

      tryToAcquireLock(resourceName, function(err, lock) {
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

  return distLock;
};