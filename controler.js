

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
                'getGyro': () => getGyro(device),
                'getCPM': () => getCPM(device),
                'getCfg': () => getCfg(device),
            },
            userCommand: '',
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