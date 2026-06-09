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
		'Complete': 'Готово',
		'Current stage: %s': 'Текущий этап: %s',
		'Debug mode': 'Режим отладки',
		'Download': 'Скачивание',
		'Download duration': 'Длительность входящего теста',
		'Download speed': 'Входящая скорость',
		'Elapsed: %s seconds': 'Прошло: %s с',
		'Enable upload test': 'Включить исходящий тест',
		'Finishing the test': 'Завершение теста',
		'HTTP RTT': 'HTTP RTT',
		'Jitter': 'Джиттер',
		'Last run': 'Последний запуск',
		'Latency': 'Задержка',
		'Mbps': 'Мбит/с',
		'Measuring download speed': 'Измерение входящей скорости',
		'Measuring upload speed': 'Измерение исходящей скорости',
		'Not available': 'Нет данных',
		'Ping': 'Пинг',
		'Probe servers': 'Probe-серверы',
		'Ready': 'Готов',
		'Ready to test': 'Готов к тесту',
		'Refresh status': 'Обновить статус',
		'Result': 'Результат',
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
		'Upload': 'Загрузка',
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

function hasValue(value) {
	return value !== null && value !== undefined && value !== '' && value !== 'null';
}

function metricNumber(value) {
	var number = parseFloat(value);
	if (isNaN(number))
		return '--';

	return number.toFixed(2).replace(/\.00$/, '');
}

