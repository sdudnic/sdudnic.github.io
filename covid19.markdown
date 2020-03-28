---
layout: page
title: Coronavirus cases evolution in last 7 days in France
permalink: /covid-19/
---

<html>

<head>
    <!--Load the AJAX API-->
    <script type="text/javascript" src="https://code.jquery.com/jquery-2.2.4.min.js"></script>
    <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
    <script type="text/javascript">

        var settings = {
            "async": true,
            "crossDomain": true,
            "url": "https://covid-19-coronavirus-statistics.p.rapidapi.com/v1/stats?country=France",
            "method": "GET",
            "headers": {
                "x-rapidapi-host": "covid-19-coronavirus-statistics.p.rapidapi.com",
                "x-rapidapi-key": "947bb4b211msh8eec36febfc74aep15de04jsn7439704837ab"
            }
        }

        $.ajax(settings).done(function (response) {
            console.log(response);
        });

        const daysNumber = 7;

        var startDate = new Date(Date.now());
        startDate.setDate(startDate.getDate() - daysNumber);

        var url = {
            "confirmed": "https://api.covid19api.com/total/country/france/status/confirmed",
            "deaths": "https://api.covid19api.com/total/country/france/status/deaths",
            "recovered": "https://api.covid19api.com/total/country/france/status/recovered",
        };

        var data = {};

        // Load the Visualization API and the corechart package.
        google.charts.load('current', { 'packages': ['corechart'] });

        // Set a callback to run when the Google Visualization API is loaded.
        google.charts.setOnLoadCallback(drawChart);

        function getConfirmed() {
            return $.get(url.confirmed);
        }

        function getRecovered(confirmed) {
            confirmed = confirmed.slice(Math.max(confirmed.length - daysNumber, 0));
            for (const item of confirmed) {
                var theDate = new Date(Date.parse(item.Date));
                data.addRow([theDate, item.Cases, 0, 0]);
            }
            return $.get(url.recovered);
        }

        function getDeaths(recovered) {
            var row = 0;
            recovered = recovered.slice(Math.max(recovered.length - daysNumber, 0));
            for (const item of recovered) {
                data.setCell(row, 2, item.Cases);
                row++;
            }
            return $.get(url.deaths);
        }

        function finalize(deaths) {
            var row = 0;
            deaths = deaths.slice(Math.max(deaths.length - daysNumber, 0));
            for (const item of deaths) {
                data.setCell(row, 3, item.Cases);
                row++;
            }

            // Set chart options
            var options = {
                title: 'COVID-19 cases in France in the last ' + daysNumber + ' days',
                curveType: 'function',
                legend: { position: 'bottom' },
                colors: ['blue', 'green', 'red'],
            };

            // Instantiate and draw our chart, passing in some options.
            var chart = new google.visualization.LineChart(document.getElementById('curve_chart'));
            chart.draw(data, options);
        }

        // Callback that creates and populates a data table,
        // instantiates the pie chart, passes in the data and
        // draws it.
        function drawChart() {
            data = new google.visualization.DataTable();

            data.addColumn("datetime", "Date");
            data.addColumn("number", "Confirmed");
            data.addColumn("number", "Recovered");
            data.addColumn("number", "Deaths");
            var formatter = new google.visualization.DateFormat({ formatType: 'short', pattern: 'dd/MM/yy' });
            formatter.format(data, 0);

            getConfirmed().then(getRecovered).then(getDeaths).then(finalize);
        }
    </script>

</head>

<body>
    <!--Div that will hold the pie chart-->
    <div id="curve_chart" style="width: 900px; height: 500px"></div>
</body>

</html>
