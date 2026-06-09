'use strict';
'require view';
'require fs';
'require form';
'require uci';
'require poll';

var statusBox;
var actionBox;
var statusData = null;
var localStartedAt = null;
var languageStorageKey = 'yandexInternetometerLanguage';
var translations = {
	ru: {
		'Bytes per upload request. The payload is streamed from /dev/zero and is not stored on flash.': 'Байт на один исходящий запрос. Данные идут потоком из /dev/zero и не сохраняются во flash.',
		'Checking latency': 'Проверка задержки',
		'Current stage: %s': 'Текущий этап: %s',
		'Debug mode': 'Режим отладки',
		'Download duration': 'Длительность входящего теста',
		'Download speed': 'Входящая скорость',
		'Elapsed: %s seconds': 'Прошло: %s с',
		'Enable upload test': 'Включить исходящий тест',
		'Finishing the test': 'Завершение теста',
		'Jitter': 'Джиттер',
		'Last run': 'Последний запуск',
		'Latency': 'Задержка',
		'Mbps': 'Мбит/с',
		'Measuring download speed': 'Измерение входящей скорости',
		'Measuring upload speed': 'Измерение исходящей скорости',
		'Not available': 'Нет данных',
		'Probe servers': 'Probe-серверы',
		'Refresh status': 'Обновить статус',
		'Seconds.': 'Секунды.',
		'Server': 'Сервер',
		'Settings': 'Настройки',
		'Speed test in progress': 'Идёт тест скорости',
		'Start test': 'Запустить тест',
		'Stop test': 'Остановить тест',
		'Stream count': 'Количество потоков',
		'Streams': 'Потоки',
		'Switch application language': 'Сменить язык приложения',
		'Unable to execute backend command': 'Не удалось выполнить backend-команду',
		'Unofficial Yandex Internetometer-compatible speed test using Yandex probe servers. This is not official Yandex software.': 'Неофициальный совместимый с Яндекс Интернетометром тест скорости через probe-серверы Яндекса. Это не официальное ПО Яндекса.',
		'Upload duration': 'Длительность исходящего теста',
		'Upload payload size': 'Размер исходящего payload',
		'Upload speed': 'Исходящая скорость',
		'Yandex Internetometer': 'Яндекс Интернетометр',
		'ms': 'мс'
	}
};
var appLanguage = readStoredLanguage() || detectSystemLanguage();

function detectSystemLanguage() {
	var language = '';

	if (typeof L !== 'undefined' && L.env && L.env.lang)
		language = L.env.lang;
	else if (document.documentElement && document.documentElement.lang)
		language = document.documentElement.lang;
	else if (navigator.language)
		language = navigator.language;

	return String(language).toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
}

function readStoredLanguage() {
	try {
		var language = window.localStorage.getItem(languageStorageKey);
		if (language === 'ru' || language === 'en')
			return language;
	}
	catch (e) {}

	return null;
}

function storeLanguage(language) {
	try {
		window.localStorage.setItem(languageStorageKey, language);
	}
	catch (e) {}
}

function T(source) {
	if (appLanguage === 'ru' && translations.ru[source])
		return translations.ru[source];

	return source;
}

function emptyValue(value, suffix) {
	if (value === null || value === undefined || value === '')
		return T('Not available');

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
			upload_enabled: 1,
			probe_count: 0,
			server: null,
			error: err ? String(err) : T('Unable to execute backend command')
		};
	});
}

function card(title, value) {
	return E('div', { 'class': 'cbi-section yandex-internetometer-card' }, [
		E('div', { 'class': 'yandex-internetometer-card-title' }, title),
		E('div', { 'class': 'yandex-internetometer-card-value' }, value)
	]);
}

function numericValue(value, fallback) {
	var number = parseInt(value, 10);
	return isNaN(number) ? fallback : number;
}

