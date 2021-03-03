# gds-clusterconfig-to-sumologic-sync

## Development

### Lookup Table Creation

The lookup tables we use are created [via Terraform](https://github.com/glg/sumologic-us2).

### Query Lookup Tables

Some query helpers to quickly look at the tables:

```none
cat path://"/Library/Admin Recommended/Share Your Ideas/GDS/Tables/cc_cluster"
cat path://"/Library/Admin Recommended/Share Your Ideas/GDS/Tables/cc_cluster_service_repo_branch"
```

To use them as a lookup:

```none
// example
// p_cluster and p_service could be any name, but apply to fields already available
// in the query this is used in
| lookup git_repo, git_branch, ecr_repo, ecr_tag
from path://"/Library/Admin Recommended/Share Your Ideas/GDS/Lookups/cc_cluster_service"
on p_cluster=cluster, p_service=service
```

## Testing

Execute the bash commands from the git repository root.

```bash
# make sure you are at the root of the repo
cd "$(git rev-parse --show-toplevel)"
# build the docker container locally for development
make build # use "rebuild" if you want to clear anything cached (uncommon)
# enter the container to test
make shell
```

This will place you in the container with minimal environment variables.  The default directory will be a fake clusterconfig repository.  The cluster will be mapped to p99.

```bash
# run the script
rm -f /tmp/sumologic_data/* && /app/entrypoint.sh 
```

> You'll see output like this, indicating that it's hitting sumo logic but unable to authenticate, which is good.
>
> ```none
> :: processing 2 table(s)
> :: table_index='0' id='0000000001007719'
> Error: {"status":401,"data":{"servlet":"rest","message":"User could not be found.","url":"/api/v1/lookupTables/0000000001007719","status":"401"}}
> ```

We are still working out API key issues with Sumo Logic, so there is no full integration test yet.  If you do have API keys, and want to test run the script, set the `SUMOLOGIC_ACCESS_ID` and `SUMOLOGIC_ACCESS_KEY` prior to running the tests.  Eg:

```bash
# on your host machine
export SUMOLOGIC_ACCESS_ID="xxxx"
export SUMOLOGIC_ACCESS_KEY="xxxx"
# in the container
make shell
rm -f /tmp/sumologic_data/* && /app/entrypoint.sh 
```

## Notes

### Rate Limits

- A rate limit of four API requests per second (240 requests per minute) applies to all API calls from a user.
- A rate limit of 10 concurrent requests to any API endpoint applies to an access key.

If a rate is exceeded, a rate limit exceeded 429 status code is returned.

### Old Data

The Sumo Logic API can delete rows via:

- TTL
- Delete Row API call

The problem is, that you cannot query a table via API.  Since our use case for these tables is based on commits to a clusterconfig repo, TTLs are not really ideal.

We'll likely have to look at the diff related to a commit/PR in order to determine what needs to be deleted.

Another option would be to issue a query against the lookup table, and find the data that way, but need to still look into the complexity behind that.

## Sumo Logic API Notes

```bash
# turn int id into hex id
printf '%016X\n' 16598516
# turn hex id into int id
printf '%d' $((16#0000000000FD45F4))
```