function hasResult(data) {
	return !!(data && (hasValue(data.download_mbps) || hasValue(data.upload_mbps) || hasValue(data.ping_ms)));
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

function runningPercent(data) {
	var elapsed = runningElapsed(data);
	var estimate = runningEstimate(data);

	if (estimate <= 0)
		return 0;

	return Math.min(98, Math.round((elapsed / estimate) * 100));
}

function runningPhaseCode(data, elapsed) {
	var downloadTime = numericValue(data ? data.download_time : null, 10);
	var uploadTime = data && Number(data.upload_enabled) === 0 ? 0 : numericValue(data ? data.upload_time : null, 10);

	if (elapsed < 5)
		return 'ping';

	if (elapsed < 5 + downloadTime)
		return 'download';

	if (uploadTime > 0 && elapsed < 5 + downloadTime + uploadTime)
		return 'upload';

	return 'finish';
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

function gaugeProgress(data) {
	if (data && data.running)
		return runningPercent(data);

	if (data && hasValue(data.download_mbps))
		return Math.min(100, Math.round(parseFloat(data.download_mbps) / 10));

	return 0;
}

function gaugeStateText(data) {
	if (data && data.running)
		return T('Speed test in progress');

	if (hasResult(data))
		return T('Result');

	return T('Ready to test');
}

function gaugeMainValue(data) {
	if (data && data.running)
		return String(runningPercent(data));

	if (data && hasValue(data.download_mbps))
		return metricNumber(data.download_mbps);

	return '--';
}

function gaugeMainUnit(data) {
	if (data && data.running)
		return '%';

	if (data && hasValue(data.download_mbps))
		return T('Mbps');

	return '';
}

function renderProgress(data) {
	var elapsed = runningElapsed(data);
	var percent = runningPercent(data);

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

function stagePill(id, label, phase) {
	var className = 'yandex-internetometer-stage-pill';
	if (phase === id)
		className += ' is-active';
	else if (phase === 'finish')
		className += ' is-done';

	return E('div', { 'class': className }, label);
}

function renderStagePills(data) {
	var phase = 'ready';

	if (data && data.running)
		phase = runningPhaseCode(data, runningElapsed(data));
	else if (hasResult(data))
		phase = 'finish';

	return E('div', { 'class': 'yandex-internetometer-stages' }, [
		stagePill('ping', T('Ping'), phase),
		stagePill('download', T('Download'), phase),
		stagePill('upload', T('Upload'), phase),
		stagePill('finish', T('Complete'), phase)
	]);
}

function detailRow(label, value) {
	return E('div', { 'class': 'yandex-internetometer-detail-row' }, [
		E('span', {}, label),
		E('strong', {}, value)
	]);
}

function renderHero(data) {
	var progress = gaugeProgress(data);
	var arc = (progress * 0.75).toFixed(1) + '%';
	var needle = (-135 + (progress * 2.7)).toFixed(1) + 'deg';
	var elapsed = runningElapsed(data);
	var phaseText = data && data.running ? runningPhase(data, elapsed) : gaugeStateText(data);

	return E('div', { 'class': 'cbi-section yandex-internetometer-hero' }, [
		E('div', {
			'class': 'yandex-internetometer-gauge',
			'style': '--yi-arc:%s;--yi-needle:%s'.format(arc, needle)
		}, [
			E('div', { 'class': 'yandex-internetometer-needle' }),
			E('div', { 'class': 'yandex-internetometer-gauge-inner' }, [
				E('div', { 'class': 'yandex-internetometer-gauge-state' }, gaugeStateText(data)),
				E('div', { 'class': 'yandex-internetometer-gauge-value' }, gaugeMainValue(data)),
				E('div', { 'class': 'yandex-internetometer-gauge-unit' }, gaugeMainUnit(data)),
				E('div', { 'class': 'yandex-internetometer-gauge-phase' }, phaseText)
			])
		]),
		E('div', { 'class': 'yandex-internetometer-hero-side' }, [
			renderStagePills(data),
			E('div', { 'class': 'yandex-internetometer-feature-metrics' }, [
				E('div', { 'class': 'yandex-internetometer-feature-metric' }, [
					E('span', {}, T('Download speed')),
					E('strong', {}, emptyValue(data.download_mbps, T('Mbps')))
				]),
				E('div', { 'class': 'yandex-internetometer-feature-metric' }, [
					E('span', {}, T('Upload speed')),
					E('strong', {}, emptyValue(data.upload_mbps, T('Mbps')))
				])
			]),
			E('div', { 'class': 'yandex-internetometer-details' }, [
				detailRow(T('HTTP RTT'), emptyValue(data.ping_ms, T('ms'))),
				detailRow(T('Jitter'), emptyValue(data.jitter_ms, T('ms'))),
				detailRow(T('Streams'), emptyValue(data.streams)),
				detailRow(T('Probe servers'), emptyValue(data.probe_count)),
				detailRow(T('Server'), emptyValue(data.server)),
				detailRow(T('Last run'), emptyValue(data.timestamp))
			])
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

	children.push(renderHero(statusData));

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
					'.yandex-internetometer-page{--yi-panel:#181a20;--yi-panel-2:#20232b;--yi-border:rgba(148,154,170,.24);--yi-muted:#a8adba;--yi-text:#f4f1e8;--yi-yellow:#ffcc33;--yi-cyan:#48c7e8;--yi-red:#ff6b6b}',
					'.yandex-internetometer-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:14px 0 20px}',
					'.yandex-internetometer-actions .cbi-button{min-height:38px;border-radius:999px;padding:8px 18px}',
					'.yandex-internetometer-actions .cbi-button-action{font-weight:700;background:var(--yi-yellow);border-color:var(--yi-yellow);color:#25200f}',
					'.yandex-internetometer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0 22px}',
					'.yandex-internetometer-card{margin:0;padding:12px}',
					'.yandex-internetometer-card-title{font-size:12px;color:var(--text-color-medium);margin-bottom:6px}',
					'.yandex-internetometer-card-value{font-size:20px;font-weight:600;line-height:1.25;overflow-wrap:anywhere}',
					'.yandex-internetometer-hero{display:grid;grid-template-columns:minmax(240px,360px) minmax(0,1fr);gap:28px;align-items:center;margin:12px 0 18px;padding:24px;border-radius:18px;background:linear-gradient(135deg,var(--yi-panel),#151820 70%,#191b22);border:1px solid var(--yi-border);color:var(--yi-text);overflow:hidden}',
					'.yandex-internetometer-gauge{position:relative;width:min(320px,76vw);aspect-ratio:1;margin:0 auto;border-radius:50%;display:grid;place-items:center;background:conic-gradient(from -135deg,var(--yi-yellow) 0 var(--yi-arc),rgba(148,154,170,.24) var(--yi-arc) 75%,transparent 75% 100%);box-shadow:0 18px 48px rgba(4,6,12,.28)}',
					'.yandex-internetometer-gauge:before{content:"";position:absolute;inset:12px;border-radius:50%;border:1px solid rgba(244,241,232,.12)}',
					'.yandex-internetometer-gauge-inner{position:relative;z-index:2;width:72%;height:72%;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:linear-gradient(180deg,#22252e,#151820);box-shadow:inset 0 0 0 1px rgba(244,241,232,.08),inset 0 18px 40px rgba(4,6,12,.26)}',
					'.yandex-internetometer-needle{position:absolute;z-index:1;left:50%;top:50%;width:3px;height:38%;border-radius:999px;background:var(--yi-yellow);transform-origin:50% 100%;transform:translate(-50%,-100%) rotate(var(--yi-needle));box-shadow:0 0 16px rgba(255,204,51,.45);transition:transform .45s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-gauge-state{max-width:82%;font-size:12px;text-transform:uppercase;color:var(--yi-muted);white-space:normal}',
					'.yandex-internetometer-gauge-value{font-size:clamp(44px,9vw,82px);line-height:.95;font-weight:800;color:var(--yi-text);font-variant-numeric:tabular-nums;margin-top:8px}',
					'.yandex-internetometer-gauge-unit{min-height:22px;font-size:15px;font-weight:700;color:var(--yi-yellow);margin-top:8px}',
					'.yandex-internetometer-gauge-phase{max-width:84%;min-height:34px;font-size:13px;line-height:1.3;color:var(--yi-muted);margin-top:10px}',
					'.yandex-internetometer-hero-side{min-width:0}',
					'.yandex-internetometer-stages{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:16px}',
					'.yandex-internetometer-stage-pill{border:1px solid rgba(148,154,170,.22);border-radius:999px;padding:8px 10px;text-align:center;font-size:12px;color:var(--yi-muted);background:rgba(244,241,232,.04);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
					'.yandex-internetometer-stage-pill.is-active{border-color:rgba(255,204,51,.78);color:var(--yi-text);background:rgba(255,204,51,.14);box-shadow:0 0 0 3px rgba(255,204,51,.08)}',
					'.yandex-internetometer-stage-pill.is-done{border-color:rgba(72,199,232,.52);color:var(--yi-text);background:rgba(72,199,232,.10)}',
					'.yandex-internetometer-feature-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:14px}',
					'.yandex-internetometer-feature-metric{padding:14px 16px;border-radius:14px;background:rgba(244,241,232,.055);border:1px solid rgba(148,154,170,.18)}',
					'.yandex-internetometer-feature-metric span{display:block;font-size:12px;color:var(--yi-muted);margin-bottom:6px}',
					'.yandex-internetometer-feature-metric strong{display:block;font-size:clamp(24px,4vw,38px);line-height:1.08;color:var(--yi-text);overflow-wrap:anywhere}',
					'.yandex-internetometer-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;border-radius:14px;overflow:hidden;border:1px solid rgba(148,154,170,.18);background:rgba(148,154,170,.16)}',
					'.yandex-internetometer-detail-row{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;background:rgba(24,26,32,.92);min-width:0}',
					'.yandex-internetometer-detail-row span{font-size:12px;color:var(--yi-muted);white-space:nowrap}',
					'.yandex-internetometer-detail-row strong{font-size:13px;color:var(--yi-text);font-weight:700;text-align:right;overflow-wrap:anywhere;min-width:0}',
					'.yandex-internetometer-progress{padding:16px;margin:12px 0 18px}',
					'.yandex-internetometer-progress-head{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}',
					'.yandex-internetometer-progress-sub{color:var(--text-color-medium);font-size:13px;margin-top:3px}',
					'.yandex-internetometer-progress-time{color:var(--text-color-medium);font-size:13px}',
					'.yandex-internetometer-progress-track{height:10px;border-radius:999px;background:rgba(127,127,127,.18);overflow:hidden}',
					'.yandex-internetometer-progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#ff6b6b,#ffd166,#4cc9f0);background-size:180% 100%;animation:yandexInternetometerFlow 1.1s linear infinite;transition:width .35s ease}',
					'.yandex-internetometer-running-dot{width:12px;height:12px;border-radius:50%;background:#ff6b6b;box-shadow:0 0 0 0 rgba(255,107,107,.55);animation:yandexInternetometerPulse 1.2s ease-out infinite;flex:0 0 auto}',
					'@media (max-width:780px){.yandex-internetometer-hero{grid-template-columns:1fr;padding:18px;gap:18px}.yandex-internetometer-feature-metrics,.yandex-internetometer-details{grid-template-columns:1fr}.yandex-internetometer-stages{grid-template-columns:repeat(2,minmax(0,1fr))}.yandex-internetometer-detail-row span{white-space:normal}}',
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
