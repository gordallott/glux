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

/* --- BrightnessState object --- */
var BrightnessState = function () {
  this.brightness = 0.0;
  this.animationStart = -1;
  this.animationLength = -1;
  this.animationTargetBrightness = -1;
  this.cachedBrightness = 0.0;
}

BrightnessState.prototype.isAnimating = function () {
  var result = (this.animationStart > 0);
  return result 
}

BrightnessState.prototype.getBrightness = function () {
  var self = this;

  if (self.isAnimating() === false) {
    return self.brightness;
  }

  // animating so calculate the animated brightness
  var timelinePosition = Math.max(Math.min((Date.now() - self.animationStart) / self.animationLength, 1.0), 0.0);
  if (timelinePosition >= 1.0) {
    self.setFixedBrightness(self.animationTargetBrightness);
    return self.brightness;
  }
  
  this.cachedBrightness = self.brightness + ((self.animationTargetBrightness - self.brightness) * timelinePosition);
  return this.cachedBrightness;
}

BrightnessState.prototype.setAnimation = function (targetBrightness, length) {
  var self = this;
  if (targetBrightness === self.brightness) return;

  self.setFixedBrightness(self.getBrightness());

  self.animationStart = Date.now();
  self.animationLength = length;

  self.animationTargetBrightness = targetBrightness;
}

BrightnessState.prototype.setFixedBrightness = function (brightness) {
  this.brightness = brightness;
  this.animationStart = -1;
  this.animationLength = -1;
  this.animationTargetBrightness = -1;
  this.cachedBrightness = brightness;
}
/* --- BrightnessState object --- */

/* --- GluxServer object --- */


var GluxServer = function () {
  var self = this;
  self.brightnessState = {
    'states': {},
    'override': null,
    'cachedBrightness': 0.0
  };

  self.timelineIsRunning = false;
}

GluxServer.prototype.calculateBrightness = function(brightnessState) {
  if (brightnessState.override !== null) {
    return brightnessState.override;
  }

  // otherwise we multiply all the modified brightnesses together
  if (Object.values(brightnessState.states).length <= 0) {
    return 0.0;
  }

  if (Object.values(brightnessState.states).length === 1) {
    return Object.values(brightnessState.states)[0].getBrightness();
  }

  return Object.values(brightnessState.states).reduce(function(a, b) { 
    return a.getBrightness() * b.getBrightness(); 
  });
}

GluxServer.prototype.setBrightness = function () {
  var self = this;
  var brightness = self.calculateBrightness(self.brightnessState);
  self.sendBrightness(brightness);
  self.checkTimeline();
}

GluxServer.prototype.sendBrightness = function (brightness) {
  var state;
  if (brightness < 0) {
    state = lightState.create().off();
    console.log("%s - setting brightness to %s", Date.create().format('{hh}:{mm}'), 'off')
  }
  else {
    state = lightState.create().on().brightness(brightness*100).transition(500);
    console.log("%s - setting brightness to %s", Date.create().format('{hh}:{mm}'), brightness)
  }
  
  for (var i=0; i < hueLights.length; i++) {
  //  hueApi.setLightState(hueLights[i], state);
  }
}

GluxServer.prototype.updateOverride = function(brightness) {
  var self = this;
  self.override = brightness;
  this.setBrightness();
}

GluxServer.prototype.updateState = function(stateKey, brightness) {
  var self = this;
  console.log(stateKey, brightness);
  if (Object.has(self.brightnessState.states, stateKey) === false) {
    self.brightnessState.states[stateKey] = new BrightnessState();
  }

  self.brightnessState.states[stateKey].setFixedBrightness(brightness);
  this.setBrightness();
}

GluxServer.prototype.updateStateWithAnimation = function (stateKey, brightness, length) {
  var self = this;
  if (Object.has(self.brightnessState.states, stateKey) === false) {
    self.brightnessState.states[stateKey] = new BrightnessState();
  }

  self.brightnessState.states[stateKey].setAnimation(brightness, length);
  this.setBrightness();
}

GluxServer.prototype.checkShouldAnimate = function() {
  var self = this;
  return Object.values(self.brightnessState.states).any(function (v) {
    return v.isAnimating();
  });
}

GluxServer.prototype.tickFunc = function () {
  var self = this;

  var shouldAnimate = self.checkShouldAnimate();
  if (shouldAnimate === false) {
    self.timelineIsRunning = false;
    return;
  }

  self.timelineIsRunning = true;
  self.setBrightness();
  setTimeout(self.tickFunc.bind(self), 500)
}

GluxServer.prototype.checkTimeline = function () {
  var self = this;
  if (self.timelineIsRunning === true || self.checkShouldAnimate() === false) {
    return;
  }

  self.tickFunc();
}

GluxServer.prototype.start = function () {
  var self = this;

  var handleBrightnessApi = function (req, res, next) {
    var stateKey = req.params.stateKey;
    var brightness = req.params.brightness;
    var animationLength = 0.0;
    if (Object.has(req.params, 'animationLength')) {
      animationLength = req.params.animationLength;
    }

    brightness = (brightness === 'reset') ? 0.0 : parseFloat(brightness);
    brightness = Math.min(brightness, 1.0);
    if (animationLength > 0) {
      self.updateStateWithAnimation(stateKey, brightness, animationLength);
    }
    else {
      self.updateState(stateKey, brightness);
    }

    self.brightnessState.cachedBrightness = self.calculateBrightness(self.brightnessState);
    res.send(self.brightnessState)
    next();
  };

  var handleOverrideApi = function (req, res, next) {
    var brightness = req.params.brightness;
    brightness = (brightness === 'reset') ? 0.0 : parseFloat(brightness);
    brightness = Math.min(brightness, 1.0);

    self.updateOverride(brightness);
    self.brightnessState.cachedBrightness = self.calculateBrightness(self.brightnessState);
    res.send(self.brightnessState)
    next();
  }

  var apis = {
    '/setModifiedBrightness/:stateKey/:brightness/': handleBrightnessApi,
    '/setModifiedBrightness/:stateKey/:brightness/:animationLength': handleBrightnessApi,
    '/setOverrideBrightness/:brightness': handleOverrideApi,
    '/': function(req, res, next) { 
      Object.values(self.brightnessState.states).each(function (v) {
        return v.getBrightness();
      });
      self.brightnessState.cachedBrightness = self.calculateBrightness(self.brightnessState);
      res.send(self.brightnessState); 
      next();
    }
  }

  self.server = restify.createServer();

  Object.each(apis, function (uri, fn) {
    self.server.get(uri, fn);
  });

  self.server.listen(8080, function() {
    console.log('%s, listening at %s', self.server.name, self.server.url);
  });
}

/* --- GluxServer object --- */


var server = new GluxServer();
server.start();
