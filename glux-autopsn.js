require('sugar');
var config = require('./glux-config');
var PSNjs = require('PSNjs');
var restify = require('restify');
var util = require('util');

var gluxHostname = config.gluxHostname;
var gluxClient = restify.createJsonClient(gluxHostname);
var gluxKey = 'AUTOPSN';

var DimmingAnimationLength = 20*1000; 		// 20 seconds
var UnDimmingAnimationLength = 10*1000; 		// 10 seconds
var dimTo = 0.2;

var psn = new PSNjs({
	email: config.psnUsername,
	password: config.psnPassword,
	debug: true,
	authfile: '.psnAuth'
});

function getPsnState(cb) {
	psn.getProfile(config.psnMonitorName, function(error, data) {
	    // check for an error 
	    if (error)
	    {
	        console.log("Error fetching profile: " + error);
	        return;
	    }

	    console.dir(data);
	 	
	 	cb(data.presence.primaryInfo.onlineStatus);
	});
}

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
	getPsnState(function(state) {
		getGluxState(function (brightnessState) {
			console.log(state);
			if (state === 'offline' && brightnessState < 1.0) {
				console.log('(%s) animating to 1.0: %s', state, brightnessState);
				// offline

				var animDiff = (brightnessState - dimTo) / (1.0 - dimTo)
				var calcTime = UnDimmingAnimationLength - (animDiff * UnDimmingAnimationLength);
				var apiCall = util.format('/setModifiedBrightness/%s/%d/%d', gluxKey, 1.0, calcTime);
				gluxClient.get(apiCall, function() {});
			}
			else if (state !== 'offline' && brightnessState > dimTo) {
				console.log('(%s) animating to %s: %s', state, dimTo, brightnessState);

				var animDiff = (brightnessState - dimTo) / (1.0 - dimTo)
				var calcTime = DimmingAnimationLength * animDiff;
				var apiCall = util.format('/setModifiedBrightness/%s/%d/%d', gluxKey, dimTo, calcTime);
				gluxClient.get(apiCall, function () {} );
			}
			
			cb();
		});
	});
}

checkStateAndAnimate(function() {
	console.log('Nothing more to do.');
});