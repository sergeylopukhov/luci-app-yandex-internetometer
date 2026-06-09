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
		'Incoming': 'Входящая',
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
		'Outgoing': 'Исходящая',
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

function renderOvalTicks() {
	var ticks = [];
	var total = 132;
	var i, angle, rad, x, y, major, className;

	for (i = 0; i < total; i++) {
		angle = -180 + (360 / total) * i;
		rad = angle * Math.PI / 180;
		x = 50 + 46.5 * Math.cos(rad);
		y = 50 + 41.5 * Math.sin(rad);
		major = i % 22 === 0;
		className = 'yandex-internetometer-tick' + (major ? ' is-major' : '');

		ticks.push(E('span', {
			'class': className,
			'style': 'left:%.4f%%;top:%.4f%%;transform:translate(-50%,-50%) rotate(%.4fdeg)'.format(x, y, angle + 90)
		}));
	}

	return ticks;
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

function renderHero(data) {
	var progress = gaugeProgress(data);
	var elapsed = runningElapsed(data);
	var phaseText = data && data.running ? runningPhase(data, elapsed) : gaugeStateText(data);
	var phase = activePhase(data);
	var runningClass = data && data.running ? ' is-running' : '';
	var tickProgress = Math.max(0, Math.min(100, progress));

	return E('div', {
		'class': 'cbi-section yandex-internetometer-hero' + runningClass,
		'style': '--yi-progress:%s%%'.format(tickProgress)
	}, [
		E('div', { 'class': 'yandex-internetometer-brandline' }, [
			E('strong', {}, T('Yandex Internetometer')),
			E('span', {}, phaseText)
		]),
		E('div', { 'class': 'yandex-internetometer-oval' }, [
			E('div', { 'class': 'yandex-internetometer-ticks' }, renderOvalTicks()),
			E('div', { 'class': 'yandex-internetometer-scale-label is-top' }, '100'),
			E('div', { 'class': 'yandex-internetometer-scale-label is-zero' }, '0'),
			E('div', { 'class': 'yandex-internetometer-scale-label is-max' }, '1000'),
			E('div', { 'class': 'yandex-internetometer-speed-grid' }, [
				speedMetric('is-download', T('Incoming'), '↓', hasValue(data.download_mbps) ? metricNumber(data.download_mbps) : '--', T('Mbps'), phase === 'download'),
				speedMetric('is-upload', T('Outgoing'), '↑', hasValue(data.upload_mbps) ? metricNumber(data.upload_mbps) : '--', T('Mbps'), phase === 'upload'),
				speedMetric('is-ping', T('Latency'), '', hasValue(data.ping_ms) ? metricNumber(data.ping_ms) : '--', T('ms'), phase === 'ping' || phase === 'prepare')
			])
		]),
		renderStagePills(data),
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
					'.yandex-internetometer-page{--yi-bg:#fbfaf8;--yi-panel:#f0efec;--yi-border:rgba(35,35,35,.12);--yi-muted:#6f6f6f;--yi-text:#252528;--yi-red:#ff4b3e;--yi-red-soft:rgba(255,75,62,.12);--yi-green:#20a464;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}',
					'.yandex-internetometer-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:10px 0 18px}',
					'.yandex-internetometer-actions .cbi-button{min-height:40px;border-radius:10px;padding:8px 16px;transition:background-color .18s cubic-bezier(.22,1,.36,1),border-color .18s cubic-bezier(.22,1,.36,1),transform .18s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-actions .cbi-button:hover{transform:translateY(-1px)}',
					'.yandex-internetometer-actions .cbi-button-action{font-weight:700;background:#fcdb32;border-color:#fcdb32;color:#242424}',
					'.yandex-internetometer-hero{display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;gap:18px;margin:12px 0 18px;padding:22px 18px 20px;border-radius:8px;background:var(--yi-bg);border:1px solid var(--yi-border);color:var(--yi-text);overflow:hidden}',
					'.yandex-internetometer-brandline{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;color:var(--yi-muted);font-size:13px}',
					'.yandex-internetometer-brandline strong{font-size:16px;color:var(--yi-text);font-weight:700}',
					'.yandex-internetometer-brandline span{text-align:right;overflow-wrap:anywhere}',
					'.yandex-internetometer-oval{position:relative;width:min(980px,100%);aspect-ratio:2.35/1;margin:0 auto;display:grid;place-items:center}',
					'.yandex-internetometer-ticks{position:absolute;inset:0;animation:yi-enter .45s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-tick{position:absolute;width:3px;height:31px;border-radius:999px;background:var(--yi-red);opacity:.92;transition:height .22s cubic-bezier(.22,1,.36,1),opacity .22s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-tick.is-major{height:52px;width:3px}',
					'.yandex-internetometer-hero.is-running .yandex-internetometer-tick{animation:yi-tick-breathe 1.2s cubic-bezier(.22,1,.36,1) infinite}',
					'.yandex-internetometer-scale-label{position:absolute;color:var(--yi-red);font-size:24px;line-height:1;font-weight:500}',
					'.yandex-internetometer-scale-label.is-top{top:20.5%;left:50%;transform:translateX(-50%)}',
					'.yandex-internetometer-scale-label.is-zero{bottom:10.5%;left:35.4%}',
					'.yandex-internetometer-scale-label.is-max{bottom:10.5%;left:58.2%;transform:translateX(-50%)}',
					'.yandex-internetometer-speed-grid{position:relative;z-index:2;width:min(720px,78%);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:34px;align-items:center;justify-items:center}',
					'.yandex-internetometer-speed-metric{text-align:center;min-width:0;transition:transform .22s cubic-bezier(.22,1,.36,1),opacity .22s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-speed-metric.is-active{transform:translateY(-3px)}',
					'.yandex-internetometer-speed-label{display:flex;align-items:center;justify-content:center;gap:7px;font-size:21px;line-height:1.2;color:var(--yi-text);font-weight:700;white-space:nowrap}',
					'.yandex-internetometer-speed-label b{display:inline-grid;place-items:center;width:19px;height:19px;border-radius:50%;background:var(--yi-text);color:var(--yi-bg);font-size:13px;line-height:1;font-weight:800}',
					'.yandex-internetometer-speed-label b:empty{display:none}',
					'.yandex-internetometer-speed-value{font-size:72px;line-height:1.02;font-weight:500;color:var(--yi-text);font-variant-numeric:tabular-nums;letter-spacing:0;margin-top:14px}',
					'.yandex-internetometer-speed-unit{font-size:22px;line-height:1.15;font-weight:700;color:var(--yi-text);margin-top:12px}',
					'.yandex-internetometer-stages{width:min(720px,100%);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
					'.yandex-internetometer-stage-pill{display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--yi-border);border-radius:8px;padding:8px 9px;text-align:center;font-size:12px;color:var(--yi-muted);background:rgba(255,255,255,.54);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:background-color .2s cubic-bezier(.22,1,.36,1),border-color .2s cubic-bezier(.22,1,.36,1),color .2s cubic-bezier(.22,1,.36,1)}',
					'.yandex-internetometer-stage-dot{width:7px;height:7px;border-radius:50%;background:rgba(35,35,35,.22);flex:0 0 auto}',
					'.yandex-internetometer-stage-pill.is-active{border-color:rgba(255,75,62,.5);color:var(--yi-text);background:var(--yi-red-soft)}',
					'.yandex-internetometer-stage-pill.is-active .yandex-internetometer-stage-dot{background:var(--yi-red);box-shadow:0 0 0 4px rgba(255,75,62,.12)}',
					'.yandex-internetometer-stage-pill.is-done{color:var(--yi-text)}',
					'.yandex-internetometer-stage-pill.is-done .yandex-internetometer-stage-dot{background:var(--yi-green)}',
					'.yandex-internetometer-details{width:min(720px,100%);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border:1px solid var(--yi-border);border-radius:8px;overflow:hidden;background:rgba(255,255,255,.5)}',
					'.yandex-internetometer-detail-row{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;background:rgba(255,255,255,.58);min-width:0;border-bottom:1px solid var(--yi-border)}',
					'.yandex-internetometer-detail-row:nth-last-child(-n+2){border-bottom:0}',
					'.yandex-internetometer-detail-row span{font-size:12px;color:var(--yi-muted);white-space:nowrap}',
					'.yandex-internetometer-detail-row strong{font-size:13px;color:var(--yi-text);font-weight:600;text-align:right;overflow-wrap:anywhere;min-width:0}',
					'@keyframes yi-enter{from{opacity:.45;transform:scale(.985)}to{opacity:1;transform:scale(1)}}',
					'@keyframes yi-tick-breathe{0%,100%{opacity:.78}50%{opacity:1}}',
					'@media (max-width:900px){.yandex-internetometer-speed-grid{gap:18px;width:82%}.yandex-internetometer-speed-label{font-size:17px}.yandex-internetometer-speed-value{font-size:50px}.yandex-internetometer-speed-unit{font-size:18px}.yandex-internetometer-scale-label{font-size:20px}.yandex-internetometer-tick{height:24px}.yandex-internetometer-tick.is-major{height:42px}}',
					'@media (max-width:680px){.yandex-internetometer-hero{padding:18px 10px}.yandex-internetometer-brandline{align-items:flex-start;flex-direction:column;gap:6px}.yandex-internetometer-brandline span{text-align:left}.yandex-internetometer-oval{aspect-ratio:1.28/1}.yandex-internetometer-speed-grid{width:72%;grid-template-columns:1fr;gap:10px}.yandex-internetometer-speed-label{font-size:15px}.yandex-internetometer-speed-value{font-size:36px;margin-top:5px}.yandex-internetometer-speed-unit{font-size:15px;margin-top:4px}.yandex-internetometer-scale-label{display:none}.yandex-internetometer-tick{height:16px;width:2px}.yandex-internetometer-tick.is-major{height:28px}.yandex-internetometer-stages,.yandex-internetometer-details{grid-template-columns:1fr}.yandex-internetometer-detail-row:nth-last-child(-n+2){border-bottom:1px solid var(--yi-border)}.yandex-internetometer-detail-row:last-child{border-bottom:0}.yandex-internetometer-detail-row span{white-space:normal}}',
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
