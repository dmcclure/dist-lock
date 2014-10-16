-- Atomically change the TTL of a Redis string object with a given key iff its value matches the value provided
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("EXPIRE", KEYS[1], ARGV[2])
end
return 0
