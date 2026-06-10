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
var statusLayoutKey = null;
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
		'Incoming': 'Входящая',
		'Jitter': 'Джиттер',
		'Last run': 'Последний запуск',
		'Latency': 'Задержка',
		'Latency sample count': 'Количество замеров задержки',
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
		'Outgoing': 'Исходящая',
		'Ping samples': 'Замеров задержки',
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
			latency_samples: null,
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

function detailValues(data) {
	return [
		emptyValue(data.jitter_ms, T('ms')),
		emptyValue(data.latency_samples),
		emptyValue(data.streams),
		emptyValue(data.probe_count),
		emptyValue(data.server),
		emptyValue(data.timestamp)
	];
}

function renderSpeedometerSvg(progress, running) {
	var ticks = [];
	var total = 154;
	var left = 34;
	var right = 923;
	var top = 38;
	var bottom = 354;
	var cy = 196;
	var rx = 174;
	var ry = 158;
	var leftCx = left + rx;
	var rightCx = right - rx;
	var straight = rightCx - leftCx;
	var arc = Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
	var perimeter = straight * 2 + arc * 2;
	var outerOffset = 0;
	var i, d, segment, t, x2, y2, nx, ny, major, length, x1, y1, className;
	var progressValue = Math.max(0, Math.min(100, progress));

	for (i = 0; i < total; i++) {
		d = perimeter * i / total;
		major = i % 24 === 0 || i === 77;
		length = major ? 45 : 30;

		if (d < straight) {
			t = d / straight;
			x2 = leftCx + straight * t;
			y2 = top + outerOffset;
			nx = 0;
			ny = 1;
		}
		else if (d < straight + arc) {
			segment = (d - straight) / arc;
			t = -Math.PI / 2 + Math.PI * segment;
			x2 = rightCx + rx * Math.cos(t);
			y2 = cy + ry * Math.sin(t);
			nx = -Math.cos(t);
			ny = -Math.sin(t);
		}
		else if (d < straight * 2 + arc) {
			segment = (d - straight - arc) / straight;
			x2 = rightCx - straight * segment;
			y2 = bottom - outerOffset;
			nx = 0;
			ny = -1;
		}
		else {
			segment = (d - straight * 2 - arc) / arc;
			t = Math.PI / 2 + Math.PI * segment;
			x2 = leftCx + rx * Math.cos(t);
			y2 = cy + ry * Math.sin(t);
			nx = -Math.cos(t);
			ny = -Math.sin(t);
		}

		if (y2 === bottom && x2 > 382 && x2 < 575)
			continue;

		x1 = x2 + nx * length;
		y1 = y2 + ny * length;
		className = 'yandex-internetometer-svg-tick' + (major ? ' is-major' : '');

		ticks.push(E('line', {
			'class': className,
			'style': '--i:%s'.format(i),
			'x1': x1.toFixed(2),
			'y1': y1.toFixed(2),
			'x2': x2.toFixed(2),
			'y2': y2.toFixed(2)
		}));
	}

	return E('svg', {
		'class': 'yandex-internetometer-speedometer-svg' + (running ? ' is-running' : ''),
		'viewBox': '0 0 957 392',
		'role': 'img',
		'aria-label': T('Yandex Internetometer')
	}, [
		running ? E('path', {
			'class': 'yandex-internetometer-progress-path',
			'd': 'M 208 18 H 749 A 174 178 0 0 1 749 374 H 208 A 174 178 0 0 1 208 18',
			'pathLength': '100',
			'style': 'stroke-dasharray:%s 100'.format(progressValue)
		}) : '',
		E('g', { 'class': 'yandex-internetometer-svg-ticks' }, ticks),
		E('text', { 'class': 'yandex-internetometer-svg-label is-top', 'x': '478.5', 'y': '92', 'text-anchor': 'middle' }, '100'),
		E('text', { 'class': 'yandex-internetometer-svg-label is-zero', 'x': '356', 'y': '374', 'text-anchor': 'middle' }, '0'),
		E('text', { 'class': 'yandex-internetometer-svg-label is-max', 'x': '604', 'y': '374', 'text-anchor': 'middle' }, '1000')
	]);
}

