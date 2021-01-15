# gds-clusterconfig-to-sumologic-sync

A github action which takes information from a `gds.clusterconfig.*` repository, and syncs details to a Sumo Logic lookup table.

The lookup table will make it possible to query services, and find github events related to them, giving the developers a full picture as to how code made it to production.

## Requirements

1. the following **secret** must be present in your repository, either as a repository or organization level secret.

   1. `SUMO_LOGIC_API_ACCESS_SECRET`

      ```json
      {
        "SUMOLOGIC_ACCESS_ID": "insert-id-here",
        "SUMOLOGIC_ACCESS_KEY": "insert-key-here",
        "SUMOLOGIC_API_ENDPOINT": "https://api.us2.sumologic.com/api"
      }
      ```

## Configuration

| Input            | Description                                                  | Default      |
| ---------------- | ------------------------------------------------------------ | ------------ |
| sumologic_config | See `SUMO_LOGIC_API_ACCESS_SECRET` in **Requirements**       | **REQUIRED** |
| cluster          | eg. p01, i01, etc...<br />This is **optional** if the repository name follows the `gds.clusterconfig.*` naming convention. | ""           |

## Example Usage

```yaml
name: Sync to Sumo Logic
on:
  push:
    branches:
      - main
jobs:
  sumologic:
    runs-on: ubuntu-latest
    name: Sync GDS clusterconfig with Sumo Logic
    steps:
    - name: Checkout code
      id: checkout
      uses: actions/checkout@v2
    - name: Sync to Sumo Logic
      id: sync
      uses: glg-public/gds-clusterconfig-to-sumologic-sync@v1.0.0
      with:
        sumologic_config: ${{ secrets.SUMO_LOGIC_API_ACCESS_SECRET }}
```

## [Development](./DEVELOPMENT.md)

## Sumo Logic Tables

Some query helpers to quickly look at the tables:

```
cat path://"/Library/Admin Recommended/Share Your Ideas/GDS/Lookups/cc_cluster"
cat path://"/Library/Admin Recommended/Share Your Ideas/GDS/Lookups/cc_cluster_service_repo_branch"
```

To use them as a lookup:

```
// example
// p_cluster and p_service could be any name, but apply to fields already available
// in the query this is used in
| lookup git_repo, git_branch, ecr_repo, ecr_tag
from path://"/Library/Admin Recommended/Share Your Ideas/GDS/Lookups/cc_cluster_service"
on p_cluster=cluster, p_service=service
```

