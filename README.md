dist-lock
=========

dist-lock is a distributed lock manager that uses a single Redis instance.

> A distributed lock manager (DLM) provides distributed software applications with a means to synchronize their accesses to shared resources.

It uses the lock acquisition algorithm described by Redis' author [here](http://redis.io/commands/set) and requires Redis v2.6.12 or above.


Features
----

- Lock acquisition is non-blocking and asynchronous.
- Option to wait indefinitely for a lock, or timeout after a configurable duration.
- To avoid potential deadlocks, locks will automatically release after a configurable duration.

Requirements
----

- Redis v2.6.12 or above.
- An instance of a [Redis client](https://github.com/mranney/node_redis).

Installation
--------------

```sh
npm install dist-lock
```
Example
-----

```js
var redis = require('redis').createClient();
var distLock = require('dist-lock')(redis);

// Acquire a lock
distLock.acquire('shared-resource-name', 'owner-name', function(err, lock) {
  if (err) {
    // Something went wrong. Is Redis down?
    throw err;
  }
  
  // We have acquired a lock for "shared-resource-name" and identified ourselves (the lock acquirer) as
  // "owner-name". No other process will be able to acquire the lock while we hold it.
  
  // Do some work...
  
  // Work is done, so release the lock
  lock.release();
});
```

Usage
-----
### Initialization
Create a distributed lock manager by passing in a Redis client instance:
```javascript
var distLock = require('dist-lock')(redis);
```

You can override the default configuration by passing in options:
```javascript
var options = {
  ttl: 30000,        // Time in milliseconds after which the lock will automatically release
  retryDelay: 50,    // Time in milliseconds to wait between lock acquisition attempts
  maxRetries: -1,    // Maximum number of times lock acquisition will be attempted
  keyPrefix: "lock:" // String prefix to use for lock strings in Redis
};
var distLock = require('dist-lock')(redis, options);
```

Default configuration is:

- ttl: 30000ms
- retryDelay: 50ms
- maxRetries: -1 (unlimited)
- keyPrefix: "lock:"

### Acquiring a lock
Call the `acquire()` function to acquire a lock:

#### .acquire(resourceName, callback)
Parameters:

Name  | Type | Description
----- | ---- | -----------
resourceName | string | Unique name of the shared resource being locked
owner | string | A string to identify who or which process acquired the lock (optional)
callback | Function | Function called when the lock is acquired, an error occurs, or the maximum number of lock acquisition attempts has been reached

On success, the callback function will be called with a new lock instance.

If you configure the lock manager to try a limited number of times to acquire the lock and the lock could not be acquired then `lock` will be false.

### Lock instance

The lock instance will have the following properties and methods:

Name  | Type | Description
----- | ---- | -----------
id | string | The unique ID of the lock
key | string | The key of the lock in Redis
owner | string | The name of the lock acquirer passed to the `acquire()` function, or an empty string
acquiredOnAttempt | int | The number of attempts made to acquire the lock
acquireDelay | int | The duration in milliseconds it took to acquire the lock
release(callback) | Function | Call this function to release the lock
extend(milliseconds, callback) | Function | Call this function to extend the ttl of the lock. The lock's TTL will be reset to `milliseconds` milliseconds.

### Releasing a lock
Call an acquired lock's `release()` function to release the lock:

#### lock.release()

Alternatively, call `distLock.releaseLock(resourceName, id, callback)` to release a lock:

#### distLock.releaseLock(resourceName, id, callback)

Parameters:

Name  | Type | Description
----- | ---- | -----------
resourceName | string | Unique name of the shared resource that is locked
id | string | Unique ID of the lock to be released
callback | Function | Function called when the lock is released or an error occurs

On success, the callback function will be called with true (the lock was released) or false (the lock does not exist).


### Extending a lock
Call an acquired lock's `extend()` function to extend the TTL of the lock:

#### lock.extend(milliseconds)

Alternatively, call `distLock.extendLock(resourceName, id, milliseconds, callback)` to extend a lock:

#### distLock.extendLock(resourceName, id, milliseconds, callback)

Parameters:

Name  | Type | Description
----- | ---- | -----------
resourceName | string | Unique name of the shared resource that is locked
id | string | Unique ID of the lock to be extended
milliseconds | int | The lock's TTL will be reset to this many milliseconds
callback | Function | Function called when the lock is extended or an error occurs

On success, the callback function will be called with true (the lock was extended) or false (the lock does not exist).

### Getting the details of an acquired lock

#### distLock.getAcquiredLock(resourceName, callback)

Parameters:

Name  | Type | Description
----- | ---- | -----------
resourceName | string | Unique name of the shared resource that is locked
callback | Function | Function called with the lock's details or an error

On success, the callback function will be called with a lock or with null if the lock does not exist.

License
----

MIT
