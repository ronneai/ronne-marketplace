# Functions MySQL removed

MySQL 9.6 removed `SHA1()`, `SHA()` and `MD5()` from the server (deprecated in 9.4; they come back
only with an optional "legacy hashing" component nobody installs by default). A query that uses one
fails with `FUNCTION <database>.sha1 does not exist` (error 1305). MariaDB keeps them, and so does
MySQL 8.4, the minimum Ronne supports, so the pull-request runs don't catch it: the weekly
`database.yml` run against the latest versions did, when Docker Hub's `mysql:lts` moved from 8.4 to
9.7 (2026-10-19).

In SQL that runs on MySQL, hash with `SHA2(text, 256)` (MySQL 5.5+, MariaDB 5.5+), and cut it with
`LEFT()` where the length matters: a `GET_LOCK` name stops at 64 characters, so the migration lock
(`db/create-db.ts`, 099) is `ronne-migration:` plus the first 40 characters of the SHA2.

Hashing that the app does in JavaScript (tokens, checksums) isn't affected: it never asks the
database to hash.

To check a query against the latest MySQL here, run it in a throwaway container of the image the
weekly run uses (`mysql:lts`; one Docker Hub pull):

```sh
docker run -d --rm --name mysql-latest -e MYSQL_ROOT_PASSWORD=x -e MYSQL_DATABASE=ronne mysql:lts
docker exec mysql-latest mysql -h127.0.0.1 -uroot -px ronne -e "select sha2('a', 256)"
docker stop mysql-latest
```
