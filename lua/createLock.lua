-- Atomically set a hash and set its TTL iff a hash with the same key doesn't already exist
-- TODO: Try to get an existing lock so we can return it if one exists
if redis.call("EXISTS", KEYS[1]) == 0 then
  redis.call("HMSET", KEYS[1], "id", ARGV[1], "owner", ARGV[2])
  redis.call("PEXPIRE", KEYS[1], ARGV[3])
  return 1
end
return 0
