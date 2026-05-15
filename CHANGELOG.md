# Changelog for @extend-therapy/elysia-db-ratelimiter

## 0.1.0 (2026-05-15)

* chore: publish to GitHub Packages

## 0.0.8

* simplify package.json
* add more tests
* add encryption to cookie
* make encryption or hashing optional and called cookieObfuscation strategy
* add alwaysCheckCookieValue option to check if the cookie value matches the IP address (set to true for `none` strategy)
* add cookie and ratelimit key transfer on IP change
* add cookie and ratelimit key transfer on invalid cookie value (if cookie is invalid, we generate a new key and transfer the cookie and ratelimit key to the new key)

## 0.0.7

* add declarationDir to tsconfig.json and types to package.json

## 0.0.6

* return false if failOpen is false and we can't get an IP

## 0.0.5

* don't return true on failure to get IP
