import axios from 'axios'
import mongodb from 'mongodb'
import mold from 'shutterstock-mold'
import dotenv from 'dotenv'
import moment from 'moment'

dotenv.config()

const blueprint = mold({
  db() {
    return new Promise((resolve, reject) => {
      const { MongoClient } = mongodb
      // Connection URL
      const url = 'mongodb://localhost:27017'
      // Database Name
      const dbName = 'pubg-stats'
      // Use connect method to connect to the server
      MongoClient.connect(url, { useNewUrlParser: true }, function(
        err,
        client,
      ) {
        if (err) return reject(err)
        console.log('Connected successfully to server')
        const db = client.db(dbName)
        resolve(db)
      })
    })
  },
  pubgApiKey: process.env.PUBG_API_KEY,
  pubgApiHeader(pubgApiKey) {
    return {
      accept: 'application/vnd.api+json',
      Authorization: `Bearer ${pubgApiKey}`,
    }
  },
  pubgShard() {
    return process.env.PUBG_SHARD || 'steam'
  },
  async sample(pubgApiHeader, pubgShard) {
    return utcDateTime =>
      axios.get(`https://api.pubg.com/shards/${pubgShard}/samples`, {
        params: {
          'filter[createdAt-start]': utcDateTime,
        },
        headers: pubgApiHeader,
      })
  },
  randomSampleTime() {
    return () => {
      return moment()
        .subtract(1, 'days')
        .subtract(Math.floor(Math.random() * 312), 'hours')
        .utc()
        .format()
    }
  },
  async sampleAny(sample, randomSampleTime) {
    return async () => await sample(randomSampleTime())
  },
  async matchApi(pubgShard) {
    return matchId =>
      axios.get(`https://api.pubg.com/shards/${pubgShard}/matches/${matchId}`, {
        headers: {
          accept: 'application/vnd.api+json',
        },
      })
  },
})

function writeLine(text) {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(text)
}

const $ = blueprint.factory()

const REGULAR_MODES = [
  'duo',
  'duo-fpp',
  'solo',
  'solo-fpp',
  'squad',
  'squad-fpp',
]
const REGIONS = {
  as: 'Asia',
  eu: 'Europe',
  jp: 'Japan',
  kakao: 'Kakao',
  krjp: 'Korea',
  na: 'North America',
  oc: 'Oceania',
  ru: 'Russia',
  sa: 'South and Central America',
  sea: 'South East Asia',
  tournament: 'Tournaments',
}

const matcherPcRegion = /\.pc-.*\.(as|eu|jp|kakao|krjp|na|oc|ru|sa|sea|tournament)\./

const ALL_MODES = [
  'duo',
  'duo-fpp',
  'solo',
  'solo-fpp',
  'squad',
  'squad-fpp',
  'conquest-duo',
  'conquest-duo-fpp',
  'conquest-solo',
  'conquest-solo-fpp',
  'conquest-squad',
  'conquest-squad-fpp',
  'esports-duo',
  'esports-duo-fpp',
  'esports-solo',
  'esports-solo-fpp',
  'esports-squad',
  'esports-squad-fpp',
  'normal-duo',
  'normal-duo-fpp',
  'normal-solo',
  'normal-solo-fpp',
  'normal-squad',
  'normal-squad-fpp',
  'war-duo',
  'war-duo-fpp',
  'war-solo',
  'war-solo-fpp',
  'war-squad',
  'war-squad-fpp',
  'zombie-duo',
  'zombie-duo-fpp',
  'zombie-solo',
  'zombie-solo-fpp',
  'zombie-squad',
  'zombie-squad-fpp',
]

function createRegionStats() {
  const stats = REGULAR_MODES.reduce(
    (memo, curr) => {
      memo[curr] = 0
      return memo
    },
    { fpp: 0, tpp: 0, total: 0, duoTotal: 0, soloTotal: 0, squadTotal: 0 },
  )

  const update = {
    duo() {
      stats.tpp++
      stats.duo++
      stats.duoTotal++
      stats.total++
    },
    solo() {
      stats.tpp++
      stats.solo++
      stats.soloTotal++
      stats.total++
    },
    squad() {
      stats.tpp++
      stats.squad++
      stats.squadTotal++
      stats.total++
    },
    ['duo-fpp']() {
      stats.fpp++
      stats['duo-fpp']++
      stats.duoTotal++
      stats.total++
    },
    ['solo-fpp']() {
      stats.fpp++
      stats['solo-fpp']++
      stats.soloTotal++
      stats.total++
    },
    ['squad-fpp']() {
      stats.fpp++
      stats['squad-fpp']++
      stats.squadTotal++
      stats.total++
    },
  }
  return {
    update,
    stats,
  }
}

