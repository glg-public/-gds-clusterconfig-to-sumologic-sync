# gds-clusterconfig-to-sumologic-sync

## Development

### Sumo Logic API Scripts

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
> ```
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

