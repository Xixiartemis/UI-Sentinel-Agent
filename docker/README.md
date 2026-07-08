# Docker infrastructure

`docker-compose.yml` provides the Task 1 development dependencies. The root
`compose.yaml` mirrors it so the stack can be started directly from the repository
root:

- PostgreSQL 16 with pgvector
- Redis 7

The PostgreSQL initialization script enables the `vector` extension on the first creation of the data volume.
