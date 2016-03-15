var should = require('should');
var async = require('async');
var redis;

var keyPrefix = '__test_lock:';

// Delete any test locks in Redis
beforeEach(function(done) {
  if (redis) redis.quit();
  redis = require('redis').createClient();
  redis.keys(keyPrefix + '*', function(err, rows) {
    should.not.exist(err);

    async.each(rows, function(row, cb) {
      redis.del(row, cb);
    }, done);
  });
});

it('acquires available lock with an owner specified', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix });
  distLock.acquire('test-resource', 'the owner', function(err, lock) {
    should.not.exist(err);

    lock.should.not.be.false;
    lock.should.have.property('key', keyPrefix + 'test-resource');
    lock.should.have.property('id');
    lock.should.have.property('owner', 'the owner');

    // Make sure the lock is in Redis
    redis.hget(keyPrefix + 'test-resource', 'id', function(err, data) {
      should.not.exist(err);
      data.should.not.be.false;
      data.should.startWith('c'); // Should be a cuid
      done();
    });
  });
});

it('acquires available lock without an owner specified', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);

    lock.should.not.be.false;
    lock.should.have.property('key', keyPrefix + 'test-resource');
    lock.should.have.property('id');
    lock.should.have.property('owner', '');

    // Make sure the lock is in Redis
    redis.hget(keyPrefix + 'test-resource', 'id', function(err, data) {
      should.not.exist(err);
      data.should.not.be.false;
      data.should.startWith('c'); // Should be a cuid
      done();
    });
  });
});

it('returns details of an acquired lock with an owner specified', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix });
  distLock.acquire('test-resource', 'the owner 2', function(err, lock) {
    should.not.exist(err);

    lock.should.not.be.false;
    lock.should.have.property('key', keyPrefix + 'test-resource');
    lock.should.have.property('id');
    lock.should.have.property('owner', 'the owner 2');
    var lockId = lock.id;

    // Make sure the same lock can be obtained
    distLock.getAcquiredLock('test-resource', function(err, existingLock) {
      should.not.exist(err);
      existingLock.should.not.be.false;
      existingLock.should.have.property('key', keyPrefix + 'test-resource');
      existingLock.should.have.property('id', lockId);
      existingLock.should.have.property('owner', 'the owner 2');
      done();
    });
  });
});

it('returns details of an acquired lock with no owner specified', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);

    lock.should.not.be.false;
    lock.should.have.property('key', keyPrefix + 'test-resource');
    lock.should.have.property('id');
    lock.should.have.property('owner', '');
    var lockId = lock.id;

    // Make sure the same lock can be obtained
    distLock.getAcquiredLock('test-resource', function(err, existingLock) {
      should.not.exist(err);
      existingLock.should.not.be.false;
      existingLock.should.have.property('key', keyPrefix + 'test-resource');
      existingLock.should.have.property('id', lockId);
      existingLock.should.have.property('owner', '');
      done();
    });
  });
});

it('returns null trying to get an acquired lock that does not exist', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix });
  distLock.getAcquiredLock('unlocked-resource', function(err, existingLock) {
    should.not.exist(err);
    (existingLock === null).should.be.true;
    done();
  });
});

it('fails to acquire unavailable lock', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix, maxRetries: 0 });
  distLock.acquire('test-resource', 'the owner', function(err, lock) {
    should.not.exist(err);
    lock.should.not.be.false;

    distLock.acquire('test-resource', 'wannabe owner', function(err, lock) {
      should.not.exist(err);
      lock.should.be.false;
      done();
    });
  });
});

it('released lock may be reacquired immediately', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);
    lock.should.not.be.false;

    lock.release(function(err) {
      should.not.exist(err);

      distLock.acquire('test-resource', function(err, lock) {
        should.not.exist(err);
        lock.should.not.be.false;
        done();
      });
    });
  });
});

it('releases lock automatically after ttl', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix, ttl: 100 });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);
    lock.should.not.be.false;

    setTimeout(function() {
      distLock.acquire('test-resource', function(err, lock) {
        should.not.exist(err);
        lock.should.not.be.false;
        done();
      });
    }, 200);
  });
});

it('extends a lock ttl with lock.extend()', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix, ttl: 100 });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);
    lock.should.not.be.false;

    lock.extend(1, function(err, result) {
      should.not.exist(err);
      result.should.be.true;

      setTimeout(function() {
        var distLockNoRetry = require('../')(redis, { keyPrefix: keyPrefix, maxRetries: 0 });
        distLockNoRetry.acquire('test-resource', function(err, lock) {
          should.not.exist(err);
          lock.should.be.false;
          done();
        });
      }, 200);
    });
  });
});

it('extends a lock ttl with extendLock()', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix, ttl: 100 });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);
    lock.should.not.be.false;

    distLock.extendLock('test-resource', lock.id, 1, function(err, result) {
      should.not.exist(err);
      result.should.be.true;

      setTimeout(function() {
        var distLockNoRetry = require('../')(redis, { keyPrefix: keyPrefix, maxRetries: 0 });
        distLockNoRetry.acquire('test-resource', function(err, lock) {
          should.not.exist(err);
          lock.should.be.false;
          done();
        });
      }, 200);
    });
  });
});

it('fail to extend an expired lock', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix, ttl: 100 });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);
    lock.should.not.be.false;

    setTimeout(function() {
      lock.extend(1, function(err, result) {
        should.not.exist(err);
        result.should.be.false;
        done();
      });
    }, 200);
  });
});

it('acquire lock on retry', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix, ttl: 100 });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);
    lock.should.not.be.false;

    distLock.acquire('test-resource', function(err, lock) {
      should.not.exist(err);
      lock.should.not.be.false;
      lock.should.have.property('acquiredOnAttempt');
      lock.should.have.property('acquireDelay');
      done();
    });
  });
});

it('fail to acquire unavailable lock when max attempts reached', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);
    lock.should.not.be.false;

    var distLockLimitedRetries = require('../')(redis, { keyPrefix: keyPrefix, maxRetries: 3 });
    distLockLimitedRetries.acquire('test-resource', function(err, lock) {
      should.not.exist(err);
      lock.should.be.false;
      done();
    });
  });
});