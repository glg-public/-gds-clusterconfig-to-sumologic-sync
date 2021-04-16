'use strict';
const axios = require('axios');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sumoRequest = async ({
  sumo, url, admin=false, method='get', payload=null, preSleep=0
}) => {
  // sometimes it's prefixed with the endpoint, sometimes not
  const safeUrl = url.replace(sumo.endpoint, '');
  const args = {
    method
    , url: `${sumo.endpoint}${safeUrl}`
    , auth: {
      username: sumo.id
      , password: sumo.key
    }
    , headers: {}
    , validateStatus: false
  }
  if (admin === true) {
    args.headers.isAdminMode = 'true';
  }
  if (payload !== null) {
    args.headers['Content-Type'] = 'application/json';
    args.data = payload;
  }
  await sleep(preSleep);
  const { status, data } = await axios(args);
  return { status, data };
};

const sumoJob = async ({sumo, url, admin=false, method='get'}) => {
  const initUrl = url;
  const statusUrl = id => `${url}/${id}/status`;
  const resultUrl = id => `${url}/${id}/result`;

  // queue the job with sumologic
  const { data: { id: jobId } } = await sumoRequest({
    sumo, url: initUrl, admin, method
  });
  console.log(`:: ${initUrl} jobId ${jobId}`);

  // wait for job to complete
  const success = await [1500, 7500, 15000, 30000, 60000]
  .reduce(async (success, ms) => {
    success = await success; // process sequentially
    if (success) {
      return success; // exit if job is done
    }
    // wait before request (intentional sleep before first request)
    // with 1.5 seconds buffer, we run 40 jobs per minute max
    // 40 jobs * 3 min api calls = 120, which is still way under the 240/m
    // rate limit of sumo logic
    console.log(`:: ${statusUrl(jobId)} check job in ${ms}ms`);
    await sleep(ms);
    const { status, data } = await sumoRequest({
      sumo, url: statusUrl(jobId), admin
    });
    if (status === 200 && data.status === 'Success') {
      return true;
    }
    console.log(`:: ${statusUrl(jobId)} ${JSON.stringify({status, data}, null, 0)}`);
    return false
  }, false);

  if (!success) {
    throw new Error(`:: ${statusUrl(jobId)} job unsuccessful`);
  }

  const { status, data } = await sumoRequest({
    sumo, url: resultUrl(jobId), admin
  });

  if (status !== 200) {
    throw new Error(`:: ${resultUrl(jobId)} could not fetch data`);
  }

  return data;
};

// https://help.sumologic.com/APIs/Search-Job-API/About-the-Search-Job-API
//
// 301 moved
// 401 unauthorized
// 403 forbidden
// 404 notfound
// 405 method.unsupported
// 415 contenttype.invalid
// 429 rate.limit.exceeded
// 500 internal.error
// 503 service.unavailable
const sumoSearch = async ({sumo, url: initUrl, payload}) => {
  // queue the job with sumologic
  //
  // 400 generic
  // 400 invalid.timestamp.to
  // 400 invalid.timestamp.from
  // 400 to.smaller.than.from
  // 400 unknown.timezone
  // 400 empty.timezone
  // 400 no.query
  // 400 unknown.time.type
  // 400 parse.error
  //
  // error:
  // {
  //   "status" : 400,
  //   "id" : "IUUQI-DGH5I-TJ045",
  //   "code" : "searchjob.invalid.timestamp.from",
  //   "message" : "The 'from' field contains an invalid time."
  // }
  //
  // success:
  // {
  //   "status": 202,
  //   "data": {
  //     "id": "641259F2B975D432",
  //     "link": {
  //       "rel": "self",
  //       "href": "https://api.us2.sumologic.com/api/v1/search/jobs/641259F2B975D432"
  //     }
  //   }
  // }
  const res = await sumoRequest({
    sumo
    , url: initUrl
    , admin: false
    , method: 'post'
    , payload
  });
  if (!(res.status >= 200 && res.status <= 299)) {
    console.error(res);
    throw new Error(res.code ?? 'could not queue search');
  }
  const {data: {id: jobId, link: {href: statusUrl}}} = res;
  console.log(`:: jobId='${jobId}' statusUrl='${statusUrl}'`);

  // due to sumo logic's rate limits, we pre-emptively wait before checking status
  const success = await [1500, 7500, 15000, 30000, 60000]
  .reduce(async (success, ms) => {
    success = await success; // process sequentially
    if (success) {
      return success; // exit if job is done
    }
    // wait before request (intentional sleep before first request)
    // with 1.5 seconds buffer, we run 40 jobs per minute max
    // 40 jobs * 3 min api calls = 120, which is still way under the 240/m
    // rate limit of sumo logic
    console.log(`:: jobId='${jobId}' check job status in ${ms}ms`);
    await sleep(ms);

    // "NOT STARTED"
    // "GATHERING RESULTS"
    // "FORCE PAUSED"
    // "DONE GATHERING RESULTS"
    // "CANCELLED"
    // {
    //    "state":"DONE GATHERING RESULTS",
    //    "messageCount":90,
    //    "histogramBuckets":[
    //       {
    //          "length":60000,
    //          "count":1,
    //          "startTimestamp":1359404820000
    //       }
    //    ],
    //    "pendingErrors":[],
    //    "pendingWarnings":[],
    //    "recordCount":1
    // }
    const {status, data} = await sumoRequest({sumo, url: statusUrl});
    const {state, messageCount, recordCount} = data;

    if (status >= 200 && status <= 299 && state === "DONE GATHERING RESULTS") {
      console.log(`:: messageCount='${messageCount}' recordCount='${recordCount}'`);
      return true;
    }
    if (status === 429) {
      console.log(`:: ${statusUrl} ${JSON.stringify({status, data}, null, 0)}`);
      return false;
    }
    console.error(`:: ${statusUrl} ${JSON.stringify({status, data}, null, 0)}`);
    throw new Error(`${statusUrl} job status check error`);
  }, false);

  if (!success) {
    throw new Error(`${statusUrl} job status check unsuccessful`);
  }

  const resultUrl = (jobId) => `${statusUrl}/messages?offset=0&limit=10000`
  const { status, data } = await sumoRequest({
    sumo, url: resultUrl(jobId)
  });

  if (status !== 200) {
    throw new Error(`${resultUrl(jobId)} could not fetch data`);
  }

  return data;
};

module.exports = {
  sumoRequest
  , sumoJob
  , sumoSearch
}
