var resultReader = () => {};
var defaultReader = (result) => {
  let size = result.data.buffer.byteLength;
  let hex = buf2hex(new Uint8Array(result.data.buffer));
  printOut(`Default Reader: hex=${hex}
  Size: ${size}`);
}
var cpsReader = (result) => {
  cpm = 0x3FFF & result.data.getUint16();
  printOutCPS(`CPS: ${cpm}`);
}
var heartbeatIsON = false;
var device;

/**
 * Print the result of the commands
 * @param {string} str 
 */
var printOut = (str) => {
  console.log(str);
}
/**
 * Print the result of CPS
 * @param {string} str 
 */
 var printOutCPS = (str) => {
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


function transfertIn_bak(device, length) {
  device.transferIn(2, length).then(async result => {
    console.debug(result);
    // Only because the device can send garbage. We will ignore anything receveid during the configuration
    if (startListening){
      // do nothing
      console.log("Garbage received, heartbeat probably on");
      heartbeatIsON = true;
    } else {
      // Try to determinate why the result reader is null
      if (!heartbeatIsON && resultReader == null){
        // It is an heartbeat if the two msb are equal to 10
        if ((result.data.getUint16() >> 14 & 0b11) == 0b10) {
          heartbeatIsON = true;
        }
      }
      // default case, if we expect a result from a command and HB is ON
      if (resultReader != null && !heartbeatIsON){
        console.debug("Read using command reader");
        // Read the result with a reader defined in the methods above
        resultReader(result);
      // most difficult case, if we expect a result and HB is ON
      } else if (resultReader != null && heartbeatIsON) {
        try {
          console.debug("Try read using command reader");
          // Try to read the result with a reader defined in the methods above
          await resultReader(result);
        } catch(error){
          console.error("Catch error, read using heartbeat reader");
          // In case of failure, read with heartbeat reader
          cpsReader(result);
        }
      // Simple case, we don't expect a result, but HB is ON
      } else if (resultReader == null && heartbeatIsON){
        console.debug("Read using heartbeat reader");
        // Read with heartbeat reader
        cpsReader(result);
      // Shoud never happen case, no result expected and HB is OFF
      } else {
        console.debug("Read using default reader");
        // Read with default debuging reader
        defaultReader(result);
      }
      resultReader = null;
    }
    // Once the result has been read, start a new listener
    listenBulkIn();
  });
}


function transfertIn(device, length) {
  device.transferIn(2, length).then(async result => {
    console.debug(result);

    var isCPS = result.data.byteLength === 2 && (result.data.getUint8(0) & 0b1100_0000) === 0b1000_0000;

    if (isCPS) {
      cpsReader(result);
    } else if (resultReader != null) {
      resultReader(result);
    } else if (!startListening) {
      console.debug("Read using default reader");
      // Read with default debuging reader
      defaultReader(result);
    }
    resultReader = null;

    // Once the result has been read, start a new listener
    listenBulkIn();
  });
}

function listenBulkIn() {
  // Some commands needs to wait for precisely 256 bytes
  if (need256bytes){
    transfertIn(device, 256);
    need256bytes = false;
  } else { // Defaut case, wait for 512
    transfertIn(device, 512);
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

  startListening = true;
  listenBulkIn();
  listenBulkIn();
  startListening = false;

  res = await device.controlTransferOut({
    requestType: 'vendor',
    recipient: 'device',
    request: 164,
    value: 0xff9f,
    index: 0x0000
  });
  console.debug(res);
}

const decoder = new TextDecoder('ascii');
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
 * Get current CPS value
 * @param {*} device 
 * @returns 
 */
 async function getCPS(device){
  await sendCommand(device, "GETCPS");
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      cpsReader(result);
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
      if (result.data.buffer.byteLength != 1) {
        reject('Invalid GETVOLT response');
      }
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
 * Get version
 * @param {*} device 
 * @returns 
 */
 async function getVer(device){
  await sendCommand(device, "GETVER");
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      if (result.data.buffer.byteLength != 14) {
        reject('Invalid GETVER response');
      }
      let version = decoder.decode(result.data.buffer);
      printOut(`Version: ${version}`);
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
      if (result.data.buffer.byteLength != 512) {
        reject('Invalid GETCFG response, byteLength: '+result.data.buffer.byteLength);
      }
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
 * Power ON
 * @param {*} device 
 * @returns 
 */
 async function powerON(device){
  await sendCommand(device, "POWERON");
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
 * Reboot unit
 * @param {*} device 
 * @returns 
 */
 async function reboot(device){
  await sendCommand(device, "REBOOT");
}

/**
 * Turn on the GQ GMC heartbeat
 * @param {*} device 
 * @returns 
 */
 async function heartbeat1(device){
  heartbeatIsON = true;
  await sendCommand(device, "HEARTBEAT1");
}

/**
 * Turn off the GQ GMC heartbeat
 * @param {*} device 
 * @returns 
 */
 async function heartbeat0(device){
  heartbeatIsON = false;
  await sendCommand(device, "HEARTBEAT0");
}

/**
 * Turn on the speaker
 * @param {*} device 
 * @returns 
 */
 async function speaker1(device){
  await sendCommand(device, "SPEAKER1");
}

/**
 * Turn off the speaker
 * @param {*} device 
 * @returns 
 */
 async function speaker0(device){
  await sendCommand(device, "SPEAKER0");
}

/**
 * Reboot unit
 * @param {*} device 
 * @returns 
 */
 async function sendCommandText(device, command){
  await sendCommand(device, command);
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      let size = result.data.buffer.byteLength;
      let text = decoder.decode(result.data.buffer);
      printOut(`Default Reader: ${text}
      Size: ${size}`);
    }
  });
}