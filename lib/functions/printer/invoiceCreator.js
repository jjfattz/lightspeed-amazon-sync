const path = require('path');
const fs = require('fs');
const printer = require('printer');
const convertToPDF = require('pdf-puppeteer');
const logger = require('../../logger.js');
const markAsPrinted = require('./markAsPrinted.js');

let globalOrderID;
let globalResolve;

const callback = pdf => {
  /* const date = new Date();
  fs.writeFile(date + '.pdf', pdf, function(err) {
    if (err) throw err;
  }); */

  printer.printDirect({
    data: pdf, // or simple String: "some text"
    printer: 'Brother_MFC_J6930DW', // printer name, if missing then will print to default printer
    type: 'PDF', // type: RAW, TEXT, PDF, JPEG, .. depends on platform
    options: {
      sides: 'one-sided'
    },
    success: async jobID => {
      logger.log({
        level: 'info',
        message: `Order printed successfully`
      });
      console.log('sent to printer with ID: ' + jobID);

      await markAsPrinted(globalOrderID);
      globalResolve();
    },
    error: err => {
      logger.log({
        level: 'error',
        message: `ORDER WAS UNABLE TO BE PRINTED`
      });
      console.log(err);
    }
  });
};

const invoiceCreator = orderInfo => {
  return new Promise(async (resolve, reject) => {
    globalOrderID = orderInfo.id;
    globalResolve = resolve;

    const { address } = orderInfo;
    let addressString = `${address.AddressLine1}<br />`;
    if (address.AddressLine2) {
      addressString += `${address.AddressLine2}<br />`;
    }
    if (address.AddressLine3) {
      addressString += `${address.AddressLine3}<br />`;
    }
    addressString += `${address.City}, ${address.StateOrRegion} ${address.PostalCode}`;
    if (address.CountryCode !== 'US') {
      addressString += `<br />${address.CountryCode}`;
    }

    orderInfo.orderDate = new Date(orderInfo.orderDate).toLocaleString();

    let orderItems = '';

    orderInfo.items.forEach((item, index) => {
      let itemTotal = 0;
      let quantityStyle = 'color: #000;';
      if (parseInt(item.QuantityOrdered) > 1) {
        quantityStyle = 'color: #FF0000; font-weight: bold;';
      }
      orderItems += `<tr>`;
      orderItems += `<td style="${quantityStyle}">${item.QuantityOrdered}</td>`;
      orderItems += `<td>${item.Title}<br />SKU: ${item.SellerSKU}<br />ASIN: ${item.ASIN}</td>`;
      orderItems += `<td>$${item.ItemPrice.Amount}</td>`;
      orderItems += `<td>Item: \$${item.ItemPrice.Amount}<br />`;
      orderItems += `Shipping: \$${item.ShippingPrice.Amount}<br />`;
      if (item.ItemTax.Amount !== '0.00') {
        let tax =
          parseFloat(item.ShippingTax.Amount) + parseFloat(item.ItemTax.Amount);
        orderItems += `Tax: \$${tax.toFixed(2)}<br />`;
        itemTotal += tax;
      }
      itemTotal +=
        parseFloat(item.ItemPrice.Amount) +
        parseFloat(item.ShippingPrice.Amount);

      orderItems += `Item Total: \$${itemTotal.toFixed(2)}</td>`;

      orderItems += `</tr>`;

      /* if (index === 3) {
        orderItems += `<tr class="empty"><td colspan="4">&nbsp;</td></tr>`;
      } */
    });

    const htmlPath = path.resolve(__dirname, 'invoice-template.html');
    let template = await fs.readFileSync(htmlPath, { encoding: 'UTF8' });
    template = template
      .replace(/({name})/g, orderInfo.name)
      .replace(/({address})/g, addressString)
      .replace('{order ID}', orderInfo.id)
      .replace('{order date}', orderInfo.orderDate)
      .replace('{shipping service}', orderInfo.shippingService)
      .replace('{grand total}', orderInfo.orderTotal)
      .replace('{order items}', orderItems);
    // ^^ needs to use string instead of regex, otherwise there are weird bugs

    convertToPDF(
      template,
      callback,
      {
        printBackground: true,
        margin: {
          top: '0.25in',
          bottom: '0.25in',
          left: '0.25in',
          right: '0.25in'
        }
      },
      {
        // needs to use OS executable path, otherwise it errors out on our Pi
        executablePath: '/usr/bin/chromium-browser'
      },
      true
    );

    logger.log({
      level: 'info',
      message: `Order ${orderInfo.id} sent to printer...`
    });

    /* setTimeout(() => {
      resolve();
    }, 5000); */
  });
};

module.exports = invoiceCreator;
