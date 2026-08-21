'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var source = fs.readFileSync(path.join(__dirname, '..', 'htdocs/luci-static/resources/view/status/yandex-internetometer-live.js'), 'utf8');
var cutoff = source.indexOf('return view.extend({');
var context;
var now;

if (cutoff < 0)
	throw new Error('Unable to locate LuCI view export');

context = {
	window: {
		localStorage: { getItem: function() { return null; }, setItem: function() {} },
		matchMedia: function() { return { matches: false }; }
	},
	E: function(tag, attrs, children) { return { tag: tag, attrs: attrs || {}, children: children || [] }; },
	Blob: function() {},
	URL: {},
	document: {},
	isFinite: isFinite,
	Date: Date,
	Math: Math,
	Number: Number,
	String: String,
	Array: Array,
	Object: Object,
	JSON: JSON,
	Promise: Promise,
	setTimeout: setTimeout
};

vm.createContext(context);
vm.runInContext(source.slice(0, cutoff), context);

now = Date.now();
context.records = [
	{ timestamp: new Date(now - 2 * 86400000).toISOString(), download_mbps: 100, upload_mbps: 50, ping_ms: 10, server: 'cdn.yandex.net' },
	{ timestamp: new Date(now - 10 * 86400000).toISOString(), download_mbps: 80, upload_mbps: 40, ping_ms: 15, server: 'cdn,"edge"' },
	{ timestamp: new Date(now - 35 * 86400000).toISOString(), download_mbps: 60, upload_mbps: null, ping_ms: 20, server: 'cdn.yandex.net' }
];

if (vm.runInContext('historyPeriod(records, 30, 0).length', context) !== 2)
	throw new Error('Current-period filter failed');
if (vm.runInContext("historyAverage(historyPeriod(records, 30, 0), 'download_mbps')", context) !== 90)
	throw new Error('Average calculation failed');
if (!vm.runInContext('historyCsv(records)', context).includes('"cdn,""edge"""'))
	throw new Error('CSV escaping failed');
if (vm.runInContext('historyChart([records[0]])', context).tag !== 'div')
	throw new Error('Single-record chart failed');

process.stdout.write('history UI tests: ok\n');
