/**
 * Created by yonathanbenitah on 1/6/16.
 */
var app = angular.module('artYoni', ['ngFacebook'])
	.config( function( $facebookProvider ) {
		$facebookProvider.setAppId('254067178113248');
		$facebookProvider.setVersion("v2.5");
	})

	.run( function( $rootScope ) {
		(function(d, s, id){
			var js, fjs = d.getElementsByTagName(s)[0];
			if (d.getElementById(id)) {return;}
			js = d.createElement(s); js.id = id;
			js.src = "//connect.facebook.net/en_US/sdk.js";
			fjs.parentNode.insertBefore(js, fjs);
		}(document, 'script', 'facebook-jssdk'));

	});
app.factory('facebookService', function($q, $facebook) {
	var albums = {};

	return {
		getArtYoniImages: function() {
			return	$facebook.api('Artyoni/albums')//502160849885632/photos
					.then(function(response){
						var promises = [];
						albums = response.data;
						for(var i = 0; i < response.data.length; i++){
							//albums.key = i;
							albums.name = response.data[i].name;
							albums.id = response.data[i].id;
							promises.push($facebook.api(response.data[i].id + '/photos?fields=name,source'));
						}
					return $q.all(promises)
						.then(function(response){
							 for(var i = 0; i < response.length; i++){
								 albums[i].images =  response[i].data;
							 }
							 return albums
						 });
					});
		}
	}
});

app.controller('MainCtrl', function($scope, facebookService){

	$scope.artYoniImages = null
	$scope.setGalleryGroup = function(index) {
		$scope.artYoniGallery = angular.copy($scope.artYoniImages)
	}
	$scope.getArtYoniImages = function() {
		facebookService.getArtYoniImages().then(function(response){
			$scope.artYoniImages =  response;
			$scope.artYoniGallery =  angular.copy(response);
		})
	}

		$scope.getArtYoniImages();
});

app.directive('artyoniGallery', function($timeout) {
	return {
		restrict: 'AE',
		transclude: true,
		//require: 'ngModel',
		//replace: false,
		scope: {
			gallery: "="
		},
		link: function(scope, elem, attrs) {

		},
		controller: function($scope){
			this.openGallery = function(album){
				$scope.gallery = true;
				//$scope.loading = true;
				$('html').css({overflow: 'hidden'});
				$scope.indexCurrentImage = 0;
				$scope.currentAlbum = album.images;
			}
			$scope.closeGallery = function(){
				$('html').css({'overflow':''});
				$scope.gallery = false;
			}
			$scope.nextImage = function(){
				$scope.indexCurrentImage = ($scope.indexCurrentImage + 1)%$scope.currentAlbum.length;
			}
			$scope.prevImage = function(){
				$scope.indexCurrentImage = ($scope.indexCurrentImage - 1 > 0) ? ($scope.indexCurrentImage - 1)%$scope.currentAlbum.length: ($scope.currentAlbum.length-1);
			}
		},

		template: '<div class="ng-overlay" ng-show="gallery"></div>' +
		'<div class="ng-gallery-content" ng-show="gallery"><div class="uil-ring-css" ng-show="loading"><div></div></div>' +
		'<a class="close-popup" ng-click="closeGallery()"><i class="fa fa-close"></i></a><a class="nav-left" ng-click="prevImage()">' +
		'<i class="fa fa-angle-left"></i></a><img  ng-show="!loading" class="effect" ng-src="{{currentAlbum[indexCurrentImage].source}}">' +
		'<a class="nav-right" ng-click="nextImage()"><i class="fa fa-angle-right"></i></a>' +
		'<span class="info-text">{{1+indexCurrentImage+\'/\'+currentAlbum.length}} - {{currentAlbum[indexCurrentImage].name}}</span>' +
		'<div class="ng-thumbnails-wrapper" style="width: 30px;"><div class="ng-thumbnails slide-left" style="width: 100px;">' +
		'</div></div></div><div ng-transclude></div>'
	};
});

app.directive('artyoniAlbum', function($timeout) {
	return {
		restrict: 'AE',
		require: '^artyoniGallery',
		replace: true,
		scope: {},
		link: function(scope, elem, attrs, controllerInstance) {
			attrs.$observe('artyoniAlbum', function (newValue) {
				if(!!newValue)
					scope.artYoniAlbum = JSON.parse(newValue);
			});

			scope.openGallery = function(album){
				controllerInstance.openGallery(album)

			}
		},
		templateUrl: 'app/templates/gallery.html'
	};
});