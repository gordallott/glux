require('sugar');
var restify = require('restify');
var suncalc = require('suncalc');
var config = require('./glux-config.json')
var util = require('util');

var location = [53.100405, -2.443821];
var fadeInTime = 25; //minutes
var times = suncalc.getTimes(new Date(), location[0], location[1]);
var timeTillSunset = times.sunset.minutesFromNow();
var gluxKey = 'AUTOSUNSET';

if (timeTillSunset > fadeInTime) {
	console.log('Minutes until sunset: ' + timeTillSunset);
}

if (timeTillSunset <= fadeInTime && timeTillSunset > 0) { 

	var client = restify.createJsonClient({
		url: config.gluxHostname
	})

	client.get('/', function (err, req, res, obj) {
		currentBrightnessState = obj;
		console.log(currentBrightnessState);

		var brightness = 1.0 - (timeTillSunset / fadeInTime); // fuck it lets just make it linear even though it shouldn't be
		client.get(util.format('/setModifiedBrightness/%s/%s', gluxKey, brightness), function () {});

		if (currentBrightnessState.override != null) {
			client.get('/setOverrideBrightness/reset', function () {} )
		}

	})
}

// slowly brings up the lights when it is near sunset
