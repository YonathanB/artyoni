/**
 * Created by yonathanbenitah on 3/27/16.
 */

var app = angular.module('loto', [])
	.factory('lottoService', function ($http, $http, $q) {

		// Properties of CSV file & meaning that a number occures
		var validOccurence = ['1', '2', '3', '4', '5', '6', 'addNbr'];

		// Year from the CSV file are yy we want to display yyyy
		var currentYear = new Date().getFullYear();
		var currentYearSuffix = parseInt(currentYear.toString().substr(2, 4));
		var currentYearPrefix = parseInt(currentYear.toString().substr(0, 2));

		// When receive the data, we will reformat it a way it will be easier to manipulate it for our front app
		var formattedLottoData = {};
		/* formattedLottoData as follow:
		 *
		 *  1:{
		 *       1996: 5,       // occurence of number 1 in 1996
		 *       1997: 6,       // occurence of number 1 in 1997
		 *       ...
		 *    },
		 *  2: {
		 *       1996: 8,       // occurence of number 2 in 1996
		 *       1997: 35,      // occurence of number 2 in 1997
		 *       ...
		 *     },...
		 *
		 * */


		// Get data from server
		return {

			getLottoResults: function () {
				var defer = $q.defer();
				$http.get('http://artyoni.net/api', {})
					.success(function (response) {

						// starts the loop from last value to get the oldest lottery first
						for (var i = response.data.length - 1; i > 0; i--) {

							// the csv date format is as follow: dd/mm/yy, we want only the year
							var year = response.data[i]['date'].split('/')[2];

							// we also want the year to be YYYY
							if (parseInt(year) > currentYearSuffix)
								year = (currentYearPrefix - 1) + year;
							else
								year = currentYearPrefix + year;


							for (var prop in validOccurence) {
								if (response.data[i][validOccurence[prop]] > 0 && response.data[i][validOccurence[prop]] < 38) {// Check if Number is valid
									var lottoNmbr = response.data[i][validOccurence[prop]];

									if (typeof formattedLottoData[lottoNmbr] == 'undefined' || typeof formattedLottoData[lottoNmbr][year] == 'undefined') {
										if (typeof formattedLottoData[lottoNmbr] == 'undefined')
											formattedLottoData[lottoNmbr] = {};
										//if (typeof formattedLottoData[lottoNmbr][year] == 'undefined')
										formattedLottoData[lottoNmbr][year] = 1;
									}
									else
										++formattedLottoData[lottoNmbr][year];
								}
							}
						}

						defer.resolve(formattedLottoData);
					})
					.error(function (response) {
						defer.reject(response)
						console.log(response.data);
					});
				return defer.promise;
			}
		};
	})

	.controller('mainCtrl', function ($rootScope, $scope, lottoService, $timeout) {

		$scope.displayChart = ['pie', 'bar']; // charts we want to display in the screen

		$scope.dataLoaded = false; // UI variable

		loadData = function () {
			$scope.loading = true; // UI variable

			// call service to fetch the data
			lottoService.getLottoResults()
				.then(function (formattedData) {
					$scope.dataLoaded = true;
					$scope.loading = false;
					$scope.data = formattedData;
				},
				function (error) {
					console.log('error!')
				});
		}

		$scope.updateData = function () {
			loadData();
		};
		loadData();

		setInterval(function () {
			loadData(); // fetch data every 5 minutes
		}, 1000 * 60 * 5);
	})

	.directive('lottoGraph', function (lottoService) {

		var dataCopy = null; // We keep a copy of the data in the directive

		//  Directive's Model
		var LottoGraph = function (domElement, graphType) {

			this.element = domElement.find('.lotto-chart');
			this.graphType = graphType;
			this.chart = (graphType === 'pie') ? initPie(this.element[0]) : initBar(this.element[0]);

			/*
			 UpdateFilter has 4 parameters
			 - type: Witch filter has been activated (byYear or byNumber)
			 - value:  lotto number's or year (27 or 1998)
			 - filter: the scope filters
			 - state: 'add' to activate filter, 'remove' to switch off
			 */
			this.updateFilter = function (type, value, filters, state) {
				switch (type) {
					case 'byYear':
						this.draw(filters);
						break;

					case 'byNumber':
						if (this.graphType == 'pie') {
							if (state == 'add')
								this.chart.get(value).setVisible(false);
							else
								this.chart.get(value).setVisible(true);
						}
						else if (this.graphType == 'bar') {
							if (state == 'add')
								this.chart.get(value).hide();
							else
								this.chart.get(value).show();
						}
						break;
				}

			};

			this.draw = function (filters) {

				for (var lottoNumber in dataCopy) {

					var sum = 0;
					var myData = {total: [], detail: []};
					for (var year in dataCopy[lottoNumber]) {
						if (filters["byYear"].indexOf(year) == -1) {
							if (this.graphType === 'bar')
								myData.detail.push({i: year, name: year, y: dataCopy[lottoNumber][year]})
							sum += dataCopy[lottoNumber][year];
						}
					}
					myData.total.push(sum);

					if (this.graphType === 'bar') {
						this.chart.get(parseInt(lottoNumber)).update({data: myData.detail}, false);
					}
					if (this.graphType === 'pie') {
						this.chart.get(parseInt(lottoNumber)).update(myData.total, false);
					}
				}
				this.chart.redraw();
			};
		};

		var initPie = function (element) {
			var data = [];
			for (var i = 1; i < 38; i++) {
				data.push({id: i, name: i, y: 0})
			}
			return new Highcharts.Chart({
				chart: {
					renderTo: element,
					plotBackgroundColor: null,
					plotBorderWidth: null,
					plotShadow: false,
					type: 'pie'
				},
				title: {
					text: 'התפלגות המספרים הכללית'
				},
				tooltip: {
					useHTML: true,
					headerFormat: '<p style="direction: rtl; text-align: right">{point.key} הופיע {point.y} פעמיים </p>',
					pointFormat: ''//<p style="direction: rtl; text-align: right"><b>אחוז הופע בס״כ: '+ (Math.round(this.point.percentage * 100)/100).toFixed(2) +'<b/>%</p>'
				},
				plotOptions: {
					pie: {
						allowPointSelect: true,
						cursor: 'pointer',
						dataLabels: {
							enabled: true,
							formatter: function () {
								return '<span style="text-align: right">מספר ' + this.point.name + ': <b> ' + (Math.round(this.percentage * 100) / 100).toFixed(2) + '%</b>';

							},
							style: {
								color: (Highcharts.theme && Highcharts.theme.contrastTextColor) || 'black'
							}
						}
					}
				},
				series: [{
					data: data
				}]
			});
		};
		var initBar = function (element) {
			var series = [];
			for (var i = 1; i < 38; i++) {
				series.push({id: i, name: i, data: []})
			}
			return new Highcharts.Chart({
				chart: {
					type: 'bar',
					renderTo: element,
				},

				scrollbar: {
					enabled: true
				},
				xAxis: {
					id: 'barAxis',
					type: 'category',
					max: 0,
					startOnTick: true
				},
				yAxis: {
					//min: 0,
					title: {
						text: 'הופעה',
						align: 'high'
					},
					labels: {
						overflow: 'justify'
					}
				},
				plotOptions: {
					series: {
						pointPadding: 0.5,
						pointWidth: 3,
						groupPadding: 1
					}
				},
				legend: {
					enabled: false
				},
				title: {
					text: 'התפלגות המספרים לפי שנים'
				},
				series: series
			});
		};


		return {
			restrict: 'E',
			templateUrl: '/intel/view/graph.html',
			link: function (scope, $elem, attr) {

				scope.loading = true;
				// instanciate our graph
				scope.myLottoGraph = new LottoGraph($elem, attr.chartType);

				// Watch for data in mainController
				scope.$watch('data', function (dataObj) {
					if (typeof dataObj !== 'undefined' && dataObj) {
						dataCopy = angular.copy(dataObj);
						scope.years = Object.keys(dataCopy[1]);
						scope.loading = false
						scope.myLottoGraph.draw(scope.filters);
					}
				});

				scope.filters = {
					byYear: [],
					byNumber: []
				}


				// when a filter his added/removed
				scope.updateFilter = function (type, value) {
					// check if we need to activate the filter or to remove it
					var filterIndex = scope.filters[type].indexOf(value);
					var state = null;
					if (filterIndex === -1) {
						scope.filters[type].push(value);
						state = 'add';
					}
					else {
						scope.filters[type].splice(filterIndex, 1);
						state = 'remove';
					}
					scope.myLottoGraph.updateFilter(type, value, scope.filters, state);
				}
			}
		};
	})

	// Simple directive to inform user data is loading
	.directive('loading', function () {
		return {
			template: '<div><div ng-show="loading" class="loading-container"></div><div ng-hide="loading" ng-transclude></div></div>',
			restrict: 'A',
			transclude: true,
			replace: true,
			scope: {
				loading: "=loading"
			},
			compile: function compile(element, attrs, transclude) {
				var spinner = new Spinner().spin();
				var loadingContainer = element.find(".loading-container")[0];
				loadingContainer.appendChild(spinner.el);
			}
		};
	})



