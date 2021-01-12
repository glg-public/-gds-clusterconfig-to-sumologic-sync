# gds-clusterconfig-to-sumologic-sync

## Development

### `create_table <schema_name>`

- `<schema_name>.json` has to exists in the current directory
- outputs a log called `create_table.<schema_name>.json.<epoch>.log` which can be viewed with `./latest create_table <schema_name>`

### `insert_lookup <schema_name>`

### `latest <action> <schema_name>`

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