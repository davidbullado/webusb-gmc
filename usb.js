var resultReader = () => {};
var device;

/**
 * Print the result of the commands
 * @param {string} str 
 */
var printOut = (str) => {
  console.log(str);
}

function buf2hex(buffer) {
  return [...buffer]
    .map(x => x.toString(16)
    .padStart(2, '0'))
    .join('');
}

async function initUsb() {
  device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x1A86 }] });
  console.log(device.productName);
  await configureCH341(device);
  return true;
}

async function stopUsb() {
  await device.close();
}

async function usb() {
  try {
    device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x1A86 }] });
    console.log(device.productName);
  
    await configureCH341(device);
    
    await getVolt(device);
    await getTemp(device);
    //await setDateTime(device);
    await getDateTime(device);
    await getGyro(device);
    await getCPM(device);
    await getCfg(device);

    await new Promise(r => setTimeout(r, 10000));
    await device.close();
  } catch(error){
    console.error(error);
  }
}

need256bytes = false;

function listenBulkIn() {
  if (need256bytes){
    device.transferIn(2, 256).then(result => {
      resultReader(result);
      listenBulkIn();
    });
    need256bytes = false;
  } else {
    device.transferIn(2, 512).then(result => {
      resultReader(result);
      listenBulkIn();
    });
  }
}

async function configureCH341 (device) {
  await device.open();
  await device.claimInterface(0);
  // SET BAUDRATE
  res = await device.controlTransferOut({
    requestType: 'vendor',
    recipient: 'device',
    request: 0x9a, // CH341_REQ_WRITE_REG
    value: 0x1312,
    index: 0x9883 // Baud rate?
  });
  console.debug(res);
  res = await device.controlTransferOut({
    requestType: 'vendor',
    recipient: 'device',
    request: 0x9a, // CH341_REQ_WRITE_REG
    value: 0x2518,
    index: 0x00c3 // Baud rate?
  });
  console.debug(res);
  // SET HANDSHAKE
  res = await device.controlTransferOut({
    requestType: 'vendor',
    recipient: 'device',
    request: 0xa4, // CH341_REQ_MODEM_CTRL
    value: 0xff9f,
    index: 0x0000
  });
  console.debug(res);
  // GET STATUS
  res = await device.controlTransferIn({
    requestType: 'vendor',
    recipient: 'device',
    request: 0x95, // CH341_REQ_READ_REG
    value: 0x0706,
    index: 0x0000
  }, 2);
  console.debug(res);

  await device.selectConfiguration(1);
  await device.claimInterface(device.configuration.interfaces[0].interfaceNumber);

  listenBulkIn();
  listenBulkIn();

  res = await device.controlTransferOut({
    requestType: 'vendor',
    recipient: 'device',
    request: 164,
    value: 0xff9f,
    index: 0x0000
  });
  console.debug(res);
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

async function sendCommand(device, cmd) {
  console.debug(`send command ${cmd}`);
  const data = encoder.encode(`<${cmd}>>`);
  res = await device.transferOut(2,data);
  console.debug(`send response: ${res}`);
}

async function sendCommandParam(device, cmd, param) {
  console.debug(`send command ${cmd}`);
  const dataStart = encoder.encode(`<${cmd}`);
  const dataParam = new Uint8Array(param);
  const dataEnd = encoder.encode(`>>`);
  const data = new Uint8Array([ ...dataStart, ...dataParam, ...dataEnd ]);
  res = await device.transferOut(2,data);
  console.debug(`send response: ${res}`);
}


/**
 * Get current CPM value
 * @param {*} device 
 * @returns 
 */
 async function getCPM(device){
  await sendCommand(device, "GETCPM");
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      cpm = result.data.getUint16();
      printOut(`cpm: ${cpm}`);
      resolve();
    }
  });
}

/**
 * Get battery voltage status
 * @param {*} device 
 * @returns 
 */
 async function getVolt(device){
  await sendCommand(device, "GETVOLT");
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      volt = result.data.getUint8()/10;
      printOut(`volt: ${volt}`);
      resolve(volt);
    }
  });
}

/**
 * Get serial number
 * @param {*} device 
 * @returns 
 */
 async function getSerial(device){
  await sendCommand(device, "GETSERIAL");
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      if (result.data.buffer.byteLength != 7) {
        reject('Invalid GETSERIAL response');
      }
      let serial = buf2hex(new Uint8Array(result.data.buffer));
      printOut(`Serial: ${serial}`);
      resolve();
    }
  });
}

/**
 * Get configuration data
 * @param {*} device 
 * @returns 
 */
 async function getCfg(device){
  // Request a 256 bytes length response
  need256bytes = true;
  // Call two dummy commands
  await getDateTime(device);
  await getDateTime(device);
  // Send the query
  await sendCommand(device, "GETCFG");
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      cfg = btoa(String.fromCharCode.apply(null, new Uint8Array(result.data.buffer)));
      printOut(`cfg: ${cfg}`);
      resolve();
    }
  });
}

/**
 * Get year date and time
 * @param {*} device 
 * @returns 
 */
async function setDateTime(device){
  const d = new Date();
  yy = parseInt(d.getFullYear().toString().substring(2));
  mm = (d.getMonth() + 1);
  dd = d.getDate();
  hh = d.getHours();
  mi = d.getMinutes();
  ss = d.getSeconds();
  await sendCommandParam(device, `SETDATETIME`, [yy, mm, dd, hh, mi, ss]);
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      [check] = new Uint8Array(result.data.buffer);
      if (check !== 0xaa) {
        reject('Invalid SETDATETIME response');
      }
      printOut(`Datetime setted.`);
      resolve();
    }
  });
}

/**
 * Get year date and time
 * @param {*} device 
 * @returns 
 */
async function getDateTime(device){
  await sendCommand(device, "GETDATETIME");
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      [yy, mm, dd, hh, mi, ss, check] = new Uint8Array(result.data.buffer);
      if (check !== 0xaa) {
        reject('Invalid GETDATETIME response');
      }
      printOut(`Date time: ${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`);
      resolve();
    }
  });
}

/**
 * Get temperature
 * @param {*} device 
 * @returns 
 */
 async function getTemp(device){
  await sendCommand(device, "GETTEMP");
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      [intTemp, decTemp, negSigne, check] = new Uint8Array(result.data.buffer);
      if (check !== 0xaa) {
        reject('Invalid GETTEMP response');
      }
      printOut("Temp: " + (negSigne > 0 ? "" : "-") + intTemp + "." + decTemp);
      resolve();
    }
  });
}

/**
 * Get gyroscope data
 * @param {*} device 
 * @returns 
 */
async function getGyro(device){
  await sendCommand(device, "GETGYRO");
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      [x_msb, x_lsb, y_msb, y_lsb, z_msb, z_lsb, check] = new Uint8Array(result.data.buffer);
      if (check !== 0xaa) {
        reject('Invalid GETGYRO response');
      }
      x = x_msb<<8 | x_lsb;
      y = y_msb<<8 | y_lsb;
      z = z_msb<<8 | z_lsb;
      printOut(`Gyro: ${x}, ${y}, ${z}`);
      resolve();
    }
  });
}

/**
 * Power OFF
 * @param {*} device 
 * @returns 
 */
async function powerOFF(device){
  await sendCommand(device, "POWEROFF");
}

/**
 * Power ON
 * @param {*} device 
 * @returns 
 */
async function powerON(device){
  await sendCommand(device, "POWERON");
}

/**
 * Reboot unit
 * @param {*} device 
 * @returns 
 */
 async function reboot(device){
  await sendCommand(device, "REBOOT");
}