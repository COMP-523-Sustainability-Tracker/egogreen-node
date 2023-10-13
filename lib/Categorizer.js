const OpenAI = require('openai')
const openai = new OpenAI({apiKey: process.env.OPENAI_KEY})

class Categorizer {

    processReceiptData (data, res) {
        // Build Object with data needed for CO2e calculations
        const receiptData = {}
        receiptData.merchantName = data.merchantName.text
        receiptData.merchantAddress = data.merchantAddress.text
        receiptData.merchantCity = data.merchantCity.data
        receiptData.merchantState = data.merchantState.data
        receiptData.taxAmount = data.taxAmount.data
        receiptData.receiptTotal = data.totalAmount.data
        receiptData.paymentType = data.paymentType.data
        receiptData.taggunTimeElapsed = data.elapsed
        receiptData.lineItems = []

        // Process Line Items
        data.entities.productLineItems.forEach(element => {
            receiptData.lineItems.push({
                description: element.data.name.data,
                quantity: element.data.quantity.data,
                unitPrice: element.data.unitPrice.data,
                totalPrice: element.data.totalPrice.data,
            })
        })

        // Next we need to categorize -- Perhaps with OpenAI
        /* -- Needs work 
        const query = "select the best product category match for the item " + element.data.name.data +
            " from the following options: " + 
            "'Dairy,Apples,Vegetables,Beverages,Bread,Eggs,Plants' answer in JSON with the fields item and category"
        mainOpenAI(query)
        */
        console.log("Done Categorizing: " + new Date().toISOString())
        return receiptData

    }

    async mainOpenAI(query) {
        const completion = await openai.chat.completions.create({
          messages: [{ role: "system", 
          content: query }],
          model: "gpt-3.5-turbo",
        });
        console.log(completion.choices[0]);
      }
  

}

module.exports = Categorizer