

var RootComponent = {
    data() {
        return {
            methods:{
                'Power ON': () => powerON(device),
                'Power OFF': () => powerOFF(device),
                'Reboot': () => powerOFF(device),
                'Heartbeat ON': () =>heartbeat1(device),
                'Heartbeat OFF': () =>heartbeat0(device),
                'Get Serial': () => getSerial(device),
                'Get Voltage': () => getVolt(device),
                'Get Temperature': () => getTemp(device),
                'Get DateTime': () => getDateTime(device),
                'getGyro': () => getGyro(device),
                'getCPM': () => getCPM(device),
                'getCfg': () => getCfg(device),
            },
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