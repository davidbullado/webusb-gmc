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

need256bytes = 0;


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

function transfertIn() {
  // Some commands needs to wait for precisely 256 bytes
  if (need256bytes > 0){
    length = need256bytes;
    need256bytes = 0;
  } else { // Defaut case, wait for 512
    length = 512;
  }
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
    transfertIn();
  });
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
  transfertIn();
  transfertIn();
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

async function requestNBytes(bytes) {
    // Request a 256 bytes length response
    need256bytes = bytes;
    // Call two dummy commands
    await dummyCommand(device);
    await dummyCommand(device);
}

async function sendCommand(device, cmd, size=512) {
  if (size != 512){
    await requestNBytes(size);
  }
  console.debug(`send command ${cmd}`);
  const data = encoder.encode(`<${cmd}>>`);
  res = await device.transferOut(2,data);
  console.debug(`send response: ${res}`);
}

async function sendCommandParam(device, cmd, param, size=512) {
  if (size != 512){
    await requestNBytes(size);
  }
  console.debug(`send command ${cmd}`);
  const dataStart = encoder.encode(`<${cmd}`);
  const dataParam = new Uint8Array(param);
  console.debug(`send params: ${dataParam}`);
  const dataEnd = encoder.encode(`>>`);
  const data = new Uint8Array([ ...dataStart, ...dataParam, ...dataEnd ]);
  res = await device.transferOut(2,data);
  console.debug(`send response: ${res}`);
}

