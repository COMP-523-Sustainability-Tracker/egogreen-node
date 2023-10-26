import fs from 'fs'
import FormData from 'form-data'
import fetch from 'node-fetch'

export class Taggun {
  async sendReceipt(filename, res) {
    const formData = new FormData()
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
              //console.log("wrote response to file" + filename+".json.txt " + new Date().toISOString());
            }
          })
          result = data
        })
    } catch (e) {
      console.log(e)
    } 
    return result
  }
}