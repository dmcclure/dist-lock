-- Atomically change the TTL of a lock iff its ID matches the one provided
if redis.call("HGET", KEYS[1], "id") == ARGV[1] then
  return redis.call("EXPIRE", KEYS[1], ARGV[2])
end
return 0
