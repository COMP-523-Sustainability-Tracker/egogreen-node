const fs = require('fs')
const FormData = require('form-data');
const fetch = require('node-fetch');
const formData = new FormData();

class Taggun {
    sendReceipt(filename) {
        formData.append('refresh', 'false');
        formData.append('incognito', 'false');
        formData.append('extractTime', 'false');
        formData.append('file', fs.createReadStream(filename));
        formData.append('extractLineItems', 'true');
        
        const url = 'https://api.taggun.io/api/receipt/v1/verbose/file';
        const options = {
          method: 'POST',
          headers: {accept: 'application/json', apikey: '7a2b5cb060c511eea8f313266e4aecd5'}
        };
        
        options.body = formData;
        
        let temp 
        fetch(url, options)
          .then(res => res.json())
          .then(json => console.log(json) )    
          .catch(err => console.error('error:' + err));
    }
}

module.exports = Taggun