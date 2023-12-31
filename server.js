// Express config
import express from 'express'
import path from 'node:path'
import bodyParser from 'body-parser'
import "dotenv/config"
import { URL } from 'url'
import uuid from 'uuid-v4'
import admin from 'firebase-admin'
const serviceAccount = process.env.FIRESTORE_KEY



admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(serviceAccount)),
  storageBucket: "egogreen-e5ca9.appspot.com"
})

const db = admin.firestore();
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
app.post('/app/upload', async (req, res) => {

  const UID = req.get('authorization')
  // Only process if the POST request includes a UID token
  if (typeof UID !== 'undefined' && UID) {

    // Receive Upload
    const startTime = new Date()
    dev("Upload Started: " + startTime.toISOString())
    const uploader = new Uploader()
    const data = await uploader.startUpload(req, res)
    let lastSyncTime = new Date()
    dev("Upload of ./uploads/" + data + " complete, calling taggun - Time Elapsed: " + (lastSyncTime-startTime))
    // Notify client we are complete
    res.json({"message":"200 Success"})
    res.status(200)
    
    //Save image to firebase Storage
    var bucket = admin.storage().bucket();
    console.log("./uploads/" + data)

    const metadata = {
      metadata: {
        firebaseStorageDownloadTokens: uuid()
      },
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    };
    const destinationFile = UID + "/" + data
    await bucket.upload("./uploads/" + data, {
      destination: destinationFile,
      gzip: true,
      metadata: metadata,
    })
    const initialReceiptData = {
      date: startTime.toISOString(),
      merchantName: "New Receipt - Processing",
      imageURL: encodeURIComponent(destinationFile),
      receiptTotal: 0.00,
      totalGCO2e: 0.00
    }

    const docID = await db.collection("userData/" + UID +"/receipts").add(initialReceiptData)
    .then(docref => {
      return (docref.id)
    })   
    console.log("DB id: " + docID) 
    // Taggun API call
    const taggun = new Taggun()
    const taggunResult = await taggun.sendReceipt("./uploads/" + data)
    let newSyncTime = new Date()
    dev("Taggun API finished - Time Elapsed: " + (newSyncTime-lastSyncTime))
    lastSyncTime = newSyncTime


    // Match to 
    const categorizer = new Categorizer(taggunResult)
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
    //console.log("userData/" + UID +"/receipts")
    await db.collection("userData/" + UID +"/receipts").doc(docID).update(categorizer.receiptData)
  } else {
    res.json({"message":"400 Bad Request"})
    res.status(400)
  }
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