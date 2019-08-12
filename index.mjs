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
      const url = 'mongodb://localhost:27017';
      // Database Name
      const dbName = 'pubg-stats';
      // Use connect method to connect to the server
      MongoClient.connect(url, { useNewUrlParser: true }, function (err, client) {
        if (err) return reject(err)
        console.log("Connected successfully to server");
        const db = client.db(dbName);
        resolve(db);
      });
    })
  },
  pubgApiKey: process.env.PUBG_API_KEY,
  pubgApiHeader(pubgApiKey) {
    return {
      accept: 'application/vnd.api+json',
      Authorization: `Bearer ${pubgApiKey}`
    }
  },
  pubgShard() {
    return process.env.PUBG_SHARD || 'steam'
  },
  async sample(pubgApiHeader, pubgShard) {
    return (utcDateTime) => axios.get(`https://api.pubg.com/shards/${pubgShard}/samples`, {
      params: {
        'filter[createdAt-start]': utcDateTime,
      },
      headers: pubgApiHeader,
    })
  },
  randomSampleTime() {
    return () => {
      return moment().subtract(1, 'days').subtract(Math.floor(Math.random() * 100), 'hours').utc().format()
    }
  },
  async sampleAny(sample, randomSampleTime) {
    return async () => await sample(randomSampleTime())
  },
  async matchApi(pubgShard) {
    return (matchId) => axios.get(`https://api.pubg.com/shards/${pubgShard}/matches/${matchId}`, {
      headers: {
        accept: 'application/vnd.api+json',
      }
    })
  }
})

function writeLine(text) {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(text);

}

const $ = blueprint.factory()

const REGULAR_MODES = ['duo', 'duo-fpp', 'solo', 'solo-fpp', 'squad', 'squad-fpp']

const ALL_MODES = ['duo', 'duo-fpp', 'solo', 'solo-fpp', 'squad', 'squad-fpp', 'conquest-duo', 'conquest-duo-fpp', 'conquest-solo', 'conquest-solo-fpp', 'conquest-squad', 'conquest-squad-fpp', 'esports-duo', 'esports-duo-fpp', 'esports-solo', 'esports-solo-fpp', 'esports-squad', 'esports-squad-fpp', 'normal-duo', 'normal-duo-fpp', 'normal-solo', 'normal-solo-fpp', 'normal-squad', 'normal-squad-fpp', 'war-duo', 'war-duo-fpp', 'war-solo', 'war-solo-fpp', 'war-squad', 'war-squad-fpp', 'zombie-duo', 'zombie-duo-fpp', 'zombie-solo', 'zombie-solo-fpp', 'zombie-squad', 'zombie-squad-fpp']

$(async (db, sampleAny, matchApi) => {
  const stats = REGULAR_MODES.reduce((memo, curr) => {
    memo[curr] = 0
    return memo
  }, { fpp: 0, tpp: 0, total: 0, duoTotal: 0, soloTotal: 0, squadTotal: 0 })
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
    }
  }
  function incStats(gameMode) {
    if (update[gameMode]) {
      update[gameMode]()
    }
  }

  function updateStats(matchAttr) {
    if (matchAttr && matchAttr.attributes) {
      const { attributes: { isCustomMatch, gameMode } } = matchAttr
      if (!isCustomMatch) incStats(gameMode)
      writeLine(`fpp: ${((stats.fpp / stats.total) * 100).toFixed(2)}% tpp: ${((stats.tpp / stats.total) * 100).toFixed(2)}% solo tpp: ${((stats.solo / stats.soloTotal) * 100).toFixed(2)}% solo fpp: ${((stats['solo-fpp'] / stats.soloTotal) * 100).toFixed(2)}% duo tpp: ${((stats.duo / stats.duoTotal) * 100).toFixed(2)}% duo fpp: ${((stats['duo-fpp'] / stats.duoTotal) * 100).toFixed(2)}% squad tpp: ${((stats.squad / stats.squadTotal) * 100).toFixed(2)}% squad fpp: ${((stats['squad-fpp'] / stats.squadTotal) * 100).toFixed(2)}%`)
    }
  }

  async function getMore() {
    try {
      const response = await sampleAny()
      const { headers: { 'x-ratelimit-remaining': remaining, 'x-ratelimit-reset': resetTime }, data: { data: { relationships: { matches: { data: matches } } } } } = response
      const existingMatches = await db.collection('match').find({
        id: { $in: matches.map(m => m.id) }
      }).toArray()

      const duplicateIds = existingMatches.map(({ id }) => id).reduce((memo, id) => {
        memo[id] = true
        return memo
      }, {})
      for (let matchAttr of existingMatches) {
        updateStats(matchAttr)
      }
      for (let id of matches.map(({ id }) => id).filter(id => !duplicateIds[id])) {
        try {
          const { data: { data } } = await matchApi(id)
          const matchAttr = {
            id: data.id,
            attributes: data.attributes
          }
          await db.collection('match').insertOne(matchAttr)
          updateStats(matchAttr)
        } catch (err) {
          console.error(err.data || err)
        }

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
        setTimeout(loop, (resetTime * 1000) - Date.now() + 10000)
      }
    } else {
      setTimeout(loop, 10000)
    }
  }

  loop()
})
