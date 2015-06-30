require('sugar');
var config = require('./glux-config');

var restify = require('restify');
var xml2json = require('xml2json');
var util = require('util');

var plexHostname = config.plexHostname;
var gluxHostname = config.gluxHostname;

var plexClient = restify.createStringClient(plexHostname);
var gluxClient = restify.createJsonClient(gluxHostname);

var DimmingAnimationLength = 20*1000; 		// 20 seconds
var UnDimmingAnimationLength = 10*1000; 		// 10 seconds
var dimTo = 0.2;

var gluxKey = 'AUTOPLEX';

function getPlexState(cb) {
	plexClient.get('/status/sessions', function (err, req, res, data) {
		data = data.split('<?xml version="1.0" encoding="UTF-8"?>')[1];
		data = JSON.parse(xml2json.toJson(data));
		var state = '';
		try {
			state = data.MediaContainer.Video.Player.state
		}
		catch (e) { };

		cb(state);
	});
};


function getGluxState(cb) {
	gluxClient.get('/', function (err, req, res, obj) {
		var currentBrightnessState = 0.0; 
		console.log(obj);
		if (Object.has(obj.states, gluxKey)) {
			currentBrightnessState = obj.states[gluxKey].cachedBrightness;
		}
		cb(currentBrightnessState);
	});
}

function checkStateAndAnimate(cb) {
	var startTimeInMS = Date.now();
	getPlexState(function(state) {
		getGluxState(function (brightnessState) {
			if (state === '' || state === 'paused' ) {
				// plex is not playing 
				if (brightnessState < 1.0) {
					console.log('(%s) animating to 1.0: %s', state, brightnessState);
					// plex is not playing and we need to animate from the playing state

					var animDiff = (brightnessState - dimTo) / (1.0 - dimTo)
					var calcTime = UnDimmingAnimationLength - (animDiff * UnDimmingAnimationLength);
					console.log(calcTime);
					var apiCall = util.format('/setModifiedBrightness/%s/%d/%d', gluxKey, 1.0, calcTime);
					gluxClient.get(apiCall, function() {});
				}
			}
			else if (state === 'playing') {
				if (brightnessState > dimTo) {
					console.log('(%s) animating to %s: %s', state, dimTo, brightnessState);
					// plex is playing and we need to dim the lights

					var animDiff = (brightnessState - dimTo) / (1.0 - dimTo)
					var calcTime = DimmingAnimationLength * animDiff;
					console.log(calcTime);
					var apiCall = util.format('/setModifiedBrightness/%s/%d/%d', gluxKey, dimTo, calcTime);
					gluxClient.get(apiCall, function () {} );
				}
			}
			
			cb();
		});
	});
}

checkStateAndAnimate(function() {
	console.log('Nothing more to do.');
});