function runningElapsed(data) {
	var started = localStartedAt;

	if (data && data.timestamp) {
		var parsed = Date.parse(data.timestamp);
		if (!isNaN(parsed))
			started = parsed;
	}

	if (!started)
		return 0;

	return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

function runningEstimate(data) {
	var downloadTime = numericValue(data ? data.download_time : null, 10);
	var uploadTime = data && Number(data.upload_enabled) === 0 ? 0 : numericValue(data ? data.upload_time : null, 10);

	return 5 + downloadTime + uploadTime + 2;
}

function runningPhase(data, elapsed) {
	var downloadTime = numericValue(data ? data.download_time : null, 10);
	var uploadTime = data && Number(data.upload_enabled) === 0 ? 0 : numericValue(data ? data.upload_time : null, 10);

	if (elapsed < 5)
		return T('Checking latency');

	if (elapsed < 5 + downloadTime)
		return T('Measuring download speed');

	if (uploadTime > 0 && elapsed < 5 + downloadTime + uploadTime)
		return T('Measuring upload speed');

	return T('Finishing the test');
}

function renderProgress(data) {
	var elapsed = runningElapsed(data);
	var estimate = runningEstimate(data);
	var percent = Math.min(98, Math.round((elapsed / estimate) * 100));

	return E('div', { 'class': 'cbi-section yandex-internetometer-progress' }, [
		E('div', { 'class': 'yandex-internetometer-progress-head' }, [
			E('div', { 'class': 'yandex-internetometer-running-dot' }),
			E('div', {}, [
				E('strong', {}, T('Speed test in progress')),
				E('div', { 'class': 'yandex-internetometer-progress-sub' },
					T('Current stage: %s').format(runningPhase(data, elapsed)))
			]),
			E('div', { 'class': 'yandex-internetometer-progress-time' },
				T('Elapsed: %s seconds').format(elapsed))
		]),
		E('div', { 'class': 'yandex-internetometer-progress-track' }, [
			E('div', {
				'class': 'yandex-internetometer-progress-fill',
				'style': 'width:%d%%'.format(percent)
			})
		])
	]);
}

function renderStatus(data) {
	statusData = data || {};
	if (!statusData.running)
		localStartedAt = null;

	var children = [];
	if (statusData.running) {
		children.push(renderProgress(statusData));
	}

	if (statusData.error) {
		children.push(E('div', { 'class': 'alert-message warning' }, statusData.error));
	}

	children.push(E('div', { 'class': 'yandex-internetometer-grid' }, [
		card(T('Download speed'), emptyValue(statusData.download_mbps, T('Mbps'))),
		card(T('Upload speed'), emptyValue(statusData.upload_mbps, T('Mbps'))),
		card(T('Latency'), emptyValue(statusData.ping_ms, T('ms'))),
		card(T('Jitter'), emptyValue(statusData.jitter_ms, T('ms'))),
		card(T('Streams'), emptyValue(statusData.streams)),
		card(T('Server'), emptyValue(statusData.server)),
		card(T('Probe servers'), emptyValue(statusData.probe_count)),
		card(T('Last run'), emptyValue(statusData.timestamp))
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
		'type': 'button',
		'class': 'btn cbi-button cbi-button-action',
		'click': function() {
			var optimistic = Object.assign({}, statusData || {}, {
				ok: true,
				running: true,
				timestamp: new Date().toISOString(),
				download_mbps: null,
				upload_mbps: null,
				ping_ms: null,
				jitter_ms: null,
				error: null
			});

			localStartedAt = Date.now();
			renderStatus(optimistic);

			return statusCall('start').then(function(data) {
				if (!data || data.error)
					return renderStatus(data);

				data.running = true;
				if (!data.timestamp)
					data.timestamp = optimistic.timestamp;

				renderStatus(data);

				window.setTimeout(function() {
					statusCall('status').then(renderStatus);
				}, 1000);
			});
		}
	}, T('Start test')));

	if (statusData && statusData.running) {
		actionBox.appendChild(E('button', {
			'type': 'button',
			'class': 'btn cbi-button cbi-button-negative',
			'click': function() {
				localStartedAt = null;
				return statusCall('stop').then(renderStatus);
			}
		}, T('Stop test')));
	}

	actionBox.appendChild(E('button', {
		'type': 'button',
		'class': 'btn cbi-button',
		'click': function() {
			return statusCall('status').then(renderStatus);
		}
	}, T('Refresh status')));

	actionBox.appendChild(E('button', {
		'type': 'button',
		'class': 'btn cbi-button',
		'title': T('Switch application language'),
		'click': function() {
			storeLanguage(appLanguage === 'ru' ? 'en' : 'ru');
			window.location.reload();
		}
	}, appLanguage === 'ru' ? 'English' : 'Русский'));
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

		m = new form.Map('yandex-internetometer', T('Settings'));
		s = m.section(form.NamedSection, 'main', 'settings');
		s.anonymous = true;

		o = s.option(form.Value, 'streams', T('Stream count'));
		o.datatype = 'range(1, 8)';
		o.rmempty = false;

		o = s.option(form.Value, 'download_time', T('Download duration'));
		o.datatype = 'range(1, 60)';
		o.rmempty = false;
		o.description = T('Seconds.');

		o = s.option(form.Value, 'upload_time', T('Upload duration'));
		o.datatype = 'range(1, 60)';
		o.rmempty = false;
		o.description = T('Seconds.');

		o = s.option(form.Value, 'upload_size', T('Upload payload size'));
		o.datatype = 'range(1024, 50000000)';
		o.rmempty = false;
		o.description = T('Bytes per upload request. The payload is streamed from /dev/zero and is not stored on flash.');

		o = s.option(form.Flag, 'upload_enabled', T('Enable upload test'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'debug', T('Debug mode'));
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
					'.yandex-internetometer-card-value{font-size:20px;font-weight:600;line-height:1.25;overflow-wrap:anywhere}',
					'.yandex-internetometer-progress{padding:16px;margin:12px 0 18px}',
					'.yandex-internetometer-progress-head{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}',
					'.yandex-internetometer-progress-sub{color:var(--text-color-medium);font-size:13px;margin-top:3px}',
					'.yandex-internetometer-progress-time{color:var(--text-color-medium);font-size:13px}',
					'.yandex-internetometer-progress-track{height:10px;border-radius:999px;background:rgba(127,127,127,.18);overflow:hidden}',
					'.yandex-internetometer-progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#ff6b6b,#ffd166,#4cc9f0);background-size:180% 100%;animation:yandexInternetometerFlow 1.1s linear infinite;transition:width .35s ease}',
					'.yandex-internetometer-running-dot{width:12px;height:12px;border-radius:50%;background:#ff6b6b;box-shadow:0 0 0 0 rgba(255,107,107,.55);animation:yandexInternetometerPulse 1.2s ease-out infinite;flex:0 0 auto}',
					'@keyframes yandexInternetometerPulse{0%{box-shadow:0 0 0 0 rgba(255,107,107,.55)}70%{box-shadow:0 0 0 10px rgba(255,107,107,0)}100%{box-shadow:0 0 0 0 rgba(255,107,107,0)}}',
					'@keyframes yandexInternetometerFlow{0%{background-position:0 0}100%{background-position:180% 0}}'
				].join('')),
				E('h2', {}, T('Yandex Internetometer')),
				E('p', {}, T('Unofficial Yandex Internetometer-compatible speed test using Yandex probe servers. This is not official Yandex software.')),
				actionBox,
				statusBox,
				formNode
			]);

			renderStatus(statusData);

			poll.add(function() {
				if (!statusData || !statusData.running)
					return Promise.resolve();

				return statusCall('status').then(renderStatus);
			}, 1);

			return node;
		});
	},

	handleSaveApply: function() {
		return this.super('handleSaveApply', arguments).then(function() {
			return statusCall('status').then(renderStatus);
		});
	}
});
