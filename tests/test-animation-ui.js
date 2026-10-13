'use strict';
// Live value smoothing: time-consistent at any frame rate, continuous when the target moves.
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var source = fs.readFileSync(path.join(__dirname, '..', 'htdocs/luci-static/resources/view/status/yandex-internetometer-live.js'), 'utf8');
var cutoff = source.indexOf('return view.extend({');
var frames = [];

function load() {
	var context = {
		window: {
			localStorage: { getItem: function() { return null; }, setItem: function() {} },
			matchMedia: function() { return { matches: false }; },
			requestAnimationFrame: function(cb) { frames.push(cb); return frames.length; },
			cancelAnimationFrame: function() {},
			performance: { now: function() { return 1000; } }
		},
		document: { hidden: false }, Date: Date, Math: Math, Number: Number, String: String, Object: Object, Array: Array, JSON: JSON, isNaN: isNaN, isFinite: isFinite
	};
	vm.createContext(context);
	vm.runInContext(source.slice(0, cutoff), context);
	return context;
}
function run(context, fps, seconds, retarget) {
	var seen = [], now = 1000, step = 1000 / fps, until = now + seconds * 1000;
	context.animateValue('speed', 100, 0.6, function(value) { seen.push(value); }, 0);
	while (now < until && frames.length) {
		now += step;
		if (retarget && now >= 1000 + retarget.at * 1000 && !retarget.done) { retarget.done = true; context.animateValue('speed', retarget.to, 0.6, function(value) { seen.push(value); }, 0); }
		var next = frames.splice(0); next.forEach(function(cb) { cb(now); });
	}
	return seen;
}
function fail(message) { throw new Error(message); }

frames = []; var fast = run(load(), 60, 1);
frames = []; var slow = run(load(), 5, 1);
var expected = 100 * (1 - Math.exp(-1 / 0.6));
if (Math.abs(fast[fast.length - 1] - expected) > 3) fail('60 fps value ' + fast[fast.length - 1] + ' expected ~' + expected);
if (Math.abs(slow[slow.length - 1] - fast[fast.length - 1]) > 3) fail('frame rate changes the speed of motion: ' + slow[slow.length - 1] + ' vs ' + fast[fast.length - 1]);
for (var i = 1; i < fast.length; i++) if (fast[i] < fast[i - 1]) fail('value went backwards while rising');
if (fast[0] !== 0) fail('speed does not rise from zero');

frames = []; var moved = run(load(), 60, 1.5, { at: 0.5, to: 300 });
for (i = 1; i < moved.length; i++) if (Math.abs(moved[i] - moved[i - 1]) > 15) fail('jump of ' + (moved[i] - moved[i - 1]).toFixed(1) + ' when the target changed');
if (moved[moved.length - 1] < 200) fail('did not follow the new target');

var hidden = load(); hidden.document.hidden = true; var shown = [];
hidden.animateValue('speed', 42, 0.6, function(value) { shown.push(value); }, 0);
if (shown[shown.length - 1] !== 42) fail('hidden tab must show the target at once');
if (hidden.metricLiveNumber(927.4) !== '927' || hidden.metricLiveNumber(12.34) !== '12.3') fail('live number format');
process.stdout.write('animation UI tests: ok\n');
