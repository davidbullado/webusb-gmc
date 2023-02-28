const usbLib = {
    device: undefined /* as USBDevice */,
    resultReader: async () => {
    },
    defaultReader: async (result) => {
        let size = result.data.buffer.byteLength;
        let hex = usbLib.buf2hex(new Uint8Array(result.data.buffer));
        await usbLib.printOut(`Default Reader: hex=${hex}
    Size: ${size}`);
    },
    cpsReader: async (result) => {
        const cpm = 0x3FFF & result.data.getUint16();
        await usbLib.printOutCPS(cpm);
    },
    heartbeatIsON: false,
    printOut: async (str) => {
        console.log(str);
    },
    printOutCPS: async (str) => {
        console.log(str);
    },
    buf2hex: (buffer) => {
        return [...buffer]
            .map(x => x.toString(16)
                .padStart(2, '0'))
            .join('');
    },
    initUsb: async function () {
        this.device = await navigator.usb.requestDevice({filters: [{vendorId: 0x1A86}]});
        console.log(this.device.productName);
        await this.configureCH341(this.device);

        return true;
    },
    stopUsb: async function () {
        await this.device.close();
    },
    usb: async function () {
        try {
            this.device = await navigator.usb.requestDevice({filters: [{vendorId: 0x1A86}]});
            console.log(this.device.productName);

            await this.configureCH341();

            await this.getVolt();
            await this.getTemp();
            //await setDateTime(device);
            await this.getDateTime();
            await this.getGyro();
            await this.getCPM();
            await this.getCfg();

            await new Promise(r => setTimeout(r, 10000));
            await this.device.close();
        } catch (error) {
            console.error(error);
        }
    },
    need256bytes: 0,
    transfertIn: async function () {
        // Defaut case, wait for 512
        let length = 512;
        // Some commands needs to wait for precisely 256 bytes
        if (this.need256bytes > 0) {
            length = this.need256bytes;
            this.need256bytes = 0;
        }
        const result = await this.device.transferIn(2, length);
        //console.debug(result);
        // As soon as the result has been read, start a new listener
        this.transfertIn();

        const isCPS = result.data.byteLength === 2 && (result.data.getUint8(0) & 0b1100_0000) === 0b1000_0000;
        if (isCPS) {
            await this.cpsReader(result);
        } else if (usbLib.resultReader != null) {
            await this.resultReader(result);
        } else if (!usbLib.startListening) {
            console.debug("Read using default reader");
            // Read with default debuging reader
            await this.defaultReader(result);
        }
        this.resultReader = null;
    },
    configureCH341: async function () {
        try {
            await this.device.open();
        } catch (e) {
            throw {
                name:        "ConfigError",
                message:     "Failed to open the device. Please setup the device first.",
            };
        }

        await this.device.selectConfiguration(1);
        const config = this.device.configuration;
        if (config) {
            console.log(`La configuration a été sélectionnée : ${config.configurationValue}`);
        } else {
            console.log("La configuration n'a pas pu être sélectionnée.");
        }
        const interf = config.interfaces[0];
        if (interf.claimed) {
            console.log("L'interface a déjà été claimée.");
        } else {
            console.log("L'interface n'a pas encore été claimée.");
        }
        if (interf.active) {
            console.log("L'interface est actuellement utilisée par une autre application.");
        } else {
            console.log("L'interface n'est pas utilisée par une autre application.");
        }
        await this.device.claimInterface(interf.interfaceNumber);

        // SET BAUDRATE
        let res = await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: 0x9a, // CH341_REQ_WRITE_REG
            value: 0x1312,
            index: 0x9883 // Baud rate?
        });
        console.debug(res);
        res = await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: 0x9a, // CH341_REQ_WRITE_REG
            value: 0x2518,
            index: 0x00c3 // Baud rate?
        });
        console.debug(res);
        // SET HANDSHAKE
        res = await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: 0xa4, // CH341_REQ_MODEM_CTRL
            value: 0xff9f,
            index: 0x0000
        });
        console.debug(res);
        // GET STATUS
        res = await this.device.controlTransferIn({
            requestType: 'vendor',
            recipient: 'device',
            request: 0x95, // CH341_REQ_READ_REG
            value: 0x0706,
            index: 0x0000
        }, 2);
        console.debug(res);



        this.startListening = true;
        this.transfertIn();
        this.transfertIn();
        this.startListening = false;

        res = await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: 164,
            value: 0xff9f,
            index: 0x0000
        });
        console.debug(res);
    },
    decoder: new TextDecoder('ascii'),
    encoder: new TextEncoder(),
    requestNBytes: async function (bytes) {
        // Request a 256 bytes length response
        this.need256bytes = bytes;
        // Call two dummy commands
        await this.dummyCommand();
        await this.dummyCommand();
    },
    sendCommand: async function (cmd, size = 512) {
        if (size != 512) {
            await this.requestNBytes(size);
        }
        //console.debug(`send command ${cmd}`);
        const data = this.encoder.encode(`<${cmd}>>`);
        const res = await this.device.transferOut(2, data);
        //console.debug(`send response: ${res}`);
    },
    sendCommandParam: async function (cmd, param, size = 512) {
        if (size != 512) {
            await this.requestNBytes(size);
        }
        //console.debug(`send command ${cmd}`);
        const dataStart = this.encoder.encode(`<${cmd}`);
        const dataParam = new Uint8Array(param);
        //console.debug(`send params: ${dataParam}`);
        const dataEnd = this.encoder.encode(`>>`);
        const data = new Uint8Array([...dataStart, ...dataParam, ...dataEnd]);
        const res = await this.device.transferOut(2, data);
        //console.debug(`send response: ${res}`);
    },
    /**
     * Get year date and time
     * @param {*} device
     * @returns
     */
    dummyCommand: async function () {

        const cmd = "GETDATETIME";
        console.debug(`send dummy command ${cmd}`);
        const data = this.encoder.encode(`<${cmd}>>`);
        const res = await this.device.transferOut(2, data);
        console.debug(`send dummy response: ${res}`);

        return new Promise((resolve, reject) => {
            usbLib.resultReader = (result) => {
                [yy, mm, dd, hh, mi, ss, check] = new Uint8Array(result.data.buffer);
                if (check !== 0xaa) {
                    reject('Invalid DUMMY response');
                }
                console.log(`Dummy time: ${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`);
                resolve();
            }
        });
    },
    /**
     * Get current CPM value
     * @param {*} device
     * @returns
     */
    getCPM: async function () {
        await this.sendCommand("GETCPM");
        return new Promise((resolve, reject) => {
            usbLib.resultReader = (result) => {
                const cpm = result.data.getUint16();
                usbLib.printOut(`cpm: ${cpm}`);
                resolve(cpm);
            }
        });
    },
    /**
     * Get current CPS value
     * @param {*} device
     * @returns
     */
    getCPS: async function () {
        await this.sendCommand("GETCPS");
        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                await this.cpsReader(result);
                resolve();
            }
        });
    },
    /**
     * Get battery voltage status
     * @param {*} device
     * @returns
     */
    getVolt: async function () {
        await this.sendCommand("GETVOLT");
        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                if (result.data.buffer.byteLength != 1) {
                    reject('Invalid GETVOLT response');
                } else {
                    const volt = result.data.getUint8() / 10;
                    await usbLib.printOut(`volt: ${volt}`);
                    resolve(volt);
                }
            }
        });
    },
    /**
     * Get serial number
     * @param {*} device
     * @returns
     */
    getSerial: async function () {
        await this.sendCommand("GETSERIAL");
        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                if (result.data.buffer.byteLength !== 7) {
                    reject('Invalid GETSERIAL response');
                } else {
                    let serial = this.buf2hex(new Uint8Array(result.data.buffer));
                    await usbLib.printOut(`Serial: ${serial}`);
                    resolve(serial);
                }
            }
        });
    },
    /**
     * Get version
     * @param {*} device
     * @returns
     */
    getVer: async function () {
        await this.sendCommand("GETVER");
        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                if (result.data.buffer.byteLength !== 14) {
                    reject('Invalid GETVER response');
                } else {
                    let version = this.decoder.decode(result.data.buffer);
                    await usbLib.printOut(`Version: ${version}`);
                    resolve(version);
                }
            }
        });
    },
    /**
     * Get configuration data
     * @param {*} device
     * @returns
     */
    getCfg: async function () {

        // Send the query
        await this.sendCommand("GETCFG", 256);
        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                if (result.data.buffer.byteLength !== 256) {
                    reject('Invalid GETCFG response, byteLength: ' + result.data.buffer.byteLength);
                } else {
                    const cfgData = new Uint8Array(result.data.buffer);
                    const cfg = btoa(String.fromCharCode.apply(null, cfgData));
                    await usbLib.printOut(`cfg: ${cfg}`);
                    resolve(result.data.buffer);
                }
            }
        });
    },
    getConfigObject: async function () {
        const cfgData = await this.getCfg();
        const d = new DataView(cfgData);
        const result = {
            calibration: [
                {cpm: d.getUint16(0x08), sv: d.getFloat32(0x0a, true)},
                {cpm: d.getUint16(0x0e), sv: d.getFloat32(0x10, true)},
                {cpm: d.getUint16(0x14), sv: d.getFloat32(0x16, true)},
            ],
        };
        console.log(result);
        return result;
    },
    /**
     * Get year date and time
     * @param {*} device
     * @returns
     */
    setDateTime: async function () {
        const d = new Date();
        const yy = parseInt(d.getFullYear().toString().substring(2));
        const mm = (d.getMonth() + 1);
        const dd = d.getDate();
        const hh = d.getHours();
        const mi = d.getMinutes();
        const ss = d.getSeconds();
        await this.sendCommandParam(`SETDATETIME`, [yy, mm, dd, hh, mi, ss]);
        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                [check] = new Uint8Array(result.data.buffer);
                if (check !== 0xaa) {
                    reject('Invalid SETDATETIME response');
                } else {
                    await usbLib.printOut(`Datetime setted.`);
                    resolve();
                }
            }
        });
    },
    /**
     * Get year date and time
     * @param {*} device
     * @returns
     */
    getDateTime: async function () {
        await this.sendCommand("GETDATETIME");
        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                let [yy, mm, dd, hh, mi, ss, check] = new Uint8Array(result.data.buffer);
                if (check !== 0xaa) {
                    reject('Invalid GETDATETIME response');
                } else {
                    await usbLib.printOut(`Date time: ${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`);
                    resolve();
                }
            }
        });
    },
    /**
     * Get temperature
     * @param {*} device
     * @returns
     */
    getTemp: async function () {
        await this.sendCommand("GETTEMP");
        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                let [intTemp, decTemp, negSigne, check] = new Uint8Array(result.data.buffer);
                if (check !== 0xaa) {
                    reject('Invalid GETTEMP response');
                } else {
                    await usbLib.printOut("Temp: " + (negSigne > 0 ? "" : "-") + intTemp + "." + decTemp);
                    resolve();
                }
            }
        });
    },
    /**
     * Get gyroscope data
     * @param {*} device
     * @returns
     */
    getGyro: async function () {
        await this.sendCommand("GETGYRO");
        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                [x_msb, x_lsb, y_msb, y_lsb, z_msb, z_lsb, check] = new Uint8Array(result.data.buffer);
                if (check !== 0xaa) {
                    reject('Invalid GETGYRO response');
                } else {
                    const x = x_msb << 8 | x_lsb;
                    const y = y_msb << 8 | y_lsb;
                    const z = z_msb << 8 | z_lsb;
                    await usbLib.printOut(`Gyro: ${x}, ${y}, ${z}`);
                    resolve();
                }
            }
        });
    },
    /**
     * Power ON
     * @param {*} device
     * @returns
     */
    powerON: async function () {
        await this.sendCommand("POWERON");
    },
    /**
     * Power OFF
     * @param {*} device
     * @returns
     */
    powerOFF: async function () {
        await this.sendCommand("POWEROFF");
    },
    /**
     * Reboot unit
     * @param {*} device
     * @returns
     */
    reboot: async function () {
        await this.sendCommand("REBOOT");
    },
    /**
     * Turn on the GQ GMC heartbeat
     * @param {*} device
     * @returns
     */
    heartbeat1: async function () {
        this.heartbeatIsON = true;
        await this.sendCommand("HEARTBEAT1");
    },
    /**
     * Turn off the GQ GMC heartbeat
     * @param {*} device
     * @returns
     */
    heartbeat0: async function () {
        this.heartbeatIsON = false;
        await this.sendCommand("HEARTBEAT0");
    },
    /**
     * Turn on the speaker
     * @param {*} device
     * @returns
     */
    speaker1: async function () {
        await this.sendCommand("SPEAKER1");
    },
    /**
     * Turn off the speaker
     * @param {*} device
     * @returns
     */
    speaker0: async function () {
        await this.sendCommand("SPEAKER0");
    },
    /**
     * Send command and expect text
     * @param {*} device
     * @returns
     */
    sendCommandText: async function (command) {
        await this.sendCommand(command);
        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                const size = result.data.buffer.byteLength;
                const text = usbLib.decoder.decode(result.data.buffer);
                await usbLib.printOut(`Default Reader: ${text}
      Size: ${size}`);
            }
        });
    },
    /**
     * SPIR
     * @param {*} device
     * @returns
     */
    spir: async function (address, dataLength) {

        const addr = new DataView(new ArrayBuffer(4)); // 3*8 bits
        const dl = new DataView(new ArrayBuffer(2)); // 16 bits

        addr.setUint32(0, address);
        dl.setUint16(0, dataLength - 1);

        const data = [...new Uint8Array(addr.buffer.slice(1)), ...new Uint8Array(dl.buffer)];

        await this.sendCommandParam("SPIR", data, dataLength);

        return new Promise((resolve, reject) => {
            usbLib.resultReader = async (result) => {
                if (result.data.buffer.byteLength != dataLength) {
                    reject('Invalid SPIR response, byteLength: ' + result.data.buffer.byteLength);
                } else {
                    const r = btoa(String.fromCharCode.apply(null, new Uint8Array(result.data.buffer)));
                    await usbLib.printOut(`spir: ${r}`);
                    resolve(new Uint8Array(result.data.buffer));
                }
            }
        });
    },
    sleep: function (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    spir_all: async function () {
        let address = 0;
        const m = new Uint8Array(65536);
        for (i = 0; i < 105; i++) {
            const r = await this.spir(address, 512);
            await this.sleep(100);
            m.set(r, address);
            address += 512;
        }
        return m;
    },
    findDataTrames: function (buffer) {
        const d = new DataView(buffer);
        const l = d.byteLength - 10;
        const pos = [];
        for (let i = 0; i < l; i += 2) {
            let r = d.getUint16(i) ^ 0x55AA || d.getUint8(i + 2) ^ 0x00 || d.getUint8(i + 9) ^ 0x55 || d.getUint16(i + 10) ^ 0xAA01;
            if (!r) {
                pos.push(i);
                //readTimestampFromMemory(buffer, i);
            }
        }
        return pos;
    },
    decodeFreq: {0: 'off', 1: 'cps', 2: 'cpm', 3: 'cpm/h'},
    decodeFreqDelta: {0: 0, 1: 1000, 2: 1000 * 60, 3: 1000 * 60 * 60},
    readTimestampFromMemory: function (buffer, pos) {
        // 55AA 00YY MMDD HHMM SS55 AADD
        const d = new DataView(buffer, pos, 12);
        let year = 2000 + d.getUint8(3);
        let month = d.getUint8(4) - 1;
        let day = d.getUint8(5);
        let hour = d.getUint8(6);
        let min = d.getUint8(7);
        let sec = d.getUint8(8);
        let freq = d.getUint8(11);
        const dt = new Date(year, month, day, hour, min, sec);

        //console.log(pos, pos.toString(16), decodeFreq[freq], dt);
        return [dt, freq, 12];
    },
    findAscii: function (d) {
        let start = 0;
        let end = d.byteLength;
        let strings = [];
        let currentTime = new Date();
        let incrementTime = 0;
        let unit = '';
        let measurements = [];
        let timestamps = [];
        let units = [];
        for (let i = start; i < end; i++) {
            //console.log("Current pos: " + i)
            let tagStart = !(d.getUint8(i) ^ 0x55 || d.getUint8(i + 1) ^ 0xAA);
            if (tagStart) {
                let tagType = d.getUint8(i + 2);
                switch (tagType) {
                    case 0x00:
                        //console.log("found timestamp");
                        let [t, freq, jmp2] = this.readTimestampFromMemory(d.buffer, d.byteOffset + i);
                        currentTime = t;
                        incrementTime = this.decodeFreqDelta[freq];
                        unit = this.decodeFreq[freq];
                        //console.log(t);
                        //console.log(unit);
                        i += jmp2 - 1;
                        break;
                    case 0x01:
                        //console.log("found 01");
                        let twobyte = d.getUint16(i + 3);
                        //console.log("twobyte: " + twobyte);
                        i += 4;
                        break;
                    case 0x02:
                        let [txt, jmp] = this.readAscii(d, i);
                        strings.push(txt);
                        //console.log("found " + txt);
                        //console.log("from " + i + " jump " + jmp);
                        i += jmp - 1;
                        break;
                    default:
                        console.log("other: " + tagType);
                }
            } else {
                currentTime = new Date(currentTime.getTime() + incrementTime);
                let value = d.getUint8(i);
                //console.log("value: " + d.getUint8(i), currentTime);
                measurements.push(value);
                timestamps.push(currentTime);
                units.push(unit);
            }
        }
        return {strings, measurements, timestamps, units};
    },
    readAscii: function (d, pos) {
        let absolutepos = d.byteOffset + pos;
        let length = d.getUint8(pos + 3);
        let startpos = absolutepos + 4;
        let end = startpos + length;
        let buf = d.buffer.slice(startpos, end);
        let txt = this.decoder.decode(buf);
        return [txt, end - absolutepos];
    },
    readMemory: async function () {

        return fetch('/gqmc_7_01_24.mem')
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error, status = ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then((buffer) => {
                const tramesPos = this.findDataTrames(buffer);
                let dataTrames = this.detectSessions(tramesPos, buffer);
                let res = dataTrames.map(t => this.blocks(t.pos, buffer));
                console.log(res);
                return res;
            });
    },
    detectSessions: function (data, buffer) {
        // Given this context
        const initCtx = (ctx) => {
            ctx.dataTrames = [];
            ctx.curTrame = null;
        };
        // Do those operations
        const operations = (ctx, x) => {
            y = {};
            [y.t, y.freq] = this.readTimestampFromMemory(buffer, x);
            y.pos = x;
            return y;
        };
        // If a new group is detected
        const isnew = (ctx, yCur, yPrev) => {
            const delta = yCur.t - yPrev.t;
            return delta > 181000 || delta < 0;
        }
        // Initiate a new group
        const firstElementCallback = (ctx, y) => {
            ctx.curTrame = {};
            ctx.curTrame.pos = [];
            ctx.curTrame.start = y;
        };
        // For each element
        const eachElementCallback = function (ctx, y) {
            ctx.curTrame.pos.push(y);
        };
        // Close the previous group
        const lastElementCallback = function (ctx, y) {
            ctx.curTrame.end = y;
            //ctx.curTrame.buf = new DataView(buffer, ctx.curTrame.start.pos, y.pos-ctx.curTrame.start.pos);
            ctx.dataTrames.push(ctx.curTrame);
        };
        // Finalize the results
        const closeCtx = (ctx) => {
            return ctx.dataTrames;
        };

        return this.forGroups(data, initCtx, operations, isnew, eachElementCallback, firstElementCallback, lastElementCallback, closeCtx);
    },
    blocks: function (positions, buffer) {
        // Given this context
        const initCtx = (ctx) => {
            ctx.agg = {ascii: null, measurements: [], timestamps: [], units: []};
        };
        // Do those operations
        const operations = (ctx, x) => {
            return x;
        };
        // Compare previous and current record
        const compare = (ctx, yCur, yPrev) => {
            let blockLength = yCur.pos - yPrev.pos;
            let d = new DataView(buffer, yPrev.pos, blockLength);
            let block = {};
            try {
                ({ascii, measurements, timestamps, units} = this.findAscii(d));
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
        const closeCtx = (ctx) => {
            return ctx.agg;
        };

        return this.forByTwoElements(positions, initCtx, operations, compare, closeCtx);
    },
    forGroups: function (data, initCtx, operations, isnew, eachElementCallback, firstElementCallback, lastElementCallback, closeCtx) {
        const ctx = {};
        initCtx(ctx);
        let current = operations(ctx, data[0]);
        let previous = current;
        firstElementCallback(ctx, current);
        eachElementCallback(ctx, current);
        for (let x of data.slice(1)) {
            current = operations(ctx, x);
            if (isnew(ctx, current, previous)) {
                lastElementCallback(ctx, previous)
                firstElementCallback(ctx, current);
            }
            eachElementCallback(ctx, current);
            previous = current;
        }
        lastElementCallback(ctx, current);
        return closeCtx(ctx);
    },
    forByTwoElements: function (data, initCtx, operations, compare, closeCtx) {
        const ctx = {};
        initCtx(ctx);
        let current = operations(ctx, data[0]);
        let previous = current;
        for (let x of data.slice(1)) {
            current = operations(ctx, x);
            compare(ctx, current, previous);
            previous = current;
        }
        return closeCtx(ctx);
    }
}

if (window) {
    window.usbLib = usbLib;
}