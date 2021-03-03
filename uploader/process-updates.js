'use strict';
const { mkdir, readFile, writeFile, access } = require('fs/promises');
const { constants: { F_OK } } = require('fs');
const { sumoRequest, sumoSearch } = require('./sumologic');

// NOTE: The "main()" method is at the bottom of the file, start there!
// https://api.us2.sumologic.com/docs/#tag/lookupManagement

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
    , clusterConfigExport: '/tmp/payload'
    , repoDir: process.env.GITHUB_REPOSITORY
    , targetCluster: process.env.CLUSTER
    // TODO: Need to make these configurable, but have to find proper place
    , tableIds: ["0000000001007719", "0000000000FF668A"] // PROD
    //, tableIds: ["00000000010D6C07", "00000000010D4453"] // DEV
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
  const outputFile =  `${dataDir}/${tableId}.json`;
  const res = await cacheWrapper(
    outputFile
    , () => sumoRequest({
      sumo
      , url: `/v1/lookupTables/${tableId}`
      , admin: true
    })
  );
  const {status, data} = res;
  if (!(status >= 200 && status <= 299)) {
    throw new Error(JSON.stringify(res));
  }
  const {contentPath, name} = data;
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
  await mapC(tableIds
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
        (final, {map: {cluster, service, git_repo, git_branch, ecr_repo, ecr_tag}}) => {
          if (cluster === targetCluster) {
            final[`${cluster}|${service}|${git_repo}|${git_branch}`] = {
              cluster, service, git_repo, git_branch, ecr_repo, ecr_tag
            };
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
  return result;
};

const loadClusterServices = async ({clusterConfigExport}) => {
  const input = await readFile(clusterConfigExport, 'utf8');
  return input
  .trim()
  .split('\n')
  .filter(v => v) // remove empty rows from array
  .map(row => JSON.parse(row));
};

const createLookupPayload = (entry) => ({
  "row": Object.entries(entry).map(([k, v]) => ({ "columnName": k, "columnValue": v }))
});

const deleteLookupPayload = (entry) => ({
  "primaryKey": Object.entries(entry).map(([k, v]) => ({ "columnName": k, "columnValue": v }))
});

const uploadToLookups = async ({sumo}, clusterServices, lookupTable) => {
  // loop through all the cluster/service entries
  await mapC(clusterServices
    , async (entry, index) => {
      // process them once per lookup table
      for (const tableId of Object.keys(lookupTable)) {
        console.log(`:: start upload ${kv({tableId})} ${kv(entry)}`);
        // regardless of success, we'll remove any attempted processing on entries
        // from the list, so they are not removed.
        delete lookupTable[tableId][
          `${entry.cluster}|${entry.service}|${entry.git_repo}|${entry.git_branch}`
        ]
        // upload the entry to sumo logic. logs errors, but proceed regardless.
        const { status, data } = await sumoRequest({
          sumo
          , url: `/v1/lookupTables/${tableId}/row`
          , method: 'put'
          , payload: createLookupPayload(entry)
          , preSleep: 1500
        })
        .catch(error => {
          console.error(error);
          return {status: -1, data: null};
        });
        console.log(`:: end upload ${kv({tableId})} ${kv({status})} ${kv(entry)}`);
      }
    }
    , {concurrency: 1}
  );
};

const removeExpiredEntries = async({sumo}, lookupTable) => {
  for (const [tableId, entries] of Object.entries(lookupTable)) {
    for (const {cluster, service, git_repo, git_branch} of Object.values(entries)) {
      const primaryKeys = {cluster, service, git_repo, git_branch};
      console.log(`:: start delete ${kv({tableId})} ${kv(primaryKeys)}`);
      const { status, data } = await sumoRequest({
        sumo
        , url: `/v1/lookupTables/${tableId}/deleteTableRow`
        , method: 'put'
        , payload: deleteLookupPayload(primaryKeys)
        , preSleep: 1500
      })
      .catch(error => {
        return {status: -1, data: null};
      });
      console.log(`:: end delete ${kv({tableId})} ${kv({status})} ${kv(primaryKeys)}`);
    }
  }
};

(async () => {
  try {
    /*
     * MAIN
     */
    const config = createConfig();

    await mkdir(config.dataDir, { recursive: true });

    const clusterServices = await loadClusterServices(config);
    const lookupTable = await fetchClusterLookups(config);
    // NOTE: commenting out the upload would clear the lookup table data for this cluster
    await uploadToLookups(config, clusterServices, lookupTable);
    await removeExpiredEntries(config, lookupTable);

  } catch (error) {
    // important to exit with a failure code for the action to abort
    console.error(error);
    process.exit(1);
  }
})();
