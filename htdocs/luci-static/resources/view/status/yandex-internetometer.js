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
var hasCurrentRunResult = false;
var statusLayoutKey = null;
var updateData = null;
var metricAnimationFrame = {};
var metricDisplayValue = {};
var languageStorageKey = 'yandexInternetometerLanguage';
var translations = {
	ru: {
		'Bytes per upload request. The payload is prepared in /tmp before measurement and is not stored on flash.': 'Байт на один исходящий запрос. Payload готовится в /tmp перед измерением и не сохраняется во flash.',
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
		'Measure': 'Измерить',
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
		'Router IP': 'IP роутера',
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
		'Upload stream count': 'Количество исходящих потоков',
		'Upload streams': 'Исходящие потоки',
		'Transfer protocol': 'Транспорт теста',
		'Transfer protocol mode': 'Режим транспорта',
		'HTTP fallback: router CPU/TLS may limit the result.': 'HTTP недоступен: результат может быть ограничен CPU/TLS роутера.',
		'Update available': 'Доступно обновление',
		'Installed version %s': 'Установлена версия %s',
		'Open release': 'Открыть выпуск',
		'Check for updates': 'Проверить обновление',
		'Unable to check updates. Check the connection and try again.': 'Не удалось проверить обновление. Проверьте подключение и попробуйте снова.',
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

function metricFloat(value) {
	var number = parseFloat(value);
	return isNaN(number) ? null : number;
}

function easeOutQuart(value) {
	return 1 - Math.pow(1 - value, 4);
}

function animateValue(key, target, duration, onFrame) {
	var start = metricDisplayValue[key];
	var startedAt = Date.now();

	if (target === null || target === undefined || isNaN(target)) {
		if (metricAnimationFrame[key])
			window.cancelAnimationFrame(metricAnimationFrame[key]);
		metricDisplayValue[key] = null;
		onFrame(null);
		return;
	}

	if (start === null || start === undefined || isNaN(start))
		start = target;

	if (metricAnimationFrame[key])
		window.cancelAnimationFrame(metricAnimationFrame[key]);

	function frame() {
		var elapsed = Date.now() - startedAt;
		var progress = Math.min(1, elapsed / duration);
		var value = start + (target - start) * easeOutQuart(progress);

		metricDisplayValue[key] = value;
		onFrame(value);

		if (progress < 1)
			metricAnimationFrame[key] = window.requestAnimationFrame(frame);
	}

	frame();
}

function hasResult(data) {
	return !!(data && (hasValue(data.download_mbps) || hasValue(data.upload_mbps) || hasValue(data.ping_ms)));
}

function hasVisibleResult(data) {
	return !!(data && (data.running || (hasCurrentRunResult && hasResult(data))));
}

function statusCall(command) {
	return fs.exec_direct('/usr/libexec/yandex-internetometer/' + command, [], 'json').catch(function(err) {
		if (err && String(err).indexOf('XHR request aborted') !== -1 && statusData)
			return statusData;

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
			upload_streams: null,
			latency_samples: null,
			download_time: null,
			upload_time: null,
			upload_enabled: 1,
			probe_count: 0,
			public_ip: null,
			server: null,
			error: err ? String(err) : T('Unable to execute backend command')
		};
	});
}

function updateCheck() {
	return fs.exec_direct('/usr/libexec/yandex-internetometer/update-check', [], 'json').then(function(data) {
		updateData = data || { ok: false };
		renderStatus(statusData);
		return updateData;
	}).catch(function() {
		updateData = { ok: false, manual: true };
		renderStatus(statusData);
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

	if (hasVisibleResult(data))
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
		return 0;
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

	if (hasVisibleResult(data))
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
		emptyValue(data.upload_streams),
		emptyValue(data.probe_count),
		emptyValue(data.server),
		emptyValue(data.timestamp),
		emptyValue(data.transfer_protocol),
		emptyValue(data.version)
	];
}

function renderUpdateNotice() {
	var release;
	if (!updateData)
		return null;
	if (!updateData.ok)
		return updateData.manual ? E('div', { 'class': 'alert-message warning' }, T('Unable to check updates. Check the connection and try again.')) : null;
	if (!updateData.update_available)
		return null;
	release = updateData.release || {};
	return E('div', { 'class': 'alert-message notice yandex-internetometer-update' }, [
		E('strong', {}, '%s %s'.format(T('Update available'), release.version || '')),
		E('span', {}, T('Installed version %s').format(updateData.installed_version || '')),
		E('a', { 'class': 'btn cbi-button', 'href': release.release_url || 'https://github.com/sergeylopukhov/luci-app-yandex-internetometer/releases/latest', 'target': '_blank', 'rel': 'noopener' }, T('Open release')),
		E('button', { 'class': 'btn cbi-button', 'click': updateCheck }, T('Check for updates'))
	]);
}

function svgNode(name, attrs, children) {
	var node = document.createElementNS('http://www.w3.org/2000/svg', name);
	var key;

	attrs = attrs || {};
	for (key in attrs) {
		if (attrs[key] !== null && attrs[key] !== undefined)
			node.setAttribute(key, attrs[key]);
	}

	if (children !== null && children !== undefined) {
		if (!Array.isArray(children))
			children = [children];

		children.forEach(function(child) {
			if (child === null || child === undefined || child === '')
				return;
			if (typeof child === 'string')
				node.appendChild(document.createTextNode(child));
			else
				node.appendChild(child);
		});
	}

	return node;
}

function renderSpeedometerSvg(progress, running) {
	var progressValue = Math.max(0, Math.min(100, progress));

	return E('div', { 'class': 'yandex-internetometer-speedometer-svg' + (running ? ' is-running' : '') }, [
		E('img', {
			'class': 'yandex-internetometer-speedometer-reference',
			'src': '/luci-static/resources/yandex-internetometer/speedometer.svg',
			'alt': ''
		}),
		running ? svgNode('svg', {
			'class': 'yandex-internetometer-progress-svg',
			'viewBox': '0 0 957 392',
			'aria-hidden': 'true'
		}, [
			svgNode('path', {
				'class': 'yandex-internetometer-progress-path',
				'd': 'M 350 382 H 205 A 198 186 0 0 1 205 10 H 752 A 198 186 0 0 1 752 382 H 615',
				'pathLength': '100',
				'style': 'stroke-dasharray:%s 100'.format(progressValue)
			})
		]) : ''
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

function renderSessionRow(data, phaseText) {
	var children = [
		E('span', { 'class': 'yandex-internetometer-router-ip' }, [
			E('span', {}, T('Router IP')),
			E('strong', {}, hasValue(data.public_ip) ? data.public_ip : '--')
		])
	];

	if (data && data.running) {
		children.push(E('span', { 'class': 'yandex-internetometer-session-phase' }, phaseText));
		children.push(E('button', {
			'type': 'button',
			'class': 'yandex-internetometer-inline-stop',
			'title': T('Stop test'),
			'click': function() {
				localStartedAt = null;
				return statusCall('stop').then(renderStatus);
			}
		}, '×'));
	}
	else if (hasCurrentRunResult && hasResult(data)) {
		children.push(E('button', {
			'type': 'button',
			'class': 'yandex-internetometer-run-again',
			'click': startTest
		}, T('Run again')));
	}

	return E('div', { 'class': 'yandex-internetometer-session-row' }, children);
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
	hasCurrentRunResult = true;
	metricDisplayValue = {};
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
	var showMetrics = hasVisibleResult(data);
	var readyClass = !data.running && !showMetrics ? ' is-ready' : '';
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
			!showMetrics ? E('button', {
				'type': 'button',
				'class': 'yandex-internetometer-measure-button',
				'click': startTest
			}, T('Measure')) : E('div', { 'class': 'yandex-internetometer-speed-grid' }, [
				speedMetric('is-download', T('Incoming'), '↓', hasValue(data.download_mbps) ? metricNumber(data.download_mbps) : '--', T('Mbps'), phase === 'download'),
				speedMetric('is-upload', T('Outgoing'), '↑', hasValue(data.upload_mbps) ? metricNumber(data.upload_mbps) : '--', T('Mbps'), phase === 'upload'),
				speedMetric('is-ping', T('Latency'), '', hasValue(data.ping_ms) ? metricNumber(data.ping_ms) : '--', T('ms'), phase === 'ping' || phase === 'prepare')
			])
		]),
		renderSessionRow(data, phaseText),
		E('div', { 'class': 'yandex-internetometer-details' }, [
			detailRow(T('Jitter'), detailValues(data)[0]),
			detailRow(T('Ping samples'), detailValues(data)[1]),
			detailRow(T('Streams'), detailValues(data)[2]),
			detailRow(T('Upload streams'), detailValues(data)[3]),
			detailRow(T('Probe servers'), detailValues(data)[4]),
			detailRow(T('Server'), detailValues(data)[5]),
			detailRow(T('Last run'), detailValues(data)[6]),
			detailRow(T('Transfer protocol'), detailValues(data)[7]),
			detailRow(T('Version'), detailValues(data)[8])
		])
	]);
}

function renderStatusKey(data) {
	if (data && data.error)
		return 'error';

	if (data && data.running)
		return 'running';

	if (hasVisibleResult(data))
		return 'result';

	return 'ready';
}

function updateSpeedometerTicks(node, data) {
	var svg = node.querySelector('.yandex-internetometer-progress-svg');
	var progressPath, progress;

	if (!svg)
		return;

	progress = Math.max(0, Math.min(100, gaugeProgress(data)));
	progressPath = svg.querySelector('.yandex-internetometer-progress-path');
	if (progressPath)
		animateValue('progress', progress, 650, function(value) {
			progressPath.setAttribute('style', 'stroke-dasharray:%s 100'.format(value === null ? 0 : value.toFixed(2)));
		});
}

function updateMetricNode(node, selector, key, value, active) {
	var metric = node.querySelector(selector);
	var valueNode, target;

	if (!metric)
		return;

	valueNode = metric.querySelector('.yandex-internetometer-speed-value');
	target = metricFloat(value);
	if (valueNode) {
		if (target === null) {
			if (valueNode.textContent !== '--')
				valueNode.textContent = '--';
			metricDisplayValue[key] = null;
		}
		else {
			animateValue(key, target, 650, function(displayValue) {
				valueNode.textContent = metricNumber(displayValue);
			});
		}
	}

	if (active)
		metric.classList.add('is-active');
	else
		metric.classList.remove('is-active');
}

function updateStatusInPlace(data) {
	var phaseTextNode, phase, values, rows, i, strongNode, ipNode;

	if (!statusBox || !statusBox.firstElementChild)
		return false;

	phase = activePhase(data);
	phaseTextNode = statusBox.querySelector('.yandex-internetometer-phase-text');
	if (phaseTextNode)
		phaseTextNode.textContent = data && data.running ? runningPhase(data, runningElapsed(data)) : gaugeStateText(data);

	phaseTextNode = statusBox.querySelector('.yandex-internetometer-session-phase');
	if (phaseTextNode)
		phaseTextNode.textContent = data && data.running ? runningPhase(data, runningElapsed(data)) : gaugeStateText(data);

	ipNode = statusBox.querySelector('.yandex-internetometer-router-ip strong');
	if (ipNode && ipNode.textContent !== (hasValue(data.public_ip) ? data.public_ip : '--'))
		ipNode.textContent = hasValue(data.public_ip) ? data.public_ip : '--';

	updateSpeedometerTicks(statusBox, data);
	updateMetricNode(statusBox, '.yandex-internetometer-speed-metric.is-download', 'download', hasValue(data.download_mbps) ? data.download_mbps : null, phase === 'download');
	updateMetricNode(statusBox, '.yandex-internetometer-speed-metric.is-upload', 'upload', hasValue(data.upload_mbps) ? data.upload_mbps : null, phase === 'upload');
	updateMetricNode(statusBox, '.yandex-internetometer-speed-metric.is-ping', 'ping', hasValue(data.ping_ms) ? data.ping_ms : null, phase === 'ping' || phase === 'prepare');

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
	if (statusData.running)
		hasCurrentRunResult = true;
	if (!statusData.running)
		localStartedAt = null;

	nextLayoutKey = renderStatusKey(statusData);
	if (statusLayoutKey === nextLayoutKey && nextLayoutKey !== 'error' && updateStatusInPlace(statusData))
		return;

	statusLayoutKey = nextLayoutKey;

	var children = [];
	var updateNotice = renderUpdateNotice();

	if (statusData.error) {
		children.push(E('div', { 'class': 'alert-message warning' }, statusData.error));
	}
	if (statusData.https_fallback)
		children.push(E('div', { 'class': 'alert-message warning' }, T('HTTP fallback: router CPU/TLS may limit the result.')));
	if (updateNotice)
		children.push(updateNotice);

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
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('yandex-internetometer'),
				statusCall('status'),
				fs.exec_direct('/usr/libexec/yandex-internetometer/update-check', [], 'json').catch(function() { return null; })
		]);
	},

	render: function(data) {
		var m, s, o;

		statusData = data[1] || {};
		updateData = data[2] || null;

		m = new form.Map('yandex-internetometer', T('Settings'));
		s = m.section(form.NamedSection, 'main', 'settings');
		s.anonymous = true;

		o = s.option(form.Value, 'streams', T('Stream count'));
		o.datatype = 'range(1, 8)';
		o.rmempty = false;

		o = s.option(form.ListValue, 'upload_streams', T('Upload stream count'));
		o.value('auto', 'auto');
		o.value('1', '1');
		o.value('2', '2');
		o.value('4', '4');
		o.value('8', '8');
		o.value('12', '12');
		o.default = 'auto';
		o.rmempty = false;

		o = s.option(form.ListValue, 'transfer_protocol', T('Transfer protocol mode'));
		o.value('auto', 'auto');
		o.value('http', 'http');
		o.value('https', 'https');
		o.default = 'auto';
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
		o.datatype = 'range(1024, 200000000)';
		o.rmempty = false;
		o.description = T('Bytes per upload request. The payload is prepared in /tmp before measurement and is not stored on flash.');

		o = s.option(form.Flag, 'upload_enabled', T('Enable upload test'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'debug', T('Debug mode'));
		o.default = '0';
		o.rmempty = false;

		return m.render().then(function(formNode) {
			statusBox = E('div');
			actionBox = E('div', { 'class': 'yandex-internetometer-actions' });

			var node = E('div', { 'class': 'yandex-internetometer-page' }, [
				E('style', {}, [
					'.yandex-internetometer-page{--yi-bg:#fbfaf8;--yi-panel:#f0efec;--yi-border:rgba(35,35,35,.12);--yi-muted:#6f6f6f;--yi-text:#252528;--yi-red:#ff5138;--yi-red-soft:rgba(255,81,56,.12);--yi-green:#20a464;font-family:"YS Text",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}',
					'.yandex-internetometer-topbar{display:flex;justify-content:flex-start;margin:0 0 10px}',
					'.yandex-internetometer-language{min-height:34px;border:1px solid var(--yi-border);border-radius:8px;background:rgba(255,255,255,.7);color:var(--yi-text);padding:6px 12px;cursor:pointer}',
					'.yandex-internetometer-actions{display:none}',
					'.yandex-internetometer-hero{display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;gap:16px;margin:10px 0 18px;padding:10px 10px 18px;background:var(--yi-bg);color:var(--yi-text);overflow:hidden}',
					'.yandex-internetometer-brandline{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;color:var(--yi-muted);font-size:13px}',
					'.yandex-internetometer-brandline strong{font-size:16px;color:var(--yi-text);font-weight:700}',
					'.yandex-internetometer-brandline span{text-align:right;overflow-wrap:anywhere}',
					'.yandex-internetometer-oval{position:relative;width:min(957px,100%);aspect-ratio:957/392;margin:0 auto;display:grid;place-items:center}',
					'.yandex-internetometer-speedometer-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
					'.yandex-internetometer-speedometer-reference{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:contain}',
					'.yandex-internetometer-progress-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}',
					'.yandex-internetometer-progress-path{fill:none;stroke:var(--yi-red);stroke-width:8;stroke-linecap:butt;opacity:1}',
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
					'.yandex-internetometer-session-row{display:flex;align-items:center;justify-content:center;gap:16px;min-height:36px;color:var(--yi-text);font-size:16px;line-height:1.2;flex-wrap:wrap}',
					'.yandex-internetometer-router-ip{display:flex;align-items:center;gap:8px;color:var(--yi-muted)}',
					'.yandex-internetometer-router-ip strong{color:var(--yi-text);font-weight:500;font-variant-numeric:tabular-nums}',
					'.yandex-internetometer-session-phase{color:var(--yi-muted)}',
					'.yandex-internetometer-inline-stop{border:0;background:transparent;color:var(--yi-text);font-size:24px;line-height:1;cursor:pointer;padding:0 4px}',
					'.yandex-internetometer-run-again{border:0;border-radius:10px;background:#fcdb32;color:#242424;font-weight:700;min-height:36px;padding:8px 16px;cursor:pointer}',
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
					'.yandex-internetometer-settings{margin-top:16px;border:1px solid var(--yi-border);border-radius:8px;background:rgba(255,255,255,.45);overflow:hidden}',
					'.yandex-internetometer-settings>summary{cursor:pointer;padding:12px 14px;font-weight:600;color:var(--yi-text)}',
					'.yandex-internetometer-settings>*:not(summary){padding:0 14px 14px}',
					'@media (max-width:900px){.yandex-internetometer-speed-metric{width:160px}.yandex-internetometer-speed-label{font-size:17px}.yandex-internetometer-speed-value{font-size:48px}.yandex-internetometer-speed-unit{font-size:17px}.yandex-internetometer-svg-label{font-size:22px}.yandex-internetometer-svg-tick{stroke-width:3}.yandex-internetometer-svg-tick.is-major{stroke-width:3.4}}',
					'@media (max-width:680px){.yandex-internetometer-hero{padding:16px 4px}.yandex-internetometer-brandline{align-items:flex-start;flex-direction:column;gap:6px}.yandex-internetometer-brandline span{text-align:left}.yandex-internetometer-oval{aspect-ratio:1.28/1;overflow:hidden}.yandex-internetometer-speedometer-svg{width:190%;height:100%;left:-45%;right:auto}.yandex-internetometer-speed-metric{top:auto;width:213px;transform:translateX(-50%)}.yandex-internetometer-speed-metric.is-download{left:50%;top:24%}.yandex-internetometer-speed-metric.is-upload{left:50%;top:48%}.yandex-internetometer-speed-metric.is-ping{left:50%;top:72%}.yandex-internetometer-speed-metric.is-active{transform:translateX(-50%)}.yandex-internetometer-speed-label{font-size:15px}.yandex-internetometer-speed-value{font-size:32px;margin:4px 0}.yandex-internetometer-speed-unit{font-size:15px}.yandex-internetometer-svg-label{display:none}.yandex-internetometer-stages,.yandex-internetometer-details{grid-template-columns:1fr}.yandex-internetometer-detail-row:nth-last-child(-n+2){border-bottom:1px solid var(--yi-border)}.yandex-internetometer-detail-row:last-child{border-bottom:0}.yandex-internetometer-detail-row span{white-space:normal}}',
				].join('')),
				E('div', { 'class': 'yandex-internetometer-topbar' }, [
					E('button', {
						'type': 'button',
						'class': 'yandex-internetometer-language',
						'title': T('Switch application language'),
						'click': function() {
							storeLanguage(appLanguage === 'ru' ? 'en' : 'ru');
							window.location.reload();
						}
					}, appLanguage === 'ru' ? 'English' : 'Русский')
				]),
				E('h2', {}, T('Yandex Internetometer')),
				E('p', {}, T('Unofficial Yandex Internetometer-compatible speed test using Yandex probe servers. This is not official Yandex software.')),
				statusBox,
				actionBox,
				E('details', { 'class': 'yandex-internetometer-settings' }, [
					E('summary', {}, T('Settings')),
					formNode
				])
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
