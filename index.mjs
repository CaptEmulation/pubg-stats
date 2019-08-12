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
  async sample(pubgApiHeader) {
    return (utcDateTime) => axios.get('https://api.pubg.com/shards/steam-na/samples', {
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
  async matchApi() {
    return (matchId) => axios.get(`https://api.pubg.com/shards/stream-na/matches/${matchId}`, {
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
  const stats = {
    fpp: 0,
    tpp: 0,
    total: 0,
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

      for (let id of matches.map(({ id }) => id).filter(id => !duplicateIds[id])) {
        try {
          const { data: { data } } = await matchApi(id)
          const matchAttr = {
            id: data.id,
            attributes: data.attributes
          }
          await db.collection('match').insertOne(matchAttr)
          const { attributes: { isCustomMatch, gameMode } } = matchAttr
          if (!isCustomMatch && REGULAR_MODES.includes(gameMode)) {
            if (gameMode.includes('fpp')) {
              stats.fpp++
            } else {
              stats.tpp++
            }
            stats.total++
          }

          writeLine(`fpp: ${((stats.fpp / stats.total) * 100).toFixed(2)}% tpp: ${((stats.tpp / stats.total) * 100).toFixed(2)}%`)
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
