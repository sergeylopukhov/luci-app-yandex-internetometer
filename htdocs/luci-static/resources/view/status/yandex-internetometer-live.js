'use strict';
'require view';
'require fs';
'require form';
'require uci';
'require poll';

var statusBox;
var actionBox;
var historyBox;
var updateCheckButton;
var statusData = null;
var historyData = [];
var historyPeriodDays = 30;
var localStartedAt = null;
var hasCurrentRunResult = false;
var statusLayoutKey = null;
var updateData = null;
var metricAnimationFrame = {};
var metricDisplayValue = {};
var metricSmoothedValue = {};
var languageStorageKey = 'yandexInternetometerLanguage';
var themeStorageKey = 'yandexInternetometerTheme';
var updateCommand = 'curl -fsSL https://sergeylopukhov.github.io/luci-app-yandex-internetometer/install.sh | sh -s -- --yes';
var translations = {
	ru: {
		'Bytes per upload request. The payload is prepared in /tmp before measurement and is not stored on flash.': 'Байт на один исходящий запрос. Payload готовится в /tmp перед измерением и не сохраняется во flash.',
		'Checking latency': 'Проверка задержки',
		'Choose how the test connects to the Yandex CDN. Auto uses HTTP and securely falls back to HTTPS if needed.': 'Как подключаться к CDN Яндекса. «Авто» использует HTTP и при необходимости безопасно переходит на HTTPS.',
		'Complete': 'Готово',
		'Current stage: %s': 'Текущий этап: %s',
		'Diagnostic log': 'Журнал диагностики',
		'Writes additional troubleshooting messages to /var/run/yandex-internetometer/debug.log. Enable it only while diagnosing a problem; the log is removed after reboot.': 'Записывает дополнительные сведения в /var/run/yandex-internetometer/debug.log. Включайте только для поиска неполадок: после перезагрузки журнал удаляется.',
		'Download': 'Скачивание',
		'Download duration': 'Длительность входящего теста',
		'Number of parallel download requests. Six streams are the default for a fuller channel load.': 'Параллельные запросы на скачивание. Шесть потоков используются по умолчанию для более полной загрузки канала.',
		'Download speed': 'Входящая скорость',
		'Average download': 'Средняя входящая',
		'Average upload': 'Средняя исходящая',
		'Average ping': 'Средний пинг',
		'Clear history': 'Очистить историю',
		'Compare with previous period': 'Сравнение с предыдущим периодом',
		'Date and time': 'Дата и время',
		'Elapsed: %s seconds': 'Прошло: %s с',
		'Enable upload test': 'Включить исходящий тест',
		'Export CSV': 'Экспорт CSV',
		'Export JSON': 'Экспорт JSON',
		'Finishing the test': 'Завершение теста',
		'HTTP RTT': 'HTTP RTT',
		'History': 'История измерений',
		'History is empty. Run a test to see the graph and period comparison.': 'История пока пуста. Запустите тест, чтобы увидеть график и сравнение периодов.',
		'Incoming': 'Входящая',
		'Incoming, Mbps': 'Входящая, Мбит/с',
		'Jitter': 'Джиттер',
		'Last run': 'Последний запуск',
		'Latency': 'Задержка',
		'Latency sample count': 'Количество замеров задержки',
		'More samples make the latency result steadier but take longer.': 'Больше замеров дают более устойчивый результат, но занимают больше времени.',
		'Measure': 'Измерить',
		'Mbps': 'Мбит/с',
		'Measuring download speed': 'Измерение входящей скорости',
		'Measuring upload speed': 'Измерение исходящей скорости',
		'Not available': 'Нет данных',
		'Ping': 'Пинг',
		'Ping, ms': 'Пинг, мс',
		'Previous period': 'Предыдущий период',
		'Records': 'Измерений',
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
		'Current period': 'Текущий период',
		'Last 7 days': 'Последние 7 дней',
		'Last 30 days': 'Последние 30 дней',
		'Last 90 days': 'Последние 90 дней',
		'Delete all saved measurements?': 'Удалить все сохранённые измерения?',
		'Streams': 'Потоки',
		'Switch application language': 'Сменить язык приложения',
		'Switch color theme': 'Сменить тему оформления',
		'Dark theme': 'Тёмная тема',
		'Light theme': 'Светлая тема',
		'Unable to execute backend command': 'Не удалось выполнить backend-команду',
		'Unofficial Yandex Internetometer-compatible speed test using Yandex probe servers. This is not official Yandex software.': 'Неофициальный совместимый с Яндекс Интернетометром тест скорости через probe-серверы Яндекса. Это не официальное ПО Яндекса.',
		'Outgoing': 'Исходящая',
		'Outgoing, Mbps': 'Исходящая, Мбит/с',
		'Ping samples': 'Замеров задержки',
		'Upload': 'Загрузка',
		'Upload duration': 'Длительность исходящего теста',
		'Upload payload size': 'Размер исходящего payload',
		'Upload speed': 'Исходящая скорость',
		'Upload stream count': 'Количество исходящих потоков',
		'Auto adjusts the upload load to the router. Use a fixed value only for comparison tests.': '«Авто» подбирает нагрузку для роутера. Фиксированное значение нужно только для сравнения тестов.',
		'Upload streams': 'Исходящие потоки',
		'Transfer protocol': 'Транспорт теста',
		'Transfer protocol mode': 'Режим транспорта',
		'HTTP fallback: router CPU/TLS may limit the result.': 'HTTP недоступен: результат может быть ограничен CPU/TLS роутера.',
		'Update available': 'Доступно обновление',
		'Installed version %s': 'Установлена версия %s',
		'Open release': 'Открыть выпуск',
		'Check for updates': 'Проверить обновление',
		'Checking for updates': 'Проверяем обновление…',
		'No updates available': 'Установлена актуальная версия',
		'Copy command': 'Скопировать команду',
		'Command copied': 'Команда скопирована',
		'Update command': 'Команда обновления',
		'Unable to check updates. Check the connection and try again.': 'Не удалось проверить обновление. Проверьте подключение и попробуйте снова.',
		'Yandex Internetometer': 'Яндекс Интернетометр',
		'ms': 'мс'
	}
};
var appLanguage = readStoredLanguage() || 'ru';
var appTheme = readStoredTheme() || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

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

