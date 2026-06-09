'use strict';
'require view';
'require fs';
'require form';
'require uci';
'require poll';

var statusBox;
var actionBox;
var statusData = null;

function emptyValue(value, suffix) {
	if (value === null || value === undefined || value === '')
		return _('Not available');

	if (suffix)
		return '%s %s'.format(value, suffix);

	return String(value);
}

function statusCall(command) {
	return fs.exec_direct('/usr/libexec/yandex-internetometer/' + command, [], 'json').catch(function(err) {
		return {
			ok: false,
			running: false,
			timestamp: null,
			download_mbps: null,
			upload_mbps: null,
			ping_ms: null,
			jitter_ms: null,
			streams: null,
			download_time: null,
			upload_time: null,
			probe_count: 0,
			server: null,
			error: err ? String(err) : _('Unable to execute backend command')
		};
	});
}

function card(title, value) {
	return E('div', { 'class': 'cbi-section yandex-internetometer-card' }, [
		E('div', { 'class': 'yandex-internetometer-card-title' }, title),
		E('div', { 'class': 'yandex-internetometer-card-value' }, value)
	]);
}

function renderStatus(data) {
	statusData = data || {};

	var children = [];
	if (statusData.running) {
		children.push(E('div', { 'class': 'alert-message notice' }, _('The speed test is running. Results will update automatically.')));
	}

	if (statusData.error) {
		children.push(E('div', { 'class': 'alert-message warning' }, statusData.error));
	}

	children.push(E('div', { 'class': 'yandex-internetometer-grid' }, [
		card(_('Download'), emptyValue(statusData.download_mbps, _('Mbps'))),
		card(_('Upload'), emptyValue(statusData.upload_mbps, _('Mbps'))),
		card(_('Ping'), emptyValue(statusData.ping_ms, _('ms'))),
		card(_('Jitter'), emptyValue(statusData.jitter_ms, _('ms'))),
		card(_('Streams'), emptyValue(statusData.streams)),
		card(_('Server'), emptyValue(statusData.server)),
		card(_('Probe count'), emptyValue(statusData.probe_count)),
		card(_('Last run time'), emptyValue(statusData.timestamp))
	]));

	statusBox.innerHTML = '';
	children.forEach(function(child) {
		statusBox.appendChild(child);
	});

	renderActions();
}

function renderActions() {
	if (!actionBox)
		return;

	actionBox.innerHTML = '';

	actionBox.appendChild(E('button', {
		'class': 'btn cbi-button cbi-button-action',
		'click': function() {
			return uci.save().then(function() {
				return uci.apply();
			}).then(function() {
				return statusCall('start');
			}).then(renderStatus);
		}
	}, _('Start test')));

	if (statusData && statusData.running) {
		actionBox.appendChild(E('button', {
			'class': 'btn cbi-button cbi-button-negative',
			'click': function() {
				return statusCall('stop').then(renderStatus);
			}
		}, _('Stop test')));
	}

	actionBox.appendChild(E('button', {
		'class': 'btn cbi-button',
		'click': function() {
			return statusCall('status').then(renderStatus);
		}
	}, _('Refresh status')));
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('yandex-internetometer'),
			statusCall('status')
		]);
	},

	render: function(data) {
		var m, s, o;

		statusData = data[1] || {};

		m = new form.Map('yandex-internetometer', _('Settings'));
		s = m.section(form.NamedSection, 'main', 'settings');
		s.anonymous = true;

		o = s.option(form.Value, 'streams', _('Stream count'));
		o.datatype = 'range(1, 8)';
		o.rmempty = false;

		o = s.option(form.Value, 'download_time', _('Download duration'));
		o.datatype = 'range(1, 60)';
		o.rmempty = false;
		o.description = _('Seconds.');

		o = s.option(form.Value, 'upload_time', _('Upload duration'));
		o.datatype = 'range(1, 60)';
		o.rmempty = false;
		o.description = _('Seconds.');

		o = s.option(form.Value, 'upload_size', _('Upload payload size'));
		o.datatype = 'range(1024, 50000000)';
		o.rmempty = false;
		o.description = _('Bytes per upload request. The payload is streamed from /dev/zero and is not stored on flash.');

		o = s.option(form.Flag, 'upload_enabled', _('Enable upload test'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'debug', _('Debug mode'));
		o.default = '0';
		o.rmempty = false;

		return m.render().then(function(formNode) {
			statusBox = E('div');
			actionBox = E('div', { 'class': 'cbi-section yandex-internetometer-actions' });

			var node = E('div', { 'class': 'yandex-internetometer-page' }, [
				E('style', {}, [
					'.yandex-internetometer-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px}',
					'.yandex-internetometer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0 22px}',
					'.yandex-internetometer-card{margin:0;padding:12px}',
					'.yandex-internetometer-card-title{font-size:12px;color:var(--text-color-medium);margin-bottom:6px}',
					'.yandex-internetometer-card-value{font-size:20px;font-weight:600;line-height:1.25;overflow-wrap:anywhere}'
				].join('')),
				E('h2', {}, _('Yandex Internetometer')),
				E('p', {}, _('Unofficial Yandex Internetometer-compatible speed test using Yandex probe servers. This is not official Yandex software.')),
				actionBox,
				statusBox,
				formNode
			]);

			renderStatus(statusData);

			poll.add(function() {
				if (!statusData || !statusData.running)
					return Promise.resolve();

				return statusCall('status').then(renderStatus);
			}, 3);

			return node;
		});
	},

	handleSaveApply: function() {
		return this.super('handleSaveApply', arguments).then(function() {
			return statusCall('status').then(renderStatus);
		});
	}
});
