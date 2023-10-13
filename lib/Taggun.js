const fs = require('fs')
const FormData = require('form-data');
const fetch = require('node-fetch');
const formData = new FormData();




class Taggun {
  async sendReceipt(filename, res) {
    formData.append('refresh', 'false')
    formData.append('incognito', 'false')
    formData.append('extractTime', 'false')
    formData.append('file', fs.createReadStream(filename))
    formData.append('extractLineItems', 'true')
    
    const url = 'https://api.taggun.io/api/receipt/v1/verbose/file'
    const options = {
      method: 'POST',
      headers: {accept: 'application/json', apikey: process.env.TAGGUN_KEY}
    };
    
    options.body = formData;
    let result
    try {
      await fetch(url, options)
        .then(res => res.json())
        // save JSON data to file for now. 
        .then((data) => {
          fs.writeFile(filename+".json.txt", JSON.stringify({data}, null, 2), err => {
            if(err){
              console.log("error writing file. ", err);
            } else {
              console.log("wrote response to file" + filename+".json.txt " + new Date().toISOString());
            }
          })
          //console.log(JSON.stringify(data))
          result = data
        })
    } catch (e) {
      console.log(e)
    } 
    return result
  }
}
module.exports = Taggun