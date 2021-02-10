# gds-clusterconfig-to-sumologic-sync

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

## Development

### Terraform

We are now using Terraform to manage the lookup tables, and the repository and workspace for GLG are both called **sumologic-us2**.

### Sumo Logic Tables

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

### Sumo Logic API Scripts (deprecated)

These should be run from the `./dev/setup` directory on the host machine.

> Assumes you have a .access file with export commands for the SUMOLOGIC environment vars.  (TODO, more notes)

### `create_table <schema_name>`

This creates a new lookup table in sumologic.

eg: `./create_table my_table_name`

- `<schema_name>.json` has to exists in the current directory
- outputs a log called `create_table.<schema_name>.json.<epoch>.log` which can be viewed with `./latest create_table <schema_name>`
- **NOTE**: it's worth checking the `.log` file generated from a successful table creation, as it helps developers further work with the table using the API in the future.  Sumo Logic's API and IDs are somewhat odd to work with.

### `latest <action> <schema_name>`

eg: `./latest create_table my_table_name`

- shows the logs of the last run

## Testing

Execute the bash commands from the git repository root.

```bash
# build the docker container locally
.dev/build
# shell into the docker container
#   (this puts you into /github/workspace directory where
#   the fake clusterconfig repository lives)
.dev/shell
# run the script to test
/entrypoint.sh
```

> You'll see output like this, indicating that it's hitting sumo logic but unable to authenticate, which is good.
>
> ```none
> status_code:401 [p01,auth],dockerdeploy,[github/glg/glg-jwt,latest],[glg/glg-jwt,ecs]
> status_code:401 [p01,epi-screamer],dockerdeploy,[github/glg/epi-screamer,latest],[glg/epi-screamer,gds-migration]
> status_code:401 [p01,log],autodeploy,[p01.glgresearch.com/log,latest],[glg/log,master]
> status_code:401 [p01,bounce],dockerdeploy,[github/glg-public/bounce,latest],[glg-public/bounce,master]
> error: p01/./bad-log/orders: unable to extract GIT_REPO
> ```

We are still working out API key issues with Sumo Logic, so there is no full integration test yet.  If you do have API keys, and want to test run the script, set the `SUMOLOGIC_ACCESS_ID` and `SUMOLOGIC_ACCESS_KEY` prior to running the tests.  Eg:

```bash
# on your host machine
export SUMOLOGIC_ACCESS_ID="xxxx"
export SUMOLOGIC_ACCESS_KEY="xxxx"
# in the container
.dev/shell
/entrypoint.sh
```

## Sumo Logic API Notes

```bash
# turn int id into hex id
printf '%016X\n' 16598516
# turn hex id into int id
printf '%d' $((16#0000000000FD45F4))
```

