// Express config
import express from 'express'
import path from 'node:path'
import bodyParser from 'body-parser'
import "dotenv/config"
import { URL } from 'url'

function dev (msg) {
  // set to control verbosity
  if(true) {
    console.log(msg)
  }
}  

const dirname = new URL('.', import.meta.url).pathname
const app = express()

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.set('json spaces', 4)

// Import modules scripts
import {Uploader} from './lib/Uploader.js'
import {Taggun} from './lib/Taggun.js'
import {Categorizer} from './lib/Categorizer.js'

// Uploads endpoint
app.post('/app/upload', async (req, res, receiptName) => {

  // Receive Upload
  const startTime = new Date()
  dev("Upload Started: " + startTime.toISOString())
  const uploader = new Uploader()
  const data = await uploader.startUpload(req, res)
  let lastSyncTime = new Date()
  dev("Upload of ./uploads/" + data + " complete, calling taggun - Time Elapsed: " + (lastSyncTime-startTime))

  // Taggun API call
  const taggun = new Taggun()
  const taggunResult = await taggun.sendReceipt("./uploads/" + data)
  let newSyncTime = new Date()
  dev("Taggun API finished - Time Elapsed: " + (newSyncTime-lastSyncTime))
  lastSyncTime = newSyncTime


  // Match to 
  const categorizer = new Categorizer(taggunResult)
  dev("Categorizing with OpenAI and UNSPSC:")
  await categorizer.categorizeItems()
  newSyncTime = new Date()
  dev("OpenAICategorizer finished - Time Elapsed: " + (newSyncTime-lastSyncTime))
  lastSyncTime = newSyncTime
  await categorizer.bendAPI()
  newSyncTime = new Date()
  dev("Bend CO2e Calculator finished - Time Elapsed: " + (newSyncTime-lastSyncTime))
  lastSyncTime = newSyncTime
  dev("Done: - Total Time Elapsed: " + (newSyncTime-startTime))
  await categorizer.setTotal();
  res.json(categorizer.receiptData)
})

// Fail other app endpoints
app.all('/app/*', (req, res, next) => {
	res.json({"message":"404 NOT FOUND"})
    res.status(404)
})

// Static HTML
const staticpath = path.join(dirname, 'public')
app.use('/', express.static(staticpath))
const server = app.listen(process.env.PORT)
let startMsg = new Date().toISOString() + ' HTTP server started on port ' + process.env.PORT + '\n'
console.log(startMsg)