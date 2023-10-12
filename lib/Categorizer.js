

class Categorizer {
    processItems (data) {
        console.log("Tagguns finished: " + new Date().toISOString())
        console.log()

        console.log(data.merchantName.text)
        console.log(data.merchantAddress.text)
        console.log(data.merchantCity.data)
        console.log(data.merchantState.data)
        console.log(data.merchantPostalCode.data)
        console.log()

        data.entities.productLineItems.forEach(element => {
            
            console.log(element.data.name.data, element.data.quantity.data, element.data.unitPrice.data)
        });
        //console.log(data)
        console.log(data.taxAmount.data, data.totalAmount.data, data.paymentType.data)
        console.log(data.elapsed)

        console.log()
        console.log("Start Categorizing: " + new Date().toISOString())

    }


}

module.exports = Categorizer