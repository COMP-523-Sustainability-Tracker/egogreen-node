// Express config
const express = require('express')
const path = require('node:path')
const fs = require('fs')
const bodyParser = require("body-parser")
const app = express()
const port = 8080

// API KEYS 
require('dotenv').config()

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.set('json spaces', 4)

// Upload script
const Uploader = require("./lib/Uploader.js")
const uploader = new Uploader()

// Uploads endpoint
app.post('/app/upload', async (req, res, receiptName) => {
    console.log("Upload Started: " + new Date().toISOString())
    uploader.startUpload(req, res)
    .then((data) => {
      console.log("Upload of ./uploads/" + data + " complete, calling taggun: " + new Date().toISOString())
      // Upload is finished process with Taggun
      const Taggun = require("./lib/Taggun.js")
      const taggun = new Taggun()
      const taggunResult = taggun.sendReceipt("./uploads/" + data)
      // For testing we send Image to browser 
      // res.sendFile(path.join(__dirname, "./uploads/" + data))
      console.log("Taggun API finished: " + new Date().toISOString())
      return taggunResult
    }).then((rawTaggunData) => {
      const Categorizer = require("./lib/Categorizer.js")
      const categorizer = new Categorizer()
      const receiptData = categorizer.processReceiptData(rawTaggunData, res)

      res.json(receiptData)
    })
    .catch(console.log.bind(console))
    console.log("Async Call finished: " + new Date().toISOString())

})

// Fail other app endpoints
app.all('/app/*', (req, res, next) => {
	res.json({"message":"404 NOT FOUND"})
    res.status(404)
})


// Static HTML
const staticpath = path.join(__dirname, 'public')
app.use('/', express.static(staticpath))
const server = app.listen(port)
let startMsg = new Date().toISOString() + ' HTTP server started on port ' + port + '\n'
console.log(startMsg)