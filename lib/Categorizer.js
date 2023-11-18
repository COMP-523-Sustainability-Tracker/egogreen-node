import OpenAI from "openai"
import fetch from 'node-fetch'
import "dotenv/config"
import { initializeApp } from "firebase/app";
import { getFirestore,  collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";

const openai = new OpenAI({apiKey: process.env.OPENAI_KEY})

export class Categorizer {
  constructor(data) {
    const firebaseConfig = JSON.parse(process.env.FIREBASEAPP)
    this.app = initializeApp(firebaseConfig);
    this.db = getFirestore(this.app);

    this.receiptData = {}
    this.receiptData.merchantName = data.merchantName.text
    this.receiptData.merchantAddress = data.merchantAddress.text
    this.receiptData.merchantCity = data.merchantCity.data
    this.receiptData.merchantState = data.merchantState.data

    const taxAmount = (!data.hasOwnProperty("taxAmount")) ? parseFloat(data.taxAmount.data) : 0.00

    this.receiptData.taxAmount = taxAmount
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
          unspscCODE: 50000000,
          unspscDescription: '',
          gco2e: 0
      }
      lineItemID++
    })
  }

  // classify line items to United Nations Standard Products and Services Code
  async categorizeItems(){
    let itemDescriptions = []
    for (const item of this.receiptData.lineItems) { itemDescriptions.push(item.description) }
    const openAICalls = itemDescriptions.map((value) => this.classifyUNSPSC(value))
    const results = await Promise.all(openAICalls)
    let i = 0
    for (const cat of results) { 
      this.receiptData.lineItems[i].unspscDescription = cat 
      if (this.receiptData.lineItems[i].unspscCODE == 50000000) {
        this.receiptData.lineItems[i].unspscCODE = (await this.getCode(cat[0])).toString();
      } 
      i++
    }
  }

  async classifyUNSPSC(item) {
    // UNSPSC requires 4 openAI Calls 
    // Call # 1 - Segment
    const cat1 = await this.getCatergories(1)
    const openAIQuery1 = this.buildOpenAIQuery(item, cat1)
    const result1 = await this.mainOpenAI(openAIQuery1)
    const match1 = JSON.parse(result1.message.content).category
    const code1 = await this.getCode(match1)

    // Call # 2 - Family
    const cat2 = await this.getCatergories(2, code1)
    const openAIQuery2 = this.buildOpenAIQuery(item, cat2)
    const result2 = await this.mainOpenAI(openAIQuery2)
    const match2 = JSON.parse(result2.message.content).category
    const code2 = await this.getCode(match2)

    // Call # 3 - Class 
    const cat3 = await this.getCatergories(3, code2)
    const openAIQuery3 = this.buildOpenAIQuery(item, cat3)
    const result3 = await this.mainOpenAI(openAIQuery3)
    const match3 = JSON.parse(result3.message.content).category
    const code3 = await this.getCode(match3)

    // Call # 4 - Commodity
    const cat4 = await this.getCatergories(4, code3)
    const openAIQuery4 = this.buildOpenAIQuery(item, cat4)
    const result4 = await this.mainOpenAI(openAIQuery4)
    const match4 = JSON.parse(result4.message.content).category
    const code4 = await this.getCode(match4)

    return [match4, match3, match2, match1]
  }
  
  async getCode(category) {
    let unspscCODE = 50000000 // we default to "Food Beverage and Tobacco Products" as a fail safe
    // Sometimes OpenAI gets confused and returns a made up a category
    // Resulting in no rows matching on the code lookup
    // We fall back to the previous Category if no rows are returned
    const q = query(collection(this.db, "unspsc"), where("Description", "==", category), limit(1));
    const querySnapshot = await getDocs(q);
    if(!querySnapshot.empty) {
        querySnapshot.forEach((doc) => {
            unspscCODE = doc.data().Code 
            }); 
      }
    return unspscCODE
  }

  async getCatergories(type, code) {
    if(!type) { return "Must specify type"}
    let q
    if (code) {
        switch (type) {
            case 2:
            q = query(collection(this.db, "unspsc"), 
                            where("Type", "==", type), 
                            where("Code", ">", code),
                            where("Code", "<=", code + 999999));
            break;
            case 3:
            q = query(collection(this.db, "unspsc"), 
                            where("Type", "==", type), 
                            where("Code", ">", code),
                            where("Code", "<=", code + 9999));
            break;
            case 4:
                q = query(collection(this.db, "unspsc"), 
                                where("Type", "==", type), 
                                where("Code", ">", code),
                                where("Code", "<=", code + 99));
                break;

        }

     } else {
        q = query(collection(this.db, "unspsc"), where("Type", "==", type));
       
    }
    let categoryDescriptions = ""
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
    // doc.data() is never undefined for query doc snapshots
    //console.log(doc.id, " => ", doc.data())
    categoryDescriptions += doc.data().Description + ', '
    });
    return categoryDescriptions.substring(0,categoryDescriptions.length-2)
}

// OpenAI Code
  buildOpenAIQuery(item, categories){
    const openAIQuery = "select the best product category match for the item " + 
    item +
//    " which in this case was purchased from " + this.receiptData.merchantName +
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
        'unspsc': item.unspscCODE,
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
      this.receiptData.lineItems[row.id].gco2e = bendResult.assessments[row.id].gco2e
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
