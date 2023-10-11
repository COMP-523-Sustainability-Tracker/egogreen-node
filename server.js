const express = require('express')
const path = require('node:path')
const fs = require('fs')
const bodyParser = require("body-parser")

const app = express()
const port = 8080

const multer = require('multer')
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/')
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname)
    }
    
  });
const upload = multer({ storage: storage })
module.exports = upload;

app.post('/app/upload', upload.single('file'), (req, res) => {
    var uploadedFile = './' + req.file.path
    console.log(uploadedFile)
    try {
        if (!fs.existsSync('./' + req.file.path)) {
            console.log("Cannot find file", req.file.path)
            return false
    }
    } catch(err) {
        console.log(err)
    } 
    res.status(200).contentType("text/plain").end("File uploaded!")
});

/*
    const formData = new FormData()
    formData.append('refresh', 'false')
    formData.append('incognito', 'false')
    formData.append('extractTime', 'false')
    formData.append('file', fs.createReadStream('./' + req.file.path))
    formData.append('extractLineItems', 'true')

    console.log(formData)
    res.sendFile(path.join(__dirname, './' + req.file.path));
  
    const url = 'https://api.taggun.io/api/receipt/v1/verbose/file'
    const options = {
      method: 'POST',
      headers: {accept: 'application/json', apikey: '7a2b5cb060c511eea8f313266e4aecd5'}
    };
  
    options.body = formData;


    console.log(options)
    res.sendFile(path.join(__dirname, './' + req.file.path));
    return

    fetch(url, options)
      .then(res => res.json())
      .then(json => { 
        test = json} )
      .catch(err => console.error('error:' + err))
    
    console.log("Served Page")
  
    res.json({
        full: test,
    })


*/

app.all('/app/*', (req, res, next) => {
	res.json({"message":"404 NOT FOUND"});
    res.status(404);
});

const staticpath = path.join(__dirname, 'public')
app.use('/', express.static(staticpath))

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.set('json spaces', 4)

const server = app.listen(port)

let startMsg = new Date().toISOString() + ' HTTP server started on port ' + port + '\n'
console.log(startMsg)