$(async (db, sampleAny, matchApi) => {
  const parsedMatches = new Map()
  const pcStats = Object.entries(REGIONS).reduce(
    (memo, [shortCode, description]) => {
      memo[shortCode] = {
        description,
        ...createRegionStats(),
      }
      return memo
    },
    {},
  )
  function incStats(data) {
    if (
      pcStats[data.region] &&
      pcStats[data.region].update[data.data.attributes.gameMode]
    ) {
      pcStats[data.region].update[data.data.attributes.gameMode]()
    }
  }

  function updateStats(matchAttr) {
    if (matchAttr && matchAttr.data && matchAttr.data.attributes) {
      const { isCustomMatch } = matchAttr.data.attributes
      if (!isCustomMatch) {
        incStats(matchAttr)
        const totalMatches = Object.keys(REGIONS).reduce((memo, region) => {
          return pcStats[region].stats.total + memo
        }, 0)
        process.stdout.write('\x1b[0f')
        writeLine(
          Object.keys(REGIONS)
            .filter(region => {
              const stats = pcStats[region].stats
              return stats.total !== 0
            })
            .map(region => {
              const stats = pcStats[region].stats
              return `${pcStats[region].description} (${(
                (stats.total / totalMatches) *
                100
              ).toFixed(0)}%) fpp: ${((stats.fpp / stats.total) * 100).toFixed(
                0,
              )}% tpp: ${((stats.tpp / stats.total) * 100).toFixed(
                0,
              )}% solo tpp: ${((stats.solo / stats.soloTotal) * 100).toFixed(
                0,
              )}% solo fpp: ${(
                (stats['solo-fpp'] / stats.soloTotal) *
                100
              ).toFixed(0)}% duo tpp: ${(
                (stats.duo / stats.duoTotal) *
                100
              ).toFixed(0)}% duo fpp: ${(
                (stats['duo-fpp'] / stats.duoTotal) *
                100
              ).toFixed(0)}% squad tpp: ${(
                (stats.squad / stats.squadTotal) *
                100
              ).toFixed(0)}% squad fpp: ${(
                (stats['squad-fpp'] / stats.squadTotal) *
                100
              ).toFixed(0)}%`
            })
            .join('\n'),
        )
        writeLine(`${totalMatches} matches processed`)
      }
    }
  }

  const previousData = await db
    .collection('match')
    .find()
    .toArray()
  for (let matchAttr of previousData) {
    if (!parsedMatches.has(matchAttr.data.id)) {
      updateStats(matchAttr)
      parsedMatches.set(matchAttr.data.id, true)
    }
  }

  async function getMore() {
    try {
      const response = await sampleAny()
      const {
        headers: {
          'x-ratelimit-remaining': remaining,
          'x-ratelimit-reset': resetTime,
        },
        data: {
          data: {
            relationships: {
              matches: { data: matches },
            },
          },
        },
      } = response
      const existingMatches = await db
        .collection('match')
        .find(
          {
            'data.id': { $in: matches.map(m => m.id) },
          },
          { 'data.id': true, 'data.attributes': true, region: true },
        )
        .toArray()

      const duplicateIds = existingMatches
        .map(({ id }) => id)
        .reduce((memo, id) => {
          memo[id] = true
          return memo
        }, {})

      for (let matchAttr of existingMatches) {
        if (!parsedMatches.has(matchAttr.data.id)) {
          updateStats(matchAttr)
          parsedMatches.set(matchAttr.data.id, true)
        }
      }
      let index = 0
      const loadMatches = matches
        .map(({ id }) => id)
        .filter(id => !duplicateIds[id])
      while (index < loadMatches.length) {
        const chunk = Math.min(15, loadMatches.length - index)
        const ops = []
        const telemetryToLoad = []
        for (let i = index; i < chunk; i++) {
          ops.push(
            matchApi(loadMatches[i])
              .then(({ data }) => {
                const assetRef = data.included.find(d => d.type === 'asset')
                if (assetRef) {
                  telemetryToLoad.push({
                    url: assetRef.attributes.URL,
                    matchId: loadMatches[i],
                  })
                }
                parsedMatches.set(data.data.id, true)
                return data
              })
              .catch(e => console.error(e)),
          )
        }

        const fetchMatches = await Promise.all(ops)
        const newData = (await Promise.all(
          telemetryToLoad.map(({ url, matchId }) => {
            return axios.get(url).then(({ data }) => {
              const matchRef = data.find(d => d.MatchId)

              if (matchRef) {
                const regionMatches = matchRef.MatchId.match(matcherPcRegion)
                if (regionMatches && regionMatches[1]) {
                  const fullData = Object.assign(
                    {
                      region: regionMatches[1],
                    },
                    fetchMatches.find(m => m.data.id === matchId),
                  )
                  updateStats(fullData)
                  return fullData
                }
              }
            })
          }),
        )).filter(r => !!r)

        if (newData.length) await db.collection('match').insertMany(newData)
        index += chunk
      }
      return { remaining, resetTime }
    } catch (err) {
      console.error(err)
    }
  }

  async function loop() {
    const response = await getMore()
    if (response) {
      const { remaining, resetTime } = response
      if (remaining > 0) {
        setTimeout(loop)
      } else if (resetTime) {
        const waitTime = resetTime * 1000 - Date.now() + 1000
        console.log(`\nWaiting for ${Math.floor(waitTime / 1000)}s`)
        setTimeout(loop, waitTime)
      }
    } else {
      setTimeout(loop, 10000)
    }
  }

  loop()
})
