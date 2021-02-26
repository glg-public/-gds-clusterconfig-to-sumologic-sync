# Sumo Logic Importer

The importer runs as a [GitHub Action Cron Job](https://github.com/glg/sumologic-us2/actions) and uses the [Sumo Logic API](https://api.us2.sumologic.com/docs/) in order to import the resources listed below from the Sumo Logic US2 Region.

- Saved Searches (w/ or w/o schedule)
- Dashboards (V1 and V2)

*Folders are created implicitly when the above objects are imported.*

## Testing

```bash
npm install
npm run test
```

## Note about the throttling in the code

Sumo Logic API's are rate limited by user.  The details are listed below.  Due to this limitation, the importer is severely throttled at the moment, but since this job really doesn't have any urgency, the limits don't cause any problems.

- A rate limit of four API requests per second (240 requests per minute) applies to all API calls from a user.
- A rate limit of 10 concurrent requests to any API endpoint applies to an access key.

If a rate is exceeded, a rate limit exceeded 429 status code is returned.

*We need to still explore if this limit can be increased by the Sumo Logic team.*

## Sample queries against `/exports`

```bash
# number of queries
find . -type f -iname "*.query" | wc -l
# number of dashboards
find . -type f -iname "__dashboard.json" | wc -l
# cases where an email address was used as a target
rg '@glgroup.com'
# schedule query count
rg 'searchSchedule.*\{' -c | wc -l
```

- https://help.sumologic.com/05Search/Library/Export-and-Import-Content-in-the-Library
