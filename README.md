# pubg-stats
Playing with PUBG API

Outputs the percentage of matches played as FPP vs TPP in NA PC region because I was interested and couldn't find any up to date stats.

As of 8/11/2019 with a sampling of ~10,000 matches from the prior 100 hours the breakdown is:

```
fpp: 16.66% tpp: 83.34%
```

# Running

This program saves data to a local MongoDB instance which needs to be running in insecure mode. The match data can be queried for future analysis. Currently only the match attributes are saved.

Requires a PUBG API key set as the `PUBG_API_KEY` env variable. You can acquire one here: https://developer.pubg.com

Shard can be set with `PUBG_SHARD`. The available shards are listed here: https://documentation.pubg.com/en/making-requests.html#platforms-and-regions

```
npm i
PUBG_API_KEY=mypubngapikey PUBG_SHARD=steam-na npm start
```

Additionally, an `.env` file can be created at the root folder with the key defined:

```
PUBG_API_KEY=mypubngapikey
PUBG_SHARD=steam-na
```

and then the app can be run with just `npm start`