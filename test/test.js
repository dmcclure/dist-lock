var should = require('should');
var async = require('async');
var redis = require('redis').createClient();

var keyPrefix = '__test_lock:';

// Delete any test locks in Redis
beforeEach(function(done) {
  redis.keys(keyPrefix + '*', function(err, rows) {
    should.not.exist(err);

    async.each(rows, function(row, cb) {
      redis.del(row, cb);
    }, done);
  });
});

it('acquires available lock', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);

    lock.should.not.be.false;
    lock.should.have.property('key', keyPrefix + 'test-resource');
    lock.should.have.property('id');

    // Make sure the lock is in Redis
    redis.get(keyPrefix + 'test-resource', function(err, data) {
      should.not.exist(err);
      data.should.not.be.false;
      data.should.startWith('c'); // Should be a cuid
      done();
    });
  });
});

it('fails to acquire unavailable lock', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix, maxRetries: 0 });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);
    lock.should.not.be.false;

    distLock.acquire('test-resource', function(err, lock) {
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

it('extends a lock ttl', function(done) {
  var distLock = require('../')(redis, { keyPrefix: keyPrefix, ttl: 100 });
  distLock.acquire('test-resource', function(err, lock) {
    should.not.exist(err);
    lock.should.not.be.false;

    lock.extend(1, function(err, result) {
      should.not.exist(err);
      result.should.be.exactly(1);

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
        result.should.be.exactly(0);
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