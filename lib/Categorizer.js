import OpenAI from "openai"
import sqlite3 from "sqlite3"
import fetch from 'node-fetch'
import "dotenv/config"
const openai = new OpenAI({apiKey: process.env.OPENAI_KEY})

export class Categorizer {
  constructor(data) {
    this.db = new sqlite3.Database(process.env.DBFILE, (err) => {
        if (err) {
          console.error(err.message)
        }
        // console.log('Connected to the database. ' + new Date().toISOString())
    })
    this.receiptData = {}
    this.receiptData.merchantName = data.merchantName.text
    this.receiptData.merchantAddress = data.merchantAddress.text
    this.receiptData.merchantCity = data.merchantCity.data
    this.receiptData.merchantState = data.merchantState.data
    this.receiptData.taxAmount = data.taxAmount.data
    this.receiptData.receiptTotal = data.totalAmount.data
    this.receiptData.paymentType = data.paymentType.data
    this.receiptData.taggunTimeElapsed = data.elapsed
    this.receiptData.date = data.date.data
    this.receiptData.lineItems = []

    let lineItemID = 0 
    data.entities.productLineItems.forEach(element => {
      const totalAmount = (!element.data.hasOwnProperty("totalPrice")) 
                          ? parseFloat(element.data.unitPrice.data)*parseInt(element.data.quantity.data)
                          : element.data.totalPrice.data

      this.receiptData.lineItems[lineItemID]  = {
          id: lineItemID,
          description: element.data.name.data,
          quantity: element.data.quantity.data,
          unitPrice: element.data.unitPrice.data,
          totalPrice: totalAmount,
          unspscCODE: '',
          unspscDescription: '',
          gco2e: 0
      }
      lineItemID++
    })
  }

  // classift line items to United Nations Standard Products and Services Code
  async categorizeItems(){
    let itemDescriptions = []
    for (const item of this.receiptData.lineItems) { itemDescriptions.push(item.description) }
    const openAICalls = itemDescriptions.map((value) => this.classifyUNSPSC(value))
    const results = await Promise.all(openAICalls)
    let i = 0
    for (const cat of results) { 
      this.receiptData.lineItems[i].unspscDescription = cat 
      this.receiptData.lineItems[i].unspscCODE = await this.getCode("SELECT Code FROM unspsc WHERE Description = ? LIMIT 1", cat)
      i++
    }
  }

  async classifyUNSPSC(item) {
    // UNSPSC requires 4 openAI Calls
    // Call # 1 - Segment
    const cat1 = await this.getCatergories("SELECT Description FROM unspsc WHERE Type = 1", [])
    const openAIQuery1 = this.buildOpenAIQuery(item, cat1)
    const result1 = await this.mainOpenAI(openAIQuery1)
    const match1 = JSON.parse(result1.message.content).category

    // Call # 2 - Family
    const cat2 = await this.getCatergories(
      "WITH T1 AS (SELECT Code FROM unspsc WHERE Description = ? AND Type = 1) " +
      "SELECT Description FROM unspsc, T1 WHERE Type = 2 AND unspsc.Code > T1.Code AND unspsc.Code < (ABS(T1.Code) + 999999)", match1)
    const openAIQuery2 = this.buildOpenAIQuery(item, cat2)
    const result2 = await this.mainOpenAI(openAIQuery2)
    const match2 = JSON.parse(result2.message.content).category

    // Call # 3 - Class 
    const cat3 = await this.getCatergories(
      "WITH T1 AS (SELECT Code FROM unspsc WHERE Description = ? AND Type = 2) " +
      "SELECT Description FROM unspsc, T1 WHERE Type = 3 AND unspsc.Code > T1.Code AND unspsc.Code < (ABS(T1.Code) + 9999)", match2)
    const openAIQuery3 = this.buildOpenAIQuery(item, cat3)
    const result3 = await this.mainOpenAI(openAIQuery3)
    const match3 = JSON.parse(result3.message.content).category

    // Call # 4 - Commodity
    const cat4 = await this.getCatergories(
      "WITH T1 AS (SELECT Code FROM unspsc WHERE Description = ? AND Type = 3) " +
      "SELECT Description FROM unspsc, T1 WHERE Type = 4 AND unspsc.Code > T1.Code AND unspsc.Code < (ABS(T1.Code) + 99)", match3)
    const openAIQuery4 = this.buildOpenAIQuery(item, cat4)
    const result4 = await this.mainOpenAI(openAIQuery4)
    const match4 = JSON.parse(result4.message.content).category
    return [match4, match3, match2, match1]
  }
  
