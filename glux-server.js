require('sugar');
var config = require('./glux-config.json');
var restify = require('restify');
var Hue = require("node-hue-api");
var HueApi = Hue.HueApi;
var lightState = Hue.lightState;
var hueHostname = config.hueHostname;
var hueUsername = config.hueUsername;
var hueApi = new HueApi(hueHostname, hueUsername);
var hueLights = [1,2,3];

function hueLoginCheck(hostname, username) {
  return hueApi.config().then(function (res) {
    if (Object.has(res, 'mac') == false) {
      console.log("Could not login");
    }
    else {
      console.log("logged in");
    }
  });
}

function hueSetBrightness(brightness) {
  var state;
  if (brightness < 0) {
    state = lightState.create().off();
  console.log("%s - setting brightness to %s", Date.create().format('{hh}:{mm}'), 'off')
  }
  else {
    state = lightState.create().on().brightness(brightness*100).transition(200);
    console.log("%s - setting brightness to %s", Date.create().format('{hh}:{mm}'), brightness)
  }
  
  for (var i=0; i < hueLights.length; i++) {
    hueApi.setLightState(hueLights[i], state);
  }
}


hueLoginCheck().then(function() {
  //return hueSetBrightness(0);
}).then(function() {
  console.log("done things");
});

var Brightness = {
  'base': 1.0,
  'modified': 1.0,
  'override': null
}

function calcAndSendBrightness(brightnessObj) {

  var totalBrightness = brightnessObj.base * brightnessObj.modified; 
  if (brightnessObj.override !== null) {
    totalBrightness = brightnessObj.override;
  }

  hueSetBrightness(totalBrightness);
}

function setBaseBrightness(req, res, next) {
  console.log('base brightness, ' + req.params.brightness);

  var brightness = req.params.brightness;
  brightness = (brightness === 'reset') ? 1.0 : parseFloat(brightness);
  
  brightness = Math.min(brightness, 1.0);
  Brightness.base = brightness;
  calcAndSendBrightness(Brightness);
  respond(req, res, next);
}

function setModifiedBrightness(req, res, next) {

  var brightness = req.params.brightness;
  brightness = (brightness === 'reset') ? 1.0 : parseFloat(brightness);
  brightness = Math.min(brightness, 1.0);

  Brightness.modified = brightness;
  calcAndSendBrightness(Brightness);
  respond(req, res, next);
}

function setOverrideBrightness(req, res, next) {
  var brightness = req.params.brightness;
  brightness = (brightness === 'reset') ? null : parseFloat(brightness);
  if (brightness !== null) {
    brightness = Math.min(req.params.brightness, 1.0);
  }

  Brightness.override = brightness;
  calcAndSendBrightness(Brightness)
  respond(req, res, next);
}


var apis = {
  '/setBaseBrightness/:brightness': setBaseBrightness,
  '/setModifiedBrightness/:brightness': setModifiedBrightness,
  '/setOverrideBrightness/:brightness': setOverrideBrightness
}

function respond(req, res, next) {
  res.send(Brightness);
  next();
}

var server = restify.createServer();
server.get('/', respond);

Object.each(apis, function (uri, fn) {
  server.get(uri, fn);
})

server.listen(8080, function() {
  console.log('%s, listening at %s', server.name, server.url);
});
