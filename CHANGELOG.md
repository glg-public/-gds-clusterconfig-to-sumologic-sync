# Changelog

- 1.2.0
  - `entrypoint.sh` now passes the insert, update, delete off to the `publish-updates.js` script
  - rows that are no longer used are now being cleaned up in the lookup tables
  - created `Makefile` for development
  - added throttling to the requests to Sumo Logic to deal with rate limit issues
- 1.1.0
  - Using new tables
    - `Share Your Ideas/GDS/Tables/cc_cluster_service`
    - `Share Your Ideas/GDS/Tables/cc_cluster_service_repo_branch`
- 1.0.0
  - Initial release
  - Populates to the `Share Your Ideas/GDS/Lookups/cluster_service` table.
