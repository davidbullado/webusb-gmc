

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
        google.charts.load('current', {packages: ['corechart', 'line']});
        //google.charts.setOnLoadCallback(this.showGraphGoogle);
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
        },
        showGraph: async function () {
            data = await readMemory();
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

            dataMems = await readMemory();
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