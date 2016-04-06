/**
 * Created by yonathanbenitah on 1/6/16.
 */
// server.js

// set up ========================
var express  = require('express');
var app      = express();                               // create our app w/ express
var mongoose = require('mongoose');                     // mongoose for mongodb
var morgan = require('morgan');             // log requests to the console (express4)
var bodyParser = require('body-parser');    // pull information from HTML POST (express4)
var methodOverride = require('method-override'); // simulate DELETE and PUT (express4)
var request = require("request");
var Iconv = require('iconv').Iconv;
var fs = require('fs');
var Buffer = require('buffer').Buffer;
var Iconv  = require('iconv').Iconv;
var assert = require('assert');
var windows1255 = require('windows-1255');
var encoding = require('encoding');
var Converter = require("csvtojson").Converter;







// configuration =================

mongoose.connect('mongodb://node:nodeuser@mongo.onmodulus.net:27017/uwO3mypu');     // connect to mongoDB database on modulus.io

app.use(express.static(__dirname + '/public'));                 // set the static files location /public/img will be /img for users
app.use(morgan('dev'));                                         // log every request to the console
app.use(bodyParser.urlencoded({'extended':'true'}));            // parse application/x-www-form-urlencoded
app.use(bodyParser.json());                                     // parse application/json
app.use(bodyParser.json({ type: 'application/vnd.api+json' })); // parse application/vnd.api+json as json
app.use(methodOverride());

var router = express.Router();              // get an instance of the express Router

app.use('/api', router);

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
router.get('/', function(req, res) {
	var options = {
		method: 'GET',
		url: 'http://www.pais.co.il/Lotto/Pages/last_Results.aspx',
		qs: {download: '1'},
		encoding: 'binary' //
	};

	request(options, function (error, response, body) {

		//deal with hebrew encoding
		csvString = encoding.convert(body, 'UTF8', "CP1255").toString();
		// rename headers and make a JSON file
		var converter = new Converter({headers:["lottery", "date","1","2", "3", "4", "5", "6", "sup-Nbr", "winner", "DBL-winner"]});
		converter.fromString(csvString, function(err,result) {
			return res.status(200).send({status: 'success', data: result});
		});
	});
});



// listen (start app with node server.js) ======================================
app.listen(3000);
console.log("App listening on portee 8080");
