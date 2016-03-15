-- Atomically delete a lock iff its ID matches the one provided
if redis.call("HGET", KEYS[1], "id") == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0