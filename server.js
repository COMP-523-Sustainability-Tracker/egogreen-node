// Express config
const express = require('express')
const path = require('node:path')
const fs = require('fs')
const bodyParser = require("body-parser")
const app = express()
const port = 8080
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.set('json spaces', 4)

// Upload script
const Uploader = require("./lib/Uploader.js")
const uploader = new Uploader()

//Taggun
const Taggun = require("./lib/Taggun.js")


// Uploads endpoint
app.post('/app/upload', async (req, res, receiptName) => {
    console.log("Upload Started: " + new Date().toISOString())
    uploader.startUpload(req, res)
    .then((data) => {
      console.log("Upload of ./uploads/" + data + " complete, calling taggun: " + new Date().toISOString())
      const taggun = new Taggun()
      const taggunData = taggun.sendReceipt("./uploads/" + data)
      res.sendFile(path.join(__dirname, "./uploads/" + data));
      
    })
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