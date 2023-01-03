

var RootComponent = {
    data() {
        return {
            methods: {
                'Power ON': () => usbLib.powerON(),
                'Power OFF': () => usbLib.powerOFF(),
                'Reboot': () => usbLib.powerOFF(),
                'Heartbeat ON': () => usbLib.heartbeat1(),
                'Heartbeat OFF': () => usbLib.heartbeat0(),
                'Get Serial': () => usbLib.getSerial(),
                'Get Version': () => usbLib.getVer(),
                'Get Voltage': () => usbLib.getVolt(),
                'Get Temperature': () => usbLib.getTemp(),
                'Set DateTime': () => usbLib.setDateTime(),
                'Get DateTime': () => usbLib.getDateTime(),
                'Get Gyro': () => usbLib.getGyro(),
                'Get CPM': () => usbLib.getCPM(),
                'Get CPS': () => usbLib.getCPS(),
                'Get Config': () => usbLib.getCfg(),
                'Get Config Object': () => usbLib.getConfigObject(),
                'Speaker ON': () => usbLib.speaker1(),
                'Speaker OFF': () => usbLib.speaker0(),
                'ReadMemory': () => usbLib.readMemory(),
            },
            userCommand: '',
            spirLength: 512,
            spirAddr: 0,
            errorMessage: '',
        }
    },
    mounted:function () {
        usbLib.printOut = (str) => {
            this.$refs.dlg.innerText = str;
        },
            usbLib.printOutCPS = (str) => {
            this.$refs.cps.innerText = str;
        }
        google.charts.load('current', {packages: ['corechart', 'line']});
        //google.charts.setOnLoadCallback(this.showGraphGoogle);
    },
    methods:{
        sendCommand: function (userCommand) {
            usbLib.sendCommand(userCommand);
        },
        sendCommandText: function (userCommand) {
            usbLib.sendCommandText( userCommand);
        },
        sendCommandParam: function (userCommand, userParam) {
            p = JSON.parse('['+userParam+']');
            usbLib.sendCommandParam( userCommand, p);
        },
        spir: function (address, dataLength) {
            usbLib.spir( address, dataLength);
        },
        spir_all_vue: async function () {
            res = await usbLib.spir_all();
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
                await usbLib.initUsb()
            } catch (error) {
                this.errorMessage = error;
            }
        },
        showGraph: async function () {
            data = await usbLib.readMemory();
            const nth = 30;
            const cpsValues = data.measurements.slice(0,nth);
            const timestamps = data.timestamps.slice(0,nth);
            const ctx = document.getElementById('canvas-cps').getContext('2d');
            const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [{
                    label: 'Radioactivity (CPS)',
                    data: cpsValues,
                    fill: false,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                scales: {
                    xAxes: [{
                        ticks: {
                            maxTicksLimit: 10
                        }
                        }],
                    yAxes: [{
                        ticks: {
                        beginAtZero: true
                        }
                    }]
                }
            }
            });
        },
        showGraphGoogle: async function () {
            var data = new google.visualization.DataTable();
            data.addColumn('date', 'X');
            data.addColumn('number', 'Radioactivity (CPS)');

            dataMems = await usbLib.readMemory();
            dataMem = dataMems[0];

            const cpsValues = dataMem.measurements;
            const timestamps = dataMem.timestamps;

            const merged = timestamps.map((x, i) => [x, cpsValues[i]]);
            const aggregatedData = {};

            merged.forEach(datum => {
              const minuteTimestamp = Math.floor(datum[0].getTime() / 60000) * 60000;
              if (!aggregatedData[minuteTimestamp]) {
                aggregatedData[minuteTimestamp] = 0;
              }
              aggregatedData[minuteTimestamp] += datum[1];
            });
            res = Object.entries(aggregatedData).map(([key, value]) => [new Date(Number(key)), value]);

            data.addRows(res);
            var options = {
              hAxis: {
                title: 'Time'
              },
              vAxis: {
                title: 'Radioactivity'
              },
              colors: ['#a52714'],
            };
      
            var chart = new google.visualization.LineChart(document.getElementById('chart_div'));
            chart.draw(data, options);
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