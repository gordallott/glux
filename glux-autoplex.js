require('sugar');
var config = require('./glux-config');

var restify = require('restify');
var xml2json = require('xml2json');

var plexHostname = config.plexHostname;
var gluxHostname = config.gluxHostname;

var plexClient = restify.createStringClient(plexHostname);
var gluxClient = restify.createJsonClient(gluxHostname);

var animationLength = 20*1000; // 20 seconds
var dimTo = 0.2;
var animationSliceSize = (1.0-dimTo) / (animationLength / 250); // 4 ticks a second

function getPlexState(cb) {
	plexClient.get('/status/sessions', function (err, req, res, data) {
		data = data.split('<?xml version="1.0" encoding="UTF-8"?>')[1];
		data = JSON.parse(xml2json.toJson(data));
		var state = '';
		try {
			state = data.MediaContainer.Video.Player.state;
		}
		catch (e) { };

		cb(state);
	});
};


function getGluxState(cb) {
	gluxClient.get('/', function (err, req, res, obj) {
		currentBrightnessState = obj;
		cb(currentBrightnessState);
	});
}

function checkStateAndAnimate(cb) {
	getPlexState(function(state) {
		getGluxState(function (brightnessState) {
			if (state === '' || state === 'paused' ) {
				// plex is not playing 
				if (brightnessState.modified < 1.0) {
					console.log('(%s) animating to 1.0: %s', state, brightnessState.modified);
					// plex is not playing and we need to animate from the playing state one tick
					var apiCall = '/setModifiedBrightness/' + (brightnessState.modified + animationSliceSize);
					console.log(apiCall);
					gluxClient.get(apiCall, function() {});
					setTimeout(checkStateAndAnimate.bind(null, cb), 250);
				}
				else {
					cb();
				}
			}
			else if (state === 'playing') {
				if (brightnessState.modified > dimTo) {
					console.log('(%s) animating to %s: %s', state, dimTo, brightnessState.modified);
					// plex is playing and we need to dim the lights
					var apiCall = '/setModifiedBrightness/' + (brightnessState.modified - animationSliceSize);
					console.log(apiCall);
					gluxClient.get(apiCall, function () {} );
					setTimeout(checkStateAndAnimate.bind(null, cb), 250);
				}
				else {
					cb();
				}
			}
			else {
				cb();
			}
		});
	});
}

checkStateAndAnimate(function() {
	console.log('Nothing more to do.');
});



