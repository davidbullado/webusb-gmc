

var RootComponent = {
    data() {
        return {
            methods: {
                'Power ON': () => powerON(device),
                'Power OFF': () => powerOFF(device),
                'Reboot': () => powerOFF(device),
                'Heartbeat ON': () =>heartbeat1(device),
                'Heartbeat OFF': () =>heartbeat0(device),
                'Get Serial': () => getSerial(device),
                'Get Version': () => getVer(device),
                'Get Voltage': () => getVolt(device),
                'Get Temperature': () => getTemp(device),
                'Set DateTime': () => setDateTime(device),
                'Get DateTime': () => getDateTime(device),
                'Get Gyro': () => getGyro(device),
                'Get CPM': () => getCPM(device),
                'Get CPS': () => getCPS(device),
                'Get Config': () => getCfg(device),
                'Speaker ON': () => speaker1(device),
                'Speaker OFF': () => speaker0(device),
                'ReadMemory': () =>readMemory(),
            },
            userCommand: '',
            spirLength: 512,
            spirAddr: 0,
            errorMessage: '',
        }
    },
    mounted:function () {
        printOut = (str) => {
            this.$refs.dlg.innerText = str;
        },
        printOutCPS = (str) => {
            this.$refs.cps.innerText = str;
        }
    },
    methods:{
        sendCommand: function (userCommand) {
            sendCommand(device, userCommand);
        },
        sendCommandText: function (userCommand) {
            sendCommandText(device, userCommand);
        },
        sendCommandParam: function (userCommand, userParam) {
            p = JSON.parse('['+userParam+']');
            sendCommandParam(device, userCommand, p);
        },
        spir: function (address, dataLength) {
            spir(device, address, dataLength);
        },
        spir_all_vue: async function () {
            res = await spir_all(device);
            this.downloadFile(res);
        },
        downloadFile: function (bits) {
            const file = new Blob([bits], {type: 'application/octet-stream'});
            // Create a link and set the URL using `createObjectURL`
            const link = document.createElement("a");
            link.style.display = "none";
            link.href = URL.createObjectURL(file);
            link.download = file.name;
            
            // It needs to be added to the DOM so it can be clicked
            document.body.appendChild(link);
            link.click();
        },
        initGmc: async function () {
            try {
                this.errorMessage = '';
                await initUsb()
            } catch (error) {
                this.errorMessage = error;
            }
        }
        /*startAnimation: function() {
            if (!IS_RUNNING){
                IS_RUNNING = true;
                startTheMagic();
            }
        },*/
    },
    watch:{
        /*transparency(newValue) {
            this.$constants.ALPHA = (100 - newValue) / 100;
        },*/
    }
}
var app = Vue.createApp(RootComponent);
//CST = Vue.reactive(CST);
//app.config.globalProperties.$constants = CST;
var vm = app.mount("#main");