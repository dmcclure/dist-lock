-- Atomically delete a Redis string object with a given key iff its value matches the value provided
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0