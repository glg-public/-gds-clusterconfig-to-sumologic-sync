'use strict';
const { mkdir, readFile, writeFile, access } = require('fs/promises');
const { constants: { F_OK } } = require('fs');
const { sumoRequest, sumoJob, sumoSearch } = require('./sumologic');

// export GITHUB_REPOSITORY='/home/phadviger/code/glg/gds-clusterconfig-to-sumologic-sync/.dev/workdir'
const createConfig = () => {
  // GitHub Action Inputs
  let {
    SUMOLOGIC_ACCESS_ID: id
    , SUMOLOGIC_ACCESS_KEY: key
    , SUMOLOGIC_API_ENDPOINT: endpoint
  } = JSON.parse(process.env.INPUT_SUMOLOGIC_CONFIG ?? "{}");
  // Override if environment variables are present
  id = process.env.SUMOLOGIC_ACCESS_ID ?? id;
  key = process.env.SUMOLOGIC_ACCESS_KEY ?? key;
  endpoint = process.env.SUMOLOGIC_API_ENDPOINT ?? endpoint;
  // return config object
  return {
    sumo: { id, key, endpoint }
    , dataDir: '/tmp/sumologic_data'
    , uploadEntries: '/tmp/payload'
    , repoDir: process.env.GITHUB_REPOSITORY
    , targetCluster: process.env.INPUT_CLUSTER
    , tableIds: ["0000000001007719", "0000000000FF668A"]
  };
};

const cacheWrapper = async (cachePath, method) => {
  return access(cachePath, F_OK)
  .then(
    async () => {
      const data = await JSON.parse(await readFile(cachePath, 'utf8'));
      console.log(`:: read from cache ${cachePath}`);
      return data;
    }
    , async () => {
      const data = await method();
      if (data !== null) {
        const json = JSON.stringify(data, null, 2);
        await writeFile(cachePath, json, 'utf8');
      }
      return data;
    }
  );
};

const mapC = async (data, callback, {concurrency=1} = {}) => {
  const _data = Array.from(data);
  const result = new Array(_data.length);
  await Promise.all(
    new Array(concurrency).fill(_data.entries())
    .map(async iterator => {
      for (let [index, item] of iterator) {
        result[index] = await callback(item, index);
      }
    })
  );
  return result;
};

const kv = obj => Object.entries(obj).map(([k, v]) => `${k}='${v}'`).join(' ');

const getTableInfo = async ({sumo, dataDir, tableId}) => {
  const data = await cacheWrapper(
    `${dataDir}/${tableId}.json`
    , () => sumoRequest({
      sumo
      , url: `/v1/lookupTables/${tableId}`
      , admin: true
    })
  );
  const {data: {contentPath, name}} = data;
  return {table: {name, path: contentPath, id: tableId}};
};

const createSearchPayload = ({path}) => {
  const query = `cat path://"${path}"`
  const from = (Date.now() - 1000).toString();
  const to = Date.now().toString();
  return JSON.stringify({query, from, to});
};

const fetchClusterLookups = async ({sumo, dataDir, repoDir, targetCluster, tableIds}) => {
  console.log(`:: processing ${tableIds.length} table(s)`);
  const result = {};
  await mapC(
    tableIds
    , async (tableId, index) => {
      console.log(`:: table_index='${index}' id='${tableId}'`);
      const {table} = await getTableInfo({sumo, dataDir, tableId});
      console.log(`:: ${kv(table)}`);

      const payload = createSearchPayload(table);

      const search = await cacheWrapper(
        `${dataDir}/search-${table.id}.json`
        , () => sumoSearch({
          sumo
          , url: `/v1/search/jobs`
          , payload
        })
      );
      result[table.id] = search.messages.reduce(
        (final, {map: {cluster, service, git_repo, git_branch}}) => {
          if (cluster === targetCluster) {
            final[`${cluster}|${service}`] = {cluster, service, git_repo, git_branch};
          }
          return final;
        }
        , {}
      );
      return result[table.id];
    }
    // We really want concurrency to currently be at 1, but it's built into
    // the code to scale, if sumo logic increases the rate limit for
    // APIs up from 240/min/user
    , {concurrency: 1}
  )
  .catch(error => {
    console.error(error);
  });
  return result;
};

const loadClusterServices = async ({uploadEntries}) => {
  const input = await readFile(uploadEntries, 'utf8');
  return input
  .trim()
  .split('\n')
  .map(row => JSON.parse(row));
};

(async () => {
  try {
    /*
     * MAIN
     */
    const config = createConfig();

    await mkdir(config.dataDir, { recursive: true });

    const clusterServices = await loadClusterServices(config);
    const mappings = await fetchClusterLookups(config);
    console.log(mappings);

  } catch (error) {
    console.error(error);
    // important to exit with a failure code for the action to abort
    process.exit(1);
  }
})();