function speedMetric(className, label, icon, value, unit, active) {
	return E('div', { 'class': 'yandex-internetometer-speed-metric %s%s'.format(className, active ? ' is-active' : '') }, [
		E('div', { 'class': 'yandex-internetometer-speed-label' }, [
			E('span', {}, label),
			E('b', {}, icon)
		]),
		E('div', { 'class': 'yandex-internetometer-speed-value' }, value),
		E('div', { 'class': 'yandex-internetometer-speed-unit' }, unit)
	]);
}

function startTest() {
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

function renderHero(data) {
	var progress = gaugeProgress(data);
	var elapsed = runningElapsed(data);
	var phaseText = data && data.running ? runningPhase(data, elapsed) : gaugeStateText(data);
	var phase = activePhase(data);
	var runningClass = data && data.running ? ' is-running' : '';
	var readyClass = !data.running && !hasResult(data) ? ' is-ready' : '';
	var tickProgress = Math.max(0, Math.min(100, progress));

	return E('div', {
		'class': 'cbi-section yandex-internetometer-hero' + runningClass + readyClass,
		'style': '--yi-progress:%s%%'.format(tickProgress)
	}, [
		E('div', { 'class': 'yandex-internetometer-brandline' }, [
			E('strong', {}, T('Yandex Internetometer')),
			E('span', { 'class': 'yandex-internetometer-phase-text' }, phaseText)
		]),
		E('div', { 'class': 'yandex-internetometer-oval' }, [
			renderSpeedometerSvg(tickProgress, !!data.running),
			!data.running && !hasResult(data) ? E('button', {
				'type': 'button',
				'class': 'yandex-internetometer-measure-button',
				'click': startTest
			}, 'Измерить') : E('div', { 'class': 'yandex-internetometer-speed-grid' }, [
				speedMetric('is-download', T('Incoming'), '↓', hasValue(data.download_mbps) ? metricNumber(data.download_mbps) : '--', T('Mbps'), phase === 'download'),
				speedMetric('is-upload', T('Outgoing'), '↑', hasValue(data.upload_mbps) ? metricNumber(data.upload_mbps) : '--', T('Mbps'), phase === 'upload'),
				speedMetric('is-ping', T('Latency'), '', hasValue(data.ping_ms) ? metricNumber(data.ping_ms) : '--', T('ms'), phase === 'ping' || phase === 'prepare')
			])
		]),
		data.running ? E('div', { 'class': 'yandex-internetometer-measure-progress' }, [
			E('div', { 'class': 'yandex-internetometer-measure-bars' }, [
				E('span', { 'style': 'width:%s%%'.format(tickProgress) }),
				E('span'),
				E('span')
			]),
			E('div', { 'class': 'yandex-internetometer-measure-row' }, [
				E('strong', {}, '%s%%'.format(tickProgress)),
				E('span', {}, phaseText),
				E('button', {
					'type': 'button',
					'class': 'yandex-internetometer-inline-stop',
					'click': function() {
						localStartedAt = null;
						return statusCall('stop').then(renderStatus);
					}
				}, '×')
			])
		]) : '',
		E('div', { 'class': 'yandex-internetometer-details' }, [
			detailRow(T('Jitter'), detailValues(data)[0]),
			detailRow(T('Ping samples'), detailValues(data)[1]),
			detailRow(T('Streams'), detailValues(data)[2]),
			detailRow(T('Probe servers'), detailValues(data)[3]),
			detailRow(T('Server'), detailValues(data)[4]),
			detailRow(T('Last run'), detailValues(data)[5])
		])
	]);
}

function renderStatusKey(data) {
	if (data && data.error)
		return 'error';

	if (data && data.running)
		return 'running';

	if (hasResult(data))
		return 'result';

	return 'ready';
}

function updateSpeedometerTicks(node, data) {
	var svg = node.querySelector('.yandex-internetometer-speedometer-svg');
	var progressPath, progress;

	if (!svg)
		return;

	progress = Math.max(0, Math.min(100, gaugeProgress(data)));
	svg.className.baseVal = 'yandex-internetometer-speedometer-svg' + (data && data.running ? ' is-running' : '');

	progressPath = svg.querySelector('.yandex-internetometer-progress-path');
	if (progressPath)
		progressPath.setAttribute('style', 'stroke-dasharray:%s 100'.format(progress));
}

function updateMetricNode(node, selector, value, active) {
	var metric = node.querySelector(selector);
	var valueNode;

	if (!metric)
		return;

	valueNode = metric.querySelector('.yandex-internetometer-speed-value');
	if (valueNode && valueNode.textContent !== value)
		valueNode.textContent = value;

	if (active)
		metric.classList.add('is-active');
	else
		metric.classList.remove('is-active');
}

function updateStatusInPlace(data) {
	var phaseTextNode, phase, values, rows, i, strongNode, tickProgress, progressNode, progressFill;

	if (!statusBox || !statusBox.firstElementChild)
		return false;

	phase = activePhase(data);
	phaseTextNode = statusBox.querySelector('.yandex-internetometer-phase-text');
	if (phaseTextNode)
		phaseTextNode.textContent = data && data.running ? runningPhase(data, runningElapsed(data)) : gaugeStateText(data);

	tickProgress = Math.max(0, Math.min(100, gaugeProgress(data)));
	progressNode = statusBox.querySelector('.yandex-internetometer-measure-progress');
	if (progressNode) {
		progressFill = progressNode.querySelector('.yandex-internetometer-measure-bars span:first-child');
		if (progressFill)
			progressFill.style.width = '%s%%'.format(tickProgress);
		strongNode = progressNode.querySelector('.yandex-internetometer-measure-row strong');
		if (strongNode)
			strongNode.textContent = '%s%%'.format(tickProgress);
		phaseTextNode = progressNode.querySelector('.yandex-internetometer-measure-row span');
		if (phaseTextNode)
			phaseTextNode.textContent = data && data.running ? runningPhase(data, runningElapsed(data)) : gaugeStateText(data);
	}

	updateSpeedometerTicks(statusBox, data);
	updateMetricNode(statusBox, '.yandex-internetometer-speed-metric.is-download', hasValue(data.download_mbps) ? metricNumber(data.download_mbps) : '--', phase === 'download');
	updateMetricNode(statusBox, '.yandex-internetometer-speed-metric.is-upload', hasValue(data.upload_mbps) ? metricNumber(data.upload_mbps) : '--', phase === 'upload');
	updateMetricNode(statusBox, '.yandex-internetometer-speed-metric.is-ping', hasValue(data.ping_ms) ? metricNumber(data.ping_ms) : '--', phase === 'ping' || phase === 'prepare');

	values = detailValues(data);
	rows = statusBox.querySelectorAll('.yandex-internetometer-detail-row');
	for (i = 0; i < rows.length && i < values.length; i++) {
		strongNode = rows[i].querySelector('strong');
		if (strongNode && strongNode.textContent !== values[i])
			strongNode.textContent = values[i];
	}

	return true;
}

function renderStatus(data) {
	var nextLayoutKey;

	statusData = data || {};
	if (!statusData.running)
		localStartedAt = null;

	nextLayoutKey = renderStatusKey(statusData);
	if (statusLayoutKey === nextLayoutKey && nextLayoutKey !== 'error' && updateStatusInPlace(statusData))
		return;

	statusLayoutKey = nextLayoutKey;

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

	if (statusData && (statusData.running || hasResult(statusData))) {
		actionBox.appendChild(E('button', {
			'type': 'button',
			'class': 'btn cbi-button cbi-button-action',
			'click': startTest
		}, hasResult(statusData) ? T('Run again') : T('Start test')));
	}

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

		o = s.option(form.Value, 'latency_samples', T('Latency sample count'));
		o.datatype = 'range(10, 50)';
		o.rmempty = false;

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
					'.yandex-internetometer-page{--yi-bg:#fbfaf8;--yi-panel:#f0efec;--yi-border:rgba(35,35,35,.12);--yi-muted:#6f6f6f;--yi-text:#252528;--yi-red:#ff5138;--yi-red-soft:rgba(255,81,56,.12);--yi-green:#20a464;font-family:"YS Text",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}',
					'.yandex-internetometer-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:10px 0 18px}',
					'.yandex-internetometer-actions .cbi-button{min-height:40px;border-radius:10px;padding:8px 16px;transition:background-color .18s cubic-bezier(.22,1,.36,1),border-color .18s cubic-bezier(.22,1,.36,1),transform .18s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-actions .cbi-button:hover{transform:translateY(-1px)}',
					'.yandex-internetometer-actions .cbi-button-action{font-weight:700;background:#fcdb32;border-color:#fcdb32;color:#242424}',
					'.yandex-internetometer-hero{display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;gap:16px;margin:10px 0 18px;padding:10px 10px 18px;background:var(--yi-bg);color:var(--yi-text);overflow:hidden}',
					'.yandex-internetometer-brandline{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;color:var(--yi-muted);font-size:13px}',
					'.yandex-internetometer-brandline strong{font-size:16px;color:var(--yi-text);font-weight:700}',
					'.yandex-internetometer-brandline span{text-align:right;overflow-wrap:anywhere}',
					'.yandex-internetometer-oval{position:relative;width:min(957px,100%);aspect-ratio:957/392;margin:0 auto;display:grid;place-items:center}',
					'.yandex-internetometer-speedometer-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
					'.yandex-internetometer-progress-path{fill:none;stroke:var(--yi-red);stroke-width:8;stroke-linecap:butt;opacity:1;transition:stroke-dasharray .55s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-svg-tick{stroke:var(--yi-red);stroke-width:3.2;stroke-linecap:square;opacity:.98;transform-box:fill-box;transform-origin:center;transition:opacity .28s cubic-bezier(.22,1,.36,1),stroke-width .28s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-svg-tick.is-major{stroke-width:3.7}',
					'.yandex-internetometer-svg-label{fill:var(--yi-red);font-size:24px;font-weight:500;dominant-baseline:middle}',
					'.yandex-internetometer-measure-button{position:relative;z-index:3;border:0;background:transparent;color:var(--yi-text);font-size:64px;line-height:1;font-weight:400;cursor:pointer;box-shadow:none;transition:color .15s linear}',
					'.yandex-internetometer-measure-button:hover{color:rgba(255,81,56,.85)}',
					'.yandex-internetometer-speed-grid{position:absolute;z-index:2;inset:0}',
					'.yandex-internetometer-speed-metric{position:absolute;top:52%;width:213px;text-align:center;min-width:0;transform:translate(-50%,-50%);transition:transform .3s cubic-bezier(.22,1,.36,1),opacity .3s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-speed-metric.is-download{left:24%}',
					'.yandex-internetometer-speed-metric.is-upload{left:50%}',
					'.yandex-internetometer-speed-metric.is-ping{left:76%}',
					'.yandex-internetometer-speed-metric.is-active{transform:translate(-50%,calc(-50% - 4px))}',
					'.yandex-internetometer-speed-label{display:flex;align-items:center;justify-content:center;gap:6px;font-size:17px;line-height:1.2;color:var(--yi-text);font-weight:500;white-space:nowrap}',
					'.yandex-internetometer-speed-label b{display:inline-grid;place-items:center;width:14px;height:14px;border-radius:50%;background:var(--yi-text);color:var(--yi-bg);font-size:10px;line-height:1;font-weight:800}',
					'.yandex-internetometer-speed-label b:empty{display:none}',
					'.yandex-internetometer-speed-value{font-size:64px;line-height:1;font-weight:400;color:var(--yi-text);font-variant-numeric:tabular-nums;letter-spacing:0;margin:8px 0;transition:opacity .2s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-hero.is-running .yandex-internetometer-speed-value{color:rgba(0,0,0,.3)}',
					'.yandex-internetometer-hero.is-running .yandex-internetometer-speed-metric.is-active .yandex-internetometer-speed-value{color:var(--yi-red)}',
					'.yandex-internetometer-speed-unit{font-size:17px;line-height:1.2;font-weight:500;color:var(--yi-text)}',
					'.yandex-internetometer-measure-progress{width:min(330px,80%);margin:-8px auto 10px;color:var(--yi-text)}',
					'.yandex-internetometer-measure-bars{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;height:4px;margin-bottom:12px}',
					'.yandex-internetometer-measure-bars span{display:block;background:rgba(0,0,0,.06);overflow:hidden}',
					'.yandex-internetometer-measure-bars span:first-child{background:var(--yi-text);transition:width .55s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-measure-row{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;font-size:16px;line-height:1.2}',
					'.yandex-internetometer-measure-row strong{font-size:16px;font-weight:400}',
					'.yandex-internetometer-measure-row span{font-size:16px;font-weight:400;white-space:nowrap}',
					'.yandex-internetometer-inline-stop{border:0;background:transparent;color:var(--yi-text);font-size:24px;line-height:1;cursor:pointer;padding:0 4px}',
					'.yandex-internetometer-stages{width:min(720px,100%);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
					'.yandex-internetometer-stage-pill{display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--yi-border);border-radius:8px;padding:8px 9px;text-align:center;font-size:12px;color:var(--yi-muted);background:rgba(255,255,255,.54);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:background-color .2s cubic-bezier(.22,1,.36,1),border-color .2s cubic-bezier(.22,1,.36,1),color .2s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-stage-dot{width:7px;height:7px;border-radius:50%;background:rgba(35,35,35,.22);flex:0 0 auto}',
					'.yandex-internetometer-stage-pill.is-active{border-color:rgba(255,75,62,.5);color:var(--yi-text);background:var(--yi-red-soft)}',
					'.yandex-internetometer-stage-pill.is-active .yandex-internetometer-stage-dot{background:var(--yi-red);box-shadow:0 0 0 4px rgba(255,75,62,.12)}',
					'.yandex-internetometer-stage-pill.is-done{color:var(--yi-text)}',
					'.yandex-internetometer-stage-pill.is-done .yandex-internetometer-stage-dot{background:var(--yi-green)}',
					'.yandex-internetometer-details{width:min(720px,100%);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border:1px solid var(--yi-border);border-radius:8px;overflow:hidden;background:rgba(255,255,255,.5)}',
					'.yandex-internetometer-hero.is-ready .yandex-internetometer-details{display:none}',
					'.yandex-internetometer-detail-row{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;background:rgba(255,255,255,.58);min-width:0;border-bottom:1px solid var(--yi-border)}',
					'.yandex-internetometer-detail-row:nth-last-child(-n+2){border-bottom:0}',
					'.yandex-internetometer-detail-row span{font-size:12px;color:var(--yi-muted);white-space:nowrap}',
					'.yandex-internetometer-detail-row strong{font-size:13px;color:var(--yi-text);font-weight:600;text-align:right;overflow-wrap:anywhere;min-width:0}',
					'@media (max-width:900px){.yandex-internetometer-speed-metric{width:160px}.yandex-internetometer-speed-label{font-size:17px}.yandex-internetometer-speed-value{font-size:48px}.yandex-internetometer-speed-unit{font-size:17px}.yandex-internetometer-svg-label{font-size:22px}.yandex-internetometer-svg-tick{stroke-width:3}.yandex-internetometer-svg-tick.is-major{stroke-width:3.4}}',
					'@media (max-width:680px){.yandex-internetometer-hero{padding:16px 4px}.yandex-internetometer-brandline{align-items:flex-start;flex-direction:column;gap:6px}.yandex-internetometer-brandline span{text-align:left}.yandex-internetometer-oval{aspect-ratio:1.28/1;overflow:hidden}.yandex-internetometer-speedometer-svg{width:190%;height:100%;left:-45%;right:auto}.yandex-internetometer-speed-metric{top:auto;width:213px;transform:translateX(-50%)}.yandex-internetometer-speed-metric.is-download{left:50%;top:24%}.yandex-internetometer-speed-metric.is-upload{left:50%;top:48%}.yandex-internetometer-speed-metric.is-ping{left:50%;top:72%}.yandex-internetometer-speed-metric.is-active{transform:translateX(-50%)}.yandex-internetometer-speed-label{font-size:15px}.yandex-internetometer-speed-value{font-size:32px;margin:4px 0}.yandex-internetometer-speed-unit{font-size:15px}.yandex-internetometer-svg-label{display:none}.yandex-internetometer-stages,.yandex-internetometer-details{grid-template-columns:1fr}.yandex-internetometer-detail-row:nth-last-child(-n+2){border-bottom:1px solid var(--yi-border)}.yandex-internetometer-detail-row:last-child{border-bottom:0}.yandex-internetometer-detail-row span{white-space:normal}}',
				].join('')),
				E('h2', {}, T('Yandex Internetometer')),
				E('p', {}, T('Unofficial Yandex Internetometer-compatible speed test using Yandex probe servers. This is not official Yandex software.')),
				statusBox,
				actionBox,
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
