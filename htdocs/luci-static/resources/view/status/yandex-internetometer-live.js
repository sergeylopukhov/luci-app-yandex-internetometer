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
var lastGaugeProgress = null;
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
		'Preparing test': 'Подготовка теста',
		'Probe servers': 'Probe-серверы',
		'Ready': 'Готов',
		'Ready to test': 'Готов к тесту',
		'Refresh status': 'Обновить статус',
		'Result': 'Результат',
		'Run again': 'Измерить ещё раз',
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
var appLanguage = readStoredLanguage() || 'ru';

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
			phase: null,
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

function runningPhaseCode(data, elapsed) {
	if (data && data.phase)
		return data.phase;

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
	if (data && data.phase === 'prepare')
		return T('Preparing test');

	if (data && data.phase === 'ping')
		return T('Checking latency');

	if (data && data.phase === 'download')
		return T('Measuring download speed');

	if (data && data.phase === 'upload')
		return T('Measuring upload speed');

	if (data && data.phase === 'complete')
		return T('Complete');

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

function activePhase(data) {
	if (data && data.phase)
		return data.phase;

	if (data && data.running)
		return runningPhaseCode(data, runningElapsed(data));

	if (hasResult(data))
		return 'complete';

	return 'ready';
}

function activeMetric(data) {
	var phase = activePhase(data);

	if (phase === 'ping' || phase === 'prepare') {
		return {
			label: T('Ping'),
			value: hasValue(data.ping_ms) ? metricNumber(data.ping_ms) : '--',
			unit: T('ms')
		};
	}

	if (phase === 'upload') {
		return {
			label: T('Upload speed'),
			value: hasValue(data.upload_mbps) ? metricNumber(data.upload_mbps) : '--',
			unit: T('Mbps')
		};
	}

	return {
		label: T('Download speed'),
		value: hasValue(data.download_mbps) ? metricNumber(data.download_mbps) : '--',
		unit: hasValue(data.download_mbps) || data.running ? T('Mbps') : ''
	};
}

function gaugeProgress(data) {
	var phase = activePhase(data);
	var value = 0;

	if (phase === 'ping' || phase === 'prepare') {
		if (!hasValue(data.ping_ms))
			return 0;

		value = parseFloat(data.ping_ms);
		if (isNaN(value))
			return 0;

		return Math.max(5, Math.min(100, Math.round(100 - value)));
	}

	if (phase === 'upload')
		value = parseFloat(data.upload_mbps);
	else
		value = parseFloat(data.download_mbps);

	if (isNaN(value))
		return 0;

	return Math.min(100, Math.round(value / 10));
}

function gaugeStateText(data) {
	if (data && data.running)
		return T('Speed test in progress');

	if (hasResult(data))
		return T('Result');

	return T('Ready to test');
}

function gaugeMainValue(data) {
	return activeMetric(data).value;
}

function gaugeMainUnit(data) {
	return activeMetric(data).unit;
}

function stagePill(id, label, phase) {
	var className = 'yandex-internetometer-stage-pill';
	if (phase === id)
		className += ' is-active';
	else if (phase === 'complete' || (phase === 'upload' && (id === 'ping' || id === 'download')) || (phase === 'download' && id === 'ping'))
		className += ' is-done';

	return E('div', { 'class': className }, [
		E('span', { 'class': 'yandex-internetometer-stage-dot' }),
		E('span', {}, label)
	]);
}

function renderStagePills(data) {
	var phase = activePhase(data);

	return E('div', { 'class': 'yandex-internetometer-stages' }, [
		stagePill('ping', T('Ping'), phase),
		stagePill('download', T('Download'), phase),
		stagePill('upload', T('Upload'), phase),
		stagePill('complete', T('Complete'), phase)
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
	var sweep = Math.max(0, Math.min(100, progress)).toFixed(1) + '%';
	var needleFrom = (-135 + ((lastGaugeProgress === null ? progress : lastGaugeProgress) * 2.7)).toFixed(1) + 'deg';
	var needle = (-135 + (progress * 2.7)).toFixed(1) + 'deg';
	var elapsed = runningElapsed(data);
	var phaseText = data && data.running ? runningPhase(data, elapsed) : gaugeStateText(data);
	var metric = activeMetric(data);
	var runningClass = data && data.running ? ' is-running' : '';
	lastGaugeProgress = progress;

	return E('div', { 'class': 'cbi-section yandex-internetometer-hero' + runningClass }, [
		E('div', { 'class': 'yandex-internetometer-brandline' }, [
			E('strong', {}, T('Yandex Internetometer')),
			E('span', {}, phaseText)
		]),
		E('div', {
			'class': 'yandex-internetometer-gauge',
			'style': '--yi-sweep:%s;--yi-needle-from:%s;--yi-needle:%s'.format(sweep, needleFrom, needle)
		}, [
			E('div', { 'class': 'yandex-internetometer-gauge-ring' }),
			E('div', { 'class': 'yandex-internetometer-needle' }),
			E('div', { 'class': 'yandex-internetometer-gauge-inner' }, [
				E('div', { 'class': 'yandex-internetometer-gauge-state' }, metric.label),
				E('div', { 'class': 'yandex-internetometer-gauge-value' }, metric.value),
				E('div', { 'class': 'yandex-internetometer-gauge-unit' }, metric.unit)
			])
		]),
		renderStagePills(data),
		E('div', { 'class': 'yandex-internetometer-result-strip' }, [
			E('div', { 'class': 'yandex-internetometer-result-item' }, [
				E('span', {}, T('Download speed')),
				E('strong', {}, emptyValue(data.download_mbps, T('Mbps')))
			]),
			E('div', { 'class': 'yandex-internetometer-result-item' }, [
				E('span', {}, T('Upload speed')),
				E('strong', {}, emptyValue(data.upload_mbps, T('Mbps')))
			]),
			E('div', { 'class': 'yandex-internetometer-result-item' }, [
				E('span', {}, T('Ping')),
				E('strong', {}, emptyValue(data.ping_ms, T('ms')))
			])
		]),
		E('div', { 'class': 'yandex-internetometer-details' }, [
			detailRow(T('Jitter'), emptyValue(data.jitter_ms, T('ms'))),
			detailRow(T('Streams'), emptyValue(data.streams)),
			detailRow(T('Probe servers'), emptyValue(data.probe_count)),
			detailRow(T('Server'), emptyValue(data.server)),
			detailRow(T('Last run'), emptyValue(data.timestamp))
		])
	]);
}

function renderStatus(data) {
	statusData = data || {};
	if (!statusData.running)
		localStartedAt = null;

	var children = [];

	if (statusData.error) {
		children.push(E('div', { 'class': 'alert-message warning' }, statusData.error));
	}

	children.push(renderHero(statusData));

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
				phase: 'prepare',
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
	}, hasResult(statusData) ? T('Run again') : T('Start test')));

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
					'.yandex-internetometer-page{--yi-bg:#151515;--yi-panel:#1f1f1f;--yi-panel-soft:#292929;--yi-border:rgba(235,235,235,.12);--yi-muted:#aaa6a0;--yi-text:#f4f1ec;--yi-yellow:#ffcc00;--yi-yellow-soft:rgba(255,204,0,.18);--yi-green:#45c776;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}',
					'.yandex-internetometer-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:10px 0 18px}',
					'.yandex-internetometer-actions .cbi-button{min-height:40px;border-radius:10px;padding:8px 16px;transition:background-color .18s cubic-bezier(.22,1,.36,1),border-color .18s cubic-bezier(.22,1,.36,1),transform .18s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-actions .cbi-button:hover{transform:translateY(-1px)}',
					'.yandex-internetometer-actions .cbi-button-action{font-weight:700;background:var(--yi-yellow);border-color:var(--yi-yellow);color:#25210a}',
					'.yandex-internetometer-hero{display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;gap:20px;margin:12px 0 18px;padding:28px 24px 24px;border-radius:20px;background:var(--yi-bg);border:1px solid var(--yi-border);color:var(--yi-text);overflow:hidden}',
					'.yandex-internetometer-brandline{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;color:var(--yi-muted);font-size:13px}',
					'.yandex-internetometer-brandline strong{font-size:16px;color:var(--yi-text);font-weight:700}',
					'.yandex-internetometer-brandline span{text-align:right;overflow-wrap:anywhere}',
					'.yandex-internetometer-gauge{position:relative;width:min(340px,72vw);aspect-ratio:1;margin:2px auto 0;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 50% 48%,#242424 0 48%,transparent 49%),conic-gradient(from -135deg,var(--yi-yellow) 0 var(--yi-sweep),rgba(235,235,235,.16) var(--yi-sweep) 75%,transparent 75% 100%);box-shadow:0 24px 60px rgba(0,0,0,.28)}',
					'.yandex-internetometer-gauge-ring{position:absolute;inset:10px;border-radius:50%;border:1px solid rgba(244,241,236,.1)}',
					'.yandex-internetometer-gauge:after{content:"";position:absolute;inset:24px;border-radius:50%;background:var(--yi-panel);box-shadow:inset 0 0 0 1px rgba(244,241,236,.08)}',
					'.yandex-internetometer-hero.is-running .yandex-internetometer-gauge-ring{animation:yi-soft-pulse 1.6s cubic-bezier(.22,1,.36,1) infinite}',
					'.yandex-internetometer-gauge-inner{position:relative;z-index:2;width:68%;height:68%;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}',
					'.yandex-internetometer-needle{position:absolute;z-index:3;left:50%;top:50%;width:2px;height:39%;border-radius:999px;background:var(--yi-yellow);transform-origin:50% 100%;transform:translate(-50%,-100%) rotate(var(--yi-needle));box-shadow:0 0 18px rgba(255,204,0,.38);animation:yi-needle .42s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-needle:after{content:"";position:absolute;left:50%;bottom:-7px;width:14px;height:14px;border-radius:50%;background:var(--yi-yellow);transform:translateX(-50%)}',
					'.yandex-internetometer-gauge-state{max-width:88%;font-size:13px;color:var(--yi-muted);white-space:normal}',
					'.yandex-internetometer-gauge-value{font-size:74px;line-height:.92;font-weight:700;color:var(--yi-text);font-variant-numeric:tabular-nums;margin-top:8px;letter-spacing:0}',
					'.yandex-internetometer-gauge-unit{min-height:22px;font-size:15px;font-weight:600;color:var(--yi-muted);margin-top:10px}',
					'.yandex-internetometer-stages{width:min(640px,100%);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
					'.yandex-internetometer-stage-pill{display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--yi-border);border-radius:10px;padding:8px 9px;text-align:center;font-size:12px;color:var(--yi-muted);background:var(--yi-panel);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:background-color .2s cubic-bezier(.22,1,.36,1),border-color .2s cubic-bezier(.22,1,.36,1),color .2s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-stage-dot{width:7px;height:7px;border-radius:50%;background:rgba(235,235,235,.24);flex:0 0 auto}',
					'.yandex-internetometer-stage-pill.is-active{border-color:rgba(255,204,0,.76);color:var(--yi-text);background:var(--yi-yellow-soft)}',
					'.yandex-internetometer-stage-pill.is-active .yandex-internetometer-stage-dot{background:var(--yi-yellow);box-shadow:0 0 0 4px rgba(255,204,0,.12)}',
					'.yandex-internetometer-stage-pill.is-done{color:var(--yi-text)}',
					'.yandex-internetometer-stage-pill.is-done .yandex-internetometer-stage-dot{background:var(--yi-green)}',
					'.yandex-internetometer-result-strip{width:min(720px,100%);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--yi-border);border-radius:14px;overflow:hidden;background:var(--yi-panel)}',
					'.yandex-internetometer-result-item{display:flex;flex-direction:column;gap:7px;padding:14px 16px;min-width:0;border-right:1px solid var(--yi-border)}',
					'.yandex-internetometer-result-item:last-child{border-right:0}',
					'.yandex-internetometer-result-item span{font-size:12px;color:var(--yi-muted)}',
					'.yandex-internetometer-result-item strong{font-size:22px;line-height:1.15;color:var(--yi-text);font-weight:700;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}',
					'.yandex-internetometer-details{width:min(720px,100%);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border:1px solid var(--yi-border);border-radius:14px;overflow:hidden;background:var(--yi-panel)}',
					'.yandex-internetometer-detail-row{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;background:var(--yi-panel);min-width:0;border-bottom:1px solid var(--yi-border)}',
					'.yandex-internetometer-detail-row:nth-last-child(-n+2){border-bottom:0}',
					'.yandex-internetometer-detail-row span{font-size:12px;color:var(--yi-muted);white-space:nowrap}',
					'.yandex-internetometer-detail-row strong{font-size:13px;color:var(--yi-text);font-weight:600;text-align:right;overflow-wrap:anywhere;min-width:0}',
					'@keyframes yi-needle{from{transform:translate(-50%,-100%) rotate(var(--yi-needle-from))}to{transform:translate(-50%,-100%) rotate(var(--yi-needle))}}',
					'@keyframes yi-soft-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,204,0,.14)}50%{box-shadow:0 0 0 10px rgba(255,204,0,0)}}',
					'@media (max-width:780px){.yandex-internetometer-hero{padding:20px 14px}.yandex-internetometer-brandline{align-items:flex-start;flex-direction:column;gap:6px}.yandex-internetometer-brandline span{text-align:left}.yandex-internetometer-gauge-value{font-size:58px}.yandex-internetometer-result-strip,.yandex-internetometer-details{grid-template-columns:1fr}.yandex-internetometer-result-item{border-right:0;border-bottom:1px solid var(--yi-border)}.yandex-internetometer-result-item:last-child{border-bottom:0}.yandex-internetometer-stages{grid-template-columns:repeat(2,minmax(0,1fr))}.yandex-internetometer-detail-row:nth-last-child(-n+2){border-bottom:1px solid var(--yi-border)}.yandex-internetometer-detail-row:last-child{border-bottom:0}.yandex-internetometer-detail-row span{white-space:normal}}',
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