function readStoredTheme() {
	try {
		var theme = window.localStorage.getItem(themeStorageKey);
		if (theme === 'light' || theme === 'dark')
			return theme;
	}
	catch (e) {}

	return null;
}

function storeTheme(theme) {
	try {
		window.localStorage.setItem(themeStorageKey, theme);
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

function easeInOutSine(value) {
	return -(Math.cos(Math.PI * value) - 1) / 2;
}

function animateValue(key, target, duration, onFrame) {
	var start = metricDisplayValue[key];
	var startedAt = Date.now();

	if (target === null || target === undefined || isNaN(target)) {
		if (metricAnimationFrame[key])
			window.cancelAnimationFrame(metricAnimationFrame[key]);
		metricAnimationFrame[key] = null;
		metricDisplayValue[key] = null;
		onFrame(null);
		return;
	}

	if (start === null || start === undefined || isNaN(start))
		start = target;
	if (metricAnimationFrame[key])
		window.cancelAnimationFrame(metricAnimationFrame[key]);
	metricAnimationFrame[key] = null;
	if (duration <= 0) {
		metricDisplayValue[key] = target;
		onFrame(target);
		return;
	}
	function frame() {
		var elapsed = Date.now() - startedAt;
		var progress = Math.min(1, elapsed / duration);
		var value = start + (target - start) * easeInOutSine(progress);

		metricDisplayValue[key] = value;
		onFrame(value);

		if (progress < 1)
			metricAnimationFrame[key] = window.requestAnimationFrame(frame);
		else
			metricAnimationFrame[key] = null;
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

function historyCall(command) {
	return fs.exec_direct('/usr/libexec/yandex-internetometer/' + (command || 'history'), [], 'json').then(function(data) {
		return data && Array.isArray(data.records) ? data.records : [];
	}).catch(function() {
		return [];
	});
}

function historyRefresh() {
	return historyCall('history').then(function(records) {
		historyData = records;
		renderHistory();
		return records;
	});
}

function historyNumber(value) {
	var number = Number(value);
	return isFinite(number) ? number : null;
}

function historyAverage(records, key) {
	var values = records.map(function(record) { return historyNumber(record[key]); }).filter(function(value) { return value !== null; });
	if (!values.length)
		return null;
	return values.reduce(function(sum, value) { return sum + value; }, 0) / values.length;
}

function historyPeriod(records, days, offset) {
	var end = Date.now() - (offset || 0) * days * 86400000;
	var start = end - days * 86400000;
	return records.filter(function(record) {
		var time = Date.parse(record.timestamp);
		return !isNaN(time) && time >= start && time < end;
	});
}

function historyDelta(current, previous, lowerIsBetter) {
	if (current === null || previous === null || previous === 0)
		return '—';
	var delta = (current - previous) / previous * 100;
	var improved = lowerIsBetter ? delta < 0 : delta > 0;
	return (delta > 0 ? '+' : '') + delta.toFixed(1) + '% ' + (improved ? '↑' : delta === 0 ? '→' : '↓');
}

function historyMetric(title, current, previous, unit, lowerIsBetter) {
	return E('div', { 'class': 'yandex-internetometer-history-metric' }, [
		E('span', {}, title),
		E('strong', {}, current === null ? '—' : current.toFixed(1) + ' ' + unit),
		E('small', {}, T('Compare with previous period') + ': ' + historyDelta(current, previous, lowerIsBetter))
	]);
}

function historyChart(records) {
	var width = 900, height = 260, pad = 28;
	var values = [], max, points, downloadPoints, uploadPoints;
	records.forEach(function(record) {
		var download = historyNumber(record.download_mbps), upload = historyNumber(record.upload_mbps);
		if (download !== null) values.push(download);
		if (upload !== null) values.push(upload);
	});
	max = Math.max.apply(Math, values.concat([1]));
	function series(key) {
		return records.map(function(record, index) {
			var value = historyNumber(record[key]);
			if (value === null) return null;
			var x = records.length === 1 ? width / 2 : pad + index * (width - pad * 2) / (records.length - 1);
			var y = height - pad - value / max * (height - pad * 2);
			return { x: x, y: y };
		}).filter(function(point) { return point !== null; });
	}
	downloadPoints = series('download_mbps');
	uploadPoints = series('upload_mbps');
	points = [
		svgNode('line', { x1: pad, y1: height - pad, x2: width - pad, y2: height - pad, 'class': 'yandex-internetometer-chart-axis' }),
		svgNode('polyline', { points: downloadPoints.map(function(point) { return point.x.toFixed(1) + ',' + point.y.toFixed(1); }).join(' '), 'class': 'yandex-internetometer-chart-line is-download' }),
		svgNode('polyline', { points: uploadPoints.map(function(point) { return point.x.toFixed(1) + ',' + point.y.toFixed(1); }).join(' '), 'class': 'yandex-internetometer-chart-line is-upload' })
	].concat(downloadPoints.map(function(point) { return svgNode('circle', { cx: point.x, cy: point.y, r: 4, 'class': 'yandex-internetometer-chart-point is-download' }); }))
		.concat(uploadPoints.map(function(point) { return svgNode('circle', { cx: point.x, cy: point.y, r: 4, 'class': 'yandex-internetometer-chart-point is-upload' }); }));
	return E('div', { 'class': 'yandex-internetometer-chart' }, [
		svgNode('svg', { viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'none', role: 'img', 'aria-label': T('History') }, points),
		E('div', { 'class': 'yandex-internetometer-chart-legend' }, [
			E('span', { 'class': 'is-download' }, T('Incoming')),
			E('span', { 'class': 'is-upload' }, T('Outgoing'))
		])
	]);
}

function historyCsv(records) {
	var fields = ['timestamp', 'download_mbps', 'upload_mbps', 'ping_ms', 'jitter_ms', 'streams', 'upload_streams', 'server', 'transfer_protocol', 'version'];
	function cell(value) { return '"' + String(value === null || value === undefined ? '' : value).replace(/"/g, '""') + '"'; }
	return fields.join(',') + '\n' + records.map(function(record) { return fields.map(function(field) { return cell(record[field]); }).join(','); }).join('\n');
}

function downloadHistory(records, type) {
	var content = type === 'csv' ? '\ufeff' + historyCsv(records) : JSON.stringify(records, null, 2);
	var blob = new Blob([content], { type: type === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
	var url = URL.createObjectURL(blob), link = document.createElement('a');
	link.href = url;
	link.download = 'yandex-internetometer-history.' + type;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

function renderHistory() {
	var current, previous, rows;
	if (!historyBox)
		return;
	current = historyPeriod(historyData, historyPeriodDays, 0).sort(function(a, b) { return Date.parse(a.timestamp) - Date.parse(b.timestamp); });
	previous = historyPeriod(historyData, historyPeriodDays, 1);
	rows = current.slice().reverse().slice(0, 10);
	historyBox.innerHTML = '';
	historyBox.appendChild(E('div', { 'class': 'yandex-internetometer-history-head' }, [
		E('div', {}, [E('h3', {}, T('History')), E('span', {}, T('Records') + ': ' + current.length)]),
		E('select', { 'change': function(ev) { historyPeriodDays = Number(ev.target.value); renderHistory(); } }, [
			E('option', { value: '7', selected: historyPeriodDays === 7 ? '' : null }, T('Last 7 days')),
			E('option', { value: '30', selected: historyPeriodDays === 30 ? '' : null }, T('Last 30 days')),
			E('option', { value: '90', selected: historyPeriodDays === 90 ? '' : null }, T('Last 90 days'))
		])
	]));
	if (!current.length) {
		historyBox.appendChild(E('p', { 'class': 'yandex-internetometer-history-empty' }, T('History is empty. Run a test to see the graph and period comparison.')));
		return;
	}
	historyBox.appendChild(historyChart(current));
	historyBox.appendChild(E('div', { 'class': 'yandex-internetometer-history-metrics' }, [
		historyMetric(T('Average download'), historyAverage(current, 'download_mbps'), historyAverage(previous, 'download_mbps'), T('Mbps'), false),
		historyMetric(T('Average upload'), historyAverage(current, 'upload_mbps'), historyAverage(previous, 'upload_mbps'), T('Mbps'), false),
		historyMetric(T('Average ping'), historyAverage(current, 'ping_ms'), historyAverage(previous, 'ping_ms'), T('ms'), true)
	]));
	historyBox.appendChild(E('div', { 'class': 'yandex-internetometer-history-actions' }, [
		E('button', { type: 'button', 'class': 'btn', click: function() { downloadHistory(current, 'csv'); } }, T('Export CSV')),
		E('button', { type: 'button', 'class': 'btn', click: function() { downloadHistory(current, 'json'); } }, T('Export JSON')),
		E('button', { type: 'button', 'class': 'btn', click: function() { if (window.confirm(T('Delete all saved measurements?'))) historyCall('history-clear').then(historyRefresh); } }, T('Clear history'))
	]));
	historyBox.appendChild(E('div', { 'class': 'yandex-internetometer-history-table-wrap' }, [
		E('table', { 'class': 'table yandex-internetometer-history-table' }, [
			E('thead', {}, E('tr', {}, [T('Date and time'), T('Incoming, Mbps'), T('Outgoing, Mbps'), T('Ping, ms')].map(function(label) { return E('th', {}, label); }))),
			E('tbody', {}, rows.map(function(record) { return E('tr', {}, [
				E('td', {}, new Date(record.timestamp).toLocaleString(appLanguage === 'ru' ? 'ru-RU' : 'en-US')),
				E('td', {}, historyNumber(record.download_mbps) === null ? '—' : Number(record.download_mbps).toFixed(1)),
				E('td', {}, historyNumber(record.upload_mbps) === null ? '—' : Number(record.upload_mbps).toFixed(1)),
				E('td', {}, historyNumber(record.ping_ms) === null ? '—' : Number(record.ping_ms).toFixed(1))
			]); }))
		])
	]));
}

function updateCheck() {
	if (updateCheckButton) {
		updateCheckButton.disabled = true;
		updateCheckButton.textContent = T('Checking for updates');
	}
	return fs.exec_direct('/usr/libexec/yandex-internetometer/update-check', [], 'json').then(function(data) {
		updateData = data || { ok: false };
		updateData.manualCheck = true;
		statusLayoutKey = null;
		renderStatus(statusData);
		if (updateCheckButton) {
			updateCheckButton.disabled = false;
			updateCheckButton.textContent = T('Check for updates');
		}
		return updateData;
	}).catch(function() {
		updateData = { ok: false, manual: true };
		statusLayoutKey = null;
		renderStatus(statusData);
		if (updateCheckButton) {
			updateCheckButton.disabled = false;
			updateCheckButton.textContent = T('Check for updates');
		}
	});
}

function copyUpdateCommand(button) {
	function copied() {
		button.textContent = T('Command copied');
		window.setTimeout(function() { button.textContent = T('Copy command'); }, 1800);
	}
	function fallback() {
		var input = document.createElement('textarea');
		input.value = updateCommand;
		input.setAttribute('readonly', '');
		input.style.position = 'fixed';
		input.style.opacity = '0';
		document.body.appendChild(input);
		input.select();
		document.execCommand('copy');
		document.body.removeChild(input);
		copied();
	}
	if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText)
		return navigator.clipboard.writeText(updateCommand).then(copied).catch(fallback);
	fallback();
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
		return updateData.manualCheck ? E('div', { 'class': 'alert-message notice yandex-internetometer-update is-current' }, [
			E('strong', {}, T('No updates available')),
			E('span', {}, T('Installed version %s').format(updateData.installed_version || ''))
		]) : null;
	release = updateData.release || {};
	return E('div', { 'class': 'alert-message notice yandex-internetometer-update' }, [
		E('strong', {}, '%s %s'.format(T('Update available'), release.version || '')),
		E('span', {}, T('Installed version %s').format(updateData.installed_version || '')),
		E('a', { 'class': 'btn cbi-button', 'href': release.release_url || 'https://github.com/sergeylopukhov/luci-app-yandex-internetometer/releases/latest', 'target': '_blank', 'rel': 'noopener' }, T('Open release')),
		E('div', { 'class': 'yandex-internetometer-update-command' }, [
			E('span', {}, T('Update command')),
			E('div', { 'class': 'yandex-internetometer-update-command-row' }, [
				E('code', {}, updateCommand),
				E('button', { 'type': 'button', 'class': 'btn cbi-button', 'click': function(ev) { return copyUpdateCommand(ev.currentTarget); } }, T('Copy command'))
			])
		])
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
	metricSmoothedValue = {};
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
		animateValue('progress', progress, 1200, function(value) {
			progressPath.setAttribute('style', 'stroke-dasharray:%s 100'.format(value === null ? 0 : value.toFixed(2)));
		});
}

function smoothedMetric(key, target, running) {
	var previous = metricSmoothedValue[key];

	if (!running || previous === null || previous === undefined || isNaN(previous)) {
		metricSmoothedValue[key] = target;
		return target;
	}

	metricSmoothedValue[key] = previous + (target - previous) * 0.38;
	return metricSmoothedValue[key];
}

function updateMetricNode(node, selector, key, value, active, running) {
	var metric = node.querySelector(selector);
	var valueNode, target, displayTarget;

	if (!metric)
		return;

	valueNode = metric.querySelector('.yandex-internetometer-speed-value');
	target = metricFloat(value);
	if (valueNode) {
		if (target === null) {
			if (valueNode.textContent !== '--')
				valueNode.textContent = '--';
			metricDisplayValue[key] = null;
			metricSmoothedValue[key] = null;
		}
		else {
			displayTarget = smoothedMetric(key, target, running && active);
			animateValue(key, displayTarget, running && active ? 1200 : 0, function(displayValue) {
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
	updateMetricNode(statusBox, '.yandex-internetometer-speed-metric.is-download', 'download', hasValue(data.download_mbps) ? data.download_mbps : null, phase === 'download', !!data.running);
	updateMetricNode(statusBox, '.yandex-internetometer-speed-metric.is-upload', 'upload', hasValue(data.upload_mbps) ? data.upload_mbps : null, phase === 'upload', !!data.running);
	updateMetricNode(statusBox, '.yandex-internetometer-speed-metric.is-ping', 'ping', hasValue(data.ping_ms) ? data.ping_ms : null, phase === 'ping' || phase === 'prepare', !!data.running);

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
	var wasRunning = !!(statusData && statusData.running);

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

	if (wasRunning && !statusData.running && hasResult(statusData))
		historyRefresh();
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
				fs.exec_direct('/usr/libexec/yandex-internetometer/update-check', [], 'json').catch(function() { return null; }),
				historyCall('history')
		]);
	},

	render: function(data) {
		var m, s, o;

		statusData = data[1] || {};
		updateData = data[2] || null;
		historyData = data[3] || [];

		m = new form.Map('yandex-internetometer');
		s = m.section(form.NamedSection, 'main', 'settings');
		s.anonymous = true;

		o = s.option(form.Value, 'streams', T('Stream count'));
		o.datatype = 'range(1, 8)';
		o.rmempty = false;
		o.default = '6';
		o.description = T('Number of parallel download requests. Six streams are the default for a fuller channel load.');

		o = s.option(form.ListValue, 'upload_streams', T('Upload stream count'));
		o.value('auto', 'auto');
		o.value('1', '1');
		o.value('2', '2');
		o.value('4', '4');
		o.value('6', '6');
		o.value('8', '8');
		o.value('12', '12');
		o.default = '6';
		o.rmempty = false;
		o.description = T('Auto adjusts the upload load to the router. Use a fixed value only for comparison tests.');

		o = s.option(form.ListValue, 'transfer_protocol', T('Transfer protocol mode'));
		o.value('auto', 'auto');
		o.value('http', 'http');
		o.value('https', 'https');
		o.default = 'http';
		o.rmempty = false;
		o.description = T('Choose how the test connects to the Yandex CDN. Auto uses HTTP and securely falls back to HTTPS if needed.');

		o = s.option(form.Value, 'download_time', T('Download duration'));
		o.datatype = 'range(1, 60)';
		o.default = '15';
		o.rmempty = false;
		o.description = T('Seconds.');

		o = s.option(form.Value, 'upload_time', T('Upload duration'));
		o.datatype = 'range(1, 60)';
		o.default = '25';
		o.rmempty = false;
		o.description = T('Seconds.');

		o = s.option(form.Value, 'latency_samples', T('Latency sample count'));
		o.datatype = 'range(25, 120)';
		o.default = '60';
		o.rmempty = false;
		o.description = T('More samples make the latency result steadier but take longer.');

		o = s.option(form.Value, 'upload_size', T('Upload payload size'));
		o.datatype = 'range(1024, 200000000)';
		o.default = '8000000';
		o.rmempty = false;
		o.description = T('Bytes per upload request. The payload is prepared in /tmp before measurement and is not stored on flash.');

		o = s.option(form.Flag, 'upload_enabled', T('Enable upload test'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'debug', T('Diagnostic log'));
		o.default = '0';
		o.rmempty = false;
		o.description = T('Writes additional troubleshooting messages to /var/run/yandex-internetometer/debug.log. Enable it only while diagnosing a problem; the log is removed after reboot.');

		return m.render().then(function(formNode) {
			statusBox = E('div');
			actionBox = E('div', { 'class': 'yandex-internetometer-actions' });
			historyBox = E('section', { 'class': 'yandex-internetometer-history' });

			var node = E('div', { 'class': 'yandex-internetometer-page yandex-internetometer-theme-' + appTheme }, [
				E('style', {}, [
					'.yandex-internetometer-page{--yi-bg:#fbfaf8;--yi-panel:#f0efec;--yi-border:rgba(35,35,35,.12);--yi-muted:#6f6f6f;--yi-text:#252528;--yi-red:#ff5138;--yi-red-soft:rgba(255,81,56,.12);--yi-green:#20a464;font-family:"YS Text",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}',
					'.yandex-internetometer-page.yandex-internetometer-theme-dark{--yi-bg:#17191e;--yi-panel:#22262e;--yi-border:rgba(255,255,255,.16);--yi-muted:#aeb5c1;--yi-text:#f5f7fa;--yi-red:#ff725e;--yi-red-soft:rgba(255,114,94,.18);--yi-green:#47c785}',
					'.yandex-internetometer-topbar{display:flex;justify-content:flex-start;gap:8px;margin:0 0 10px}',
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
					'.yandex-internetometer-hero.is-running .yandex-internetometer-speed-value{color:var(--yi-red)}',
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
					'.yandex-internetometer-update{display:flex;flex-wrap:wrap;align-items:center;gap:9px 12px;margin:0 0 14px;padding:12px 14px;border:1px solid #f1b4a8;border-radius:10px;background:#fff4f0;color:#38251f;font-size:14px;line-height:1.4}',
					'.yandex-internetometer-update strong{color:#9d2e1e}',
					'.yandex-internetometer-update a{color:#9d2e1e;font-weight:700}',
					'.yandex-internetometer-update-command{flex:1 0 100%;display:grid;gap:5px;margin-top:2px;color:#514841;font-size:12px}',
					'.yandex-internetometer-update-command-row{display:flex;align-items:stretch;gap:8px}.yandex-internetometer-update-command code{display:block;flex:1 1 auto;min-width:0;max-width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #e3cfc9;border-radius:7px;background:#fff;color:#252528;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:auto;white-space:nowrap}.yandex-internetometer-update-command-row .btn{flex:0 0 auto;border:1px solid #d59e92;border-radius:7px;background:#fff;color:#762b20;font-weight:700;cursor:pointer}.yandex-internetometer-update.is-current{border-color:#a9d8c0;background:#f1fbf5;color:#214d35}.yandex-internetometer-update.is-current strong{color:#167548}',
					'.yandex-internetometer-history{margin:18px 0 0;padding:20px;border:1px solid var(--yi-border);border-radius:12px;background:var(--yi-bg);color:var(--yi-text)}',
					'.yandex-internetometer-history-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.yandex-internetometer-history-head h3{margin:0 0 3px;font-size:20px}.yandex-internetometer-history-head span{color:var(--yi-muted);font-size:13px}.yandex-internetometer-history-head select{min-height:38px;padding:7px 34px 7px 11px;border:1px solid var(--yi-border);border-radius:8px;background:var(--yi-panel);color:var(--yi-text)}',
					'.yandex-internetometer-chart{height:280px;padding:10px 0 4px;border:1px solid var(--yi-border);border-radius:10px;background:var(--yi-panel)}.yandex-internetometer-chart svg{display:block;width:100%;height:235px}.yandex-internetometer-chart-axis{stroke:var(--yi-border);stroke-width:2}.yandex-internetometer-chart-line{fill:none;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.yandex-internetometer-chart-line.is-download{stroke:var(--yi-red)}.yandex-internetometer-chart-line.is-upload{stroke:var(--yi-green)}.yandex-internetometer-chart-point.is-download{fill:var(--yi-red)}.yandex-internetometer-chart-point.is-upload{fill:var(--yi-green)}.yandex-internetometer-chart-legend{display:flex;justify-content:center;gap:22px;font-size:12px}.yandex-internetometer-chart-legend span:before{content:"";display:inline-block;width:16px;height:3px;margin:0 7px 3px 0;background:currentColor}.yandex-internetometer-chart-legend .is-download{color:var(--yi-red)}.yandex-internetometer-chart-legend .is-upload{color:var(--yi-green)}',
					'.yandex-internetometer-history-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}.yandex-internetometer-history-metric{display:grid;gap:5px;padding:13px;border-radius:9px;background:var(--yi-panel)}.yandex-internetometer-history-metric span,.yandex-internetometer-history-metric small{color:var(--yi-muted);font-size:12px}.yandex-internetometer-history-metric strong{font-size:20px;font-variant-numeric:tabular-nums}',
					'.yandex-internetometer-history-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.yandex-internetometer-history-actions .btn{min-height:36px;padding:7px 12px;border:1px solid var(--yi-border);border-radius:8px;background:var(--yi-panel);color:var(--yi-text);cursor:pointer}.yandex-internetometer-history-table-wrap{overflow-x:auto}.yandex-internetometer-history-table{width:100%;font-variant-numeric:tabular-nums}.yandex-internetometer-history-empty{margin:0;color:var(--yi-muted)}',
					'.yandex-internetometer-settings{margin-top:20px;color:#252528}',
					'.yandex-internetometer-settings>summary{cursor:pointer;padding:14px 18px;border-bottom:1px solid #e5e6e8;color:#252528;font-size:16px;font-weight:700;line-height:1.3;list-style-position:inside}',
					'.yandex-internetometer-settings:not([open])>summary{border-bottom:0}',
					'.yandex-internetometer-settings>*:not(summary){padding:0 18px 4px}',
					'.yandex-internetometer-settings .cbi-map,.yandex-internetometer-settings .cbi-section,.yandex-internetometer-settings .cbi-section-node{margin:0;padding:0;border:0;background:transparent;color:#252528 !important}',
					'.yandex-internetometer-settings>.cbi-map{padding:0 18px 4px}',
					'.yandex-internetometer-settings .cbi-value{display:grid;grid-template-columns:minmax(190px,280px) minmax(0,1fr);gap:7px 24px;align-items:start;float:none;width:auto;min-height:0;margin:0;padding:18px 0;border-bottom:1px solid #e8e8ea;background:transparent;color:#252528}',
					'.yandex-internetometer-settings .cbi-value:last-child{border-bottom:0}',
					'.yandex-internetometer-settings .cbi-value-title{float:none;width:auto;min-width:0;margin:0;padding:9px 0 0 20px;color:#252528 !important;font-size:14px;font-weight:700;line-height:1.4;text-align:left}',
					'.yandex-internetometer-settings .cbi-value-field{float:none;width:auto;min-width:0;margin:0;color:#252528 !important}',
					'.yandex-internetometer-settings input:not([type="checkbox"]),.yandex-internetometer-settings select{box-sizing:border-box;width:100%;min-height:42px;margin:0;padding:8px 12px;border:1px solid #b9bcc3;border-radius:8px;background:#fff;color:#202124;font-size:16px;line-height:1.25;box-shadow:none}',
					'.yandex-internetometer-settings input:not([type="checkbox"]):focus,.yandex-internetometer-settings select:focus{border-color:#ff5138;outline:2px solid rgba(255,81,56,.24);outline-offset:1px}',
					'.yandex-internetometer-settings input[type="checkbox"]{width:20px;height:20px;margin:10px 0;accent-color:#ff5138;vertical-align:middle}',
					'.yandex-internetometer-settings .cbi-value-description{grid-column:2;float:none;width:auto;margin:1px 0 0;color:#555b65;font-size:13px;line-height:1.48}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-language{background:#292e38;color:#f5f7fa;border-color:#4b5360}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-update{border-color:#70483f;background:#2d2423;color:#f4ded8}.yandex-internetometer-theme-dark .yandex-internetometer-update strong,.yandex-internetometer-theme-dark .yandex-internetometer-update a{color:#ff9b89}.yandex-internetometer-theme-dark .yandex-internetometer-update-command{color:#d4bdb7}.yandex-internetometer-theme-dark .yandex-internetometer-update-command code{border-color:#5e4843;background:#191b20;color:#f5f7fa}.yandex-internetometer-theme-dark .yandex-internetometer-update-command-row .btn{border-color:#70564f;background:#292e38;color:#ffd0c7}.yandex-internetometer-theme-dark .yandex-internetometer-update.is-current{border-color:#35694e;background:#1e3027;color:#d7f3e3}.yandex-internetometer-theme-dark .yandex-internetometer-update.is-current strong{color:#66d49a}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-settings{color:#f5f7fa}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-settings>summary{border-color:#454d5b;color:#f5f7fa}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-settings .cbi-map,.yandex-internetometer-theme-dark .yandex-internetometer-settings .cbi-section,.yandex-internetometer-theme-dark .yandex-internetometer-settings .cbi-section-node,.yandex-internetometer-theme-dark .yandex-internetometer-settings .cbi-value,.yandex-internetometer-theme-dark .yandex-internetometer-settings .cbi-value-title,.yandex-internetometer-theme-dark .yandex-internetometer-settings .cbi-value-field{color:#f5f7fa !important}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-settings .cbi-value{border-color:#3b4350}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-settings input:not([type="checkbox"]),.yandex-internetometer-theme-dark .yandex-internetometer-settings select{background:#171a20;color:#f5f7fa;border-color:#596272}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-settings .cbi-value-description{color:#b8c0cc}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-details{background:#20242c;border-color:#454d5b}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-detail-row{background:#20242c;border-color:#3b4350}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-detail-row span{color:#b8c0cc}',
					'.yandex-internetometer-theme-dark .yandex-internetometer-detail-row strong{color:#f5f7fa}',
					'@media (max-width:900px){.yandex-internetometer-speed-metric{width:160px}.yandex-internetometer-speed-label{font-size:17px}.yandex-internetometer-speed-value{font-size:48px}.yandex-internetometer-speed-unit{font-size:17px}.yandex-internetometer-svg-label{font-size:22px}.yandex-internetometer-svg-tick{stroke-width:3}.yandex-internetometer-svg-tick.is-major{stroke-width:3.4}}',
					'@media (max-width:680px){.yandex-internetometer-hero{padding:16px 4px}.yandex-internetometer-brandline{align-items:flex-start;flex-direction:column;gap:6px}.yandex-internetometer-brandline span{text-align:left}.yandex-internetometer-oval{aspect-ratio:1.28/1;overflow:hidden}.yandex-internetometer-speedometer-svg{width:190%;height:100%;left:-45%;right:auto}.yandex-internetometer-speed-metric{top:auto;width:213px;transform:translateX(-50%)}.yandex-internetometer-speed-metric.is-download{left:50%;top:24%}.yandex-internetometer-speed-metric.is-upload{left:50%;top:48%}.yandex-internetometer-speed-metric.is-ping{left:50%;top:72%}.yandex-internetometer-speed-metric.is-active{transform:translateX(-50%)}.yandex-internetometer-speed-label{font-size:15px}.yandex-internetometer-speed-value{font-size:32px;margin:4px 0}.yandex-internetometer-speed-unit{font-size:15px}.yandex-internetometer-svg-label{display:none}.yandex-internetometer-stages,.yandex-internetometer-details{grid-template-columns:1fr}.yandex-internetometer-detail-row:nth-last-child(-n+2){border-bottom:1px solid var(--yi-border)}.yandex-internetometer-detail-row:last-child{border-bottom:0}.yandex-internetometer-detail-row span{white-space:normal}.yandex-internetometer-history{padding:14px}.yandex-internetometer-history-head{align-items:stretch;flex-direction:column}.yandex-internetometer-history-metrics{grid-template-columns:1fr}.yandex-internetometer-chart{height:220px}.yandex-internetometer-chart svg{height:176px}.yandex-internetometer-settings{margin-top:16px}.yandex-internetometer-settings>summary{padding:13px 14px}.yandex-internetometer-settings>*:not(summary){padding:0 14px 4px}.yandex-internetometer-settings .cbi-value{grid-template-columns:1fr;gap:7px;padding:16px 0}.yandex-internetometer-settings .cbi-value-title{padding:0 0 0 14px}.yandex-internetometer-settings .cbi-value-description{grid-column:1}.yandex-internetometer-update{align-items:flex-start}.yandex-internetometer-update-command-row{width:100%;flex-direction:column}.yandex-internetometer-update-command code{font-size:11px}.yandex-internetometer-update-command-row .btn{min-height:38px}}',
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
					,
					E('button', {
						'type': 'button',
						'class': 'yandex-internetometer-language',
						'title': T('Switch color theme'),
						'click': function() {
							storeTheme(appTheme === 'dark' ? 'light' : 'dark');
							window.location.reload();
						}
					}, appTheme === 'dark' ? T('Light theme') : T('Dark theme'))
					,
					(updateCheckButton = E('button', {
						'type': 'button',
						'class': 'yandex-internetometer-language',
						'click': updateCheck
					}, T('Check for updates')))
				]),
				E('h2', {}, T('Yandex Internetometer')),
				E('p', {}, T('Unofficial Yandex Internetometer-compatible speed test using Yandex probe servers. This is not official Yandex software.')),
				statusBox,
				actionBox,
				historyBox,
				E('details', { 'class': 'yandex-internetometer-settings' }, [
					E('summary', {}, T('Settings')),
					formNode
				])
			]);

			renderStatus(statusData);
			renderHistory();

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