  // DB access
  getAllPromise(query, params) {
    return new Promise ((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
          if (err) {
            reject(err)
          }
          resolve(rows)
      })
    })
  }

  dbGetPromise(query, params) {
    return new Promise ((resolve, reject) => {
        this.db.get(query, params, (err, rows) => {
            if (err) {
              reject(err)
            }
            resolve(rows)
        })
    })
  }

async getCode(sql, params) {
  try {
    let unspscCODE = "50000000" // we default to "Food Beverage and Tobacco Products"
    for(const cat of params) {
      // Sometimes OpenAI gets confused and returns a made up a category
      // Resulting in no rows matching on the code lookup
      // We fall back to the previous Category if no rows are returned
      const row = await this.dbGetPromise(sql, cat)
      if(row) {
        unspscCODE = row.Code
        break
      }
    }
    
    return unspscCODE
  } catch (error) {
    console.log(error)
  }
}

async getCatergories(sql, params) {
  let categoryDescriptions = ""
  try {
    const rows = await this.getAllPromise(sql, params)
    rows.forEach((row) => {
        categoryDescriptions += row.Description + ","
    })
    return categoryDescriptions.substring(0,categoryDescriptions.length-1)
  } catch(error) {
    console.log(error)
  }
}

// OpenAI Code
  buildOpenAIQuery(item, categories){
    const openAIQuery = "select the best product category match for the item " + 
    item +
    " purchased from " + this.receiptData.merchantName +
    " from the following options: " + 
    categories +
    " answer in JSON with the fields item and category"
    return openAIQuery
  }

  async mainOpenAI(query) {
    const completion = await openai.chat.completions.create({
      messages: [{ role: "system", 
      content: query }],
      model: "gpt-4",
    });
    return completion.choices[0]
  }

  // Bend API - Calculates CO2e from lineitems that are classified by UNSPCS
  async bendAPI() {
    let lineItems = { 'line_items': [] }
    for (const item of this.receiptData.lineItems) { 
      const price = parseInt(item.totalPrice * 100)
      lineItems.line_items.push({
        'line_item_id': JSON.stringify(item.id),
        'description': item.description,
        'purchase_date': this.receiptData.date.substring(0,10),
        'unit_type': 'product',
        'unit_price': {
            'value': price,
            'currency': 'USD'
            },
        'unspsc': item.unspscCODE
      })
    }

    const url = "https://api-staging.bend.green/v2/assess/line_items"
    const request = {
        method: 'POST',
        headers: {
          'X-Api-Key': process.env.BEND_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(lineItems)
      }
    let bendResult = {}
    try {
        await fetch(url, request)
        .then(res => res.json())
        .then((data) => {bendResult = data})
    } catch(error) {
        console.log("Error: " + error)
    }
    for (const row of this.receiptData.lineItems) {
      this.receiptData.lineItems[row.id].gco2e = bendResult.line_items[row.id].gco2e
    }
  }

  async setTotal() {
    let totalCO2e = 0.00
    let totalAmount = 0.00
    for (const item of this.receiptData.lineItems) {
      totalCO2e += item.gco2e
      totalAmount += item.totalPrice
    }
    this.receiptData.calculatedSubTotal = parseFloat(totalAmount).toFixed(2)
    this.receiptData.calculatedTotal = parseFloat(parseFloat(this.receiptData.calculatedSubTotal) + parseFloat(this.receiptData.taxAmount)).toFixed(2)
    this.receiptData.totalGCO2e = totalCO2e
    return true
  }
}