/**
 * Get year date and time
 * @param {*} device 
 * @returns 
 */
 async function dummyCommand(device){
  cmd = "GETDATETIME";
  console.debug(`send dummy command ${cmd}`);
  const data = encoder.encode(`<${cmd}>>`);
  res = await device.transferOut(2,data);
  console.debug(`send dummy response: ${res}`);

  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      [yy, mm, dd, hh, mi, ss, check] = new Uint8Array(result.data.buffer);
      if (check !== 0xaa) {
        reject('Invalid DUMMY response');
      }
      console.log(`Dummy time: ${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`);
      resolve();
    }
  });
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

  // Send the query
  await sendCommand(device, "GETCFG", 256);
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      if (result.data.buffer.byteLength != 256) {
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
 * Send command and expect text
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


/**
 * Send command with data as Uint8Array
 * @param {*} device 
 * @returns 

 async function sendCommandText(device, command, data){
  await sendCommandParam(device, command, data);
}*/


/**
 * SPIR
 * @param {*} device 
 * @returns 
 */
 async function spir(device, address, dataLength){
 
  const addr = new DataView(new ArrayBuffer(4)); // 3*8 bits
  const dl = new DataView(new ArrayBuffer(2)); // 16 bits

  addr.setUint32(0, address);
  dl.setUint16(0, dataLength-1);

  const data = [...new Uint8Array(addr.buffer.slice(1)), ...new Uint8Array(dl.buffer)];

  await sendCommandParam(device, "SPIR", data, dataLength);
  
  return new Promise ((resolve, reject) => {
    resultReader = (result) => {
      if (result.data.buffer.byteLength != dataLength) {
        reject('Invalid SPIR response, byteLength: '+result.data.buffer.byteLength);
      }
      r = btoa(String.fromCharCode.apply(null, new Uint8Array(result.data.buffer)));
      printOut(`spir: ${r}`);
      resolve(new Uint8Array(result.data.buffer));
    }
  });
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function spir_all(device) {
  let address = 0;
  const m = new Uint8Array(65536);
  for(i=0; i<105; i++) {
    r = await spir(device, address, 512);
    await sleep(100);
    m.set(r, address);
    address += 512;
  }
  return m;
}


function findDataTrames(buffer) {
  const d = new DataView(buffer);
  const l = d.byteLength - 10;
  const pos = [];
  for (let i=0; i < l; i+=2){
    let r = d.getUint16(i) ^ 0x55AA || d.getUint8(i+2) ^ 0x00 || d.getUint8(i+9) ^ 0x55 || d.getUint16(i+10) ^ 0xAA01;
    if (!r) {
      pos.push(i);
      //readTimestampFromMemory(buffer, i);
    }
  }
  return pos;
}

const decodeFreq = {0:'off', 1:'cps', 2:'cpm', 3:'cpm/h'};
const decodeFreqDelta = {0:0, 1:1000, 2:1000*60, 3:1000*60*60};

function readTimestampFromMemory(buffer, pos) {
  // 55AA 00YY MMDD HHMM SS55 AADD
  const d = new DataView(buffer, pos, 12);
  let year = 2000 + d.getUint8(3);
  let month = d.getUint8(4) - 1;
  let day = d.getUint8(5);
  let hour = d.getUint8(6);
  let min = d.getUint8(7);
  let sec = d.getUint8(8);
  let freq = d.getUint8(11);
  dt = new Date(year, month, day, hour, min, sec);

  //console.log(pos, pos.toString(16), decodeFreq[freq], dt);
  return [dt, freq, 12];
}


function findAscii(d) {
  let start = 0;
  let end = 0 + d.byteLength;
  let strings = [];
  let currentTime = new Date();
  let incrementTime = 0;
  let unit = '';
  let measurements = [];
  let timestamps = [];
  let units = [];
  for (let i=start; i < end; i++){
    console.log("Current pos: "+i)
    let tagStart = !(d.getUint8(i) ^ 0x55 || d.getUint8(i+1) ^ 0xAA );
    if (tagStart){
      let tagType = d.getUint8(i+2);
      switch (tagType) {
        case 0x00:
          console.log("found timestamp");
          let [t, freq, jmp2] = readTimestampFromMemory(d.buffer, d.byteOffset+i);
          currentTime = t;
          incrementTime = decodeFreqDelta[freq];
          unit = decodeFreq[freq];
          console.log(t);
          console.log(unit);
          i += jmp2-1;
          break;
        case 0x01:
          console.log("found 01");
          let twobyte = d.getUint16(i+3);
          console.log("twobyte: "+twobyte);
          i+= 4;
          break;
        case 0x02:
          let [txt, jmp] = readAscii(d, i);
          strings.push(txt);
          console.log("found "+txt);
          console.log("from "+i+" jump "+jmp);
          i += jmp-1;
          break;
        default:
          console.log("other: "+tagType);
      }
    } else {
      currentTime = new Date(currentTime.getTime() + incrementTime);
      let value = d.getUint8(i);
      console.log("value: "+d.getUint8(i), currentTime);
      measurements.push(value);
      timestamps.push(currentTime);
      units.push(unit);
    }
  }
  return {strings, measurements, timestamps, units};
}

function readAscii(d, pos) {
  let absolutepos = d.byteOffset+pos;
  let length = d.getUint8(pos+3);
  let startpos = absolutepos+4;
  let end = startpos+length;
  let buf = d.buffer.slice(startpos,end);
  let txt = decoder.decode( buf ); 
  return [txt, end-absolutepos];
}


async function readMemory() {

  return fetch('/memory_dump.bin')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error, status = ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((buffer) => {
      const tramesPos = findDataTrames(buffer);
      let dataTrames = detectSessions(tramesPos, buffer);
      return dataTrames.map(t => blocks(t.pos, buffer));
      for (t of dataTrames) {
         return blocks(t.pos, buffer)
      }
      //return dataTrames;
    });
}


function detectSessions(data, buffer) {
  // Given this context
  initCtx = (ctx) => {
    ctx.dataTrames = [];
    ctx.curTrame = null;
  };
  // Do those operations
  operations = (ctx, x) => {
    y = {};
    [y.t, y.freq] = readTimestampFromMemory(buffer, x);
    y.pos = x;
    return y;
  };
  // If a new group is detected
  isnew = (ctx, yCur, yPrev) => {
    const delta = yCur.t - yPrev.t;
    return delta > 181000 || delta < 0;
  }
  // Initiate a new group
  firstElementCallback = (ctx, y) => {
    ctx.curTrame = {};
    ctx.curTrame.pos = [];
    ctx.curTrame.start = y;
  };
  // For each element
  eachElementCallback = function (ctx, y) {
    ctx.curTrame.pos.push(y);
  };
  // Close the previous group
  lastElementCallback = function (ctx, y) {
    ctx.curTrame.end = y;
    //ctx.curTrame.buf = new DataView(buffer, ctx.curTrame.start.pos, y.pos-ctx.curTrame.start.pos);
    ctx.dataTrames.push(ctx.curTrame);
  };
  // Finalize the results 
  closeCtx = (ctx) => {
    return ctx.dataTrames;
  };
  
  return forGroups(data, initCtx, operations, isnew, eachElementCallback, firstElementCallback, lastElementCallback, closeCtx);
}

function blocks(positions, buffer) {
  // Given this context
  initCtx = (ctx) => {
    ctx.agg = {ascii:null, measurements: [], timestamps: [], units: []};
  };
  // Do those operations
  operations = (ctx, x) => {
    return x;
  };
  // Compare previous and current record
  compare = (ctx, yCur, yPrev) => {
    let blockLength = yCur.pos - yPrev.pos;
    let d = new DataView(buffer, yPrev.pos, blockLength);
    let block = {};
    try {
      ({ascii, measurements, timestamps, units}  = findAscii(d));
      ctx.agg.ascii = ascii;
      ctx.agg.measurements.push(...measurements);
      ctx.agg.timestamps.push(...timestamps);
      ctx.agg.units.push(...units);
    } catch (e) {

    }
    yPrev.blockLength = blockLength;
    
    return false;
  };
  // Finalize the results 
  closeCtx = (ctx) => {
    return ctx.agg;
  };

  return forByTwoElements(positions, initCtx, operations, compare, closeCtx);
}



function forGroups(data, initCtx, operations, isnew, eachElementCallback, firstElementCallback, lastElementCallback, closeCtx) {
  const ctx = {}; initCtx(ctx);
  let current = operations(ctx, data[0]);
  let previous = current;
  firstElementCallback(ctx,current);
  eachElementCallback(ctx, current);
  for (x of data.slice(1)){
    current = operations(ctx, x);
    if (isnew(ctx, current, previous)){
      lastElementCallback(ctx, previous)
      firstElementCallback(ctx, current);
    }
    eachElementCallback(ctx, current);
    previous = current;
  }
  lastElementCallback(ctx,current);
  return closeCtx(ctx);
}

function forByTwoElements (data, initCtx, operations, compare, closeCtx) {
  const ctx = {}; initCtx(ctx);
  let current = operations(ctx, data[0]);
  let previous = current;
  for (x of data.slice(1)){
    current = operations(ctx, x);
    compare(ctx, current, previous);
    previous = current;
  }
  return closeCtx(ctx);
}



// IdÃ©e : charger par exemple 1000 byte. Lire les premiers blocks, dÃ©terminer la length L.
// Ensuite faire des sauts de L bytes, vÃ©rifier si on est sur des bons block.
// Si non, recommencer l'algo Ã  partir de la derniÃ¨re position vÃ©rifiÃ©e.
// Obtient une liste de positions